import { Notification } from "../models/notification.model.js";
import { Project } from "../models/project.model.js";
import { Employee } from "../models/employee.model.js";
import { emitToUser } from "./socket.js";

const toId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value._id?.toString?.() || value.toString?.() || null;
};

const getProjectId = (task) => toId(task?.projectId);

/** Creator + assignees, unique */
const getTaskParticipantIds = (task) => {
  const ids = new Set();
  const creatorId = toId(task?.createdBy);
  if (creatorId) ids.add(creatorId);
  (task?.assignees || []).forEach((a) => {
    const id = toId(a);
    if (id) ids.add(id);
  });
  return [...ids];
};

const STATUS_LABELS = {
  todo: "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  done: "Done",
};

const formatStatus = (status) => STATUS_LABELS[status] || status || "Unknown";

/**
 * Create DB notifications + emit real-time socket events.
 * Skips the actor. Fire-and-forget safe.
 */
const createAndEmitNotifications = async ({
  recipients = [],
  actorId,
  title,
  message,
  type,
  task,
  actor,
  project,
}) => {
  const actorStr = toId(actorId) || "";
  const uniqueRecipients = [
    ...new Set(recipients.map((id) => toId(id)).filter((id) => id && id !== actorStr)),
  ];

  if (!uniqueRecipients.length || !task?._id) return;

  const projectId = getProjectId(task);
  const docs = uniqueRecipients.map((recipient) => ({
    recipient,
    title,
    message,
    type,
    taskId: task._id,
    projectId: projectId || null,
    createdBy: actorStr || null,
    isRead: false,
  }));

  const created = await Notification.insertMany(docs);

  created.forEach((doc) => {
    emitToUser(doc.recipient, "notification:new", {
      _id: doc._id,
      title: doc.title,
      message: doc.message,
      type: doc.type,
      taskId: doc.taskId,
      projectId: doc.projectId,
      isRead: false,
      createdAt: doc.createdAt,
      createdBy: actor
        ? { _id: actor._id, fullName: actor.fullName, image: actor.image }
        : null,
      projectIdPopulated: project
        ? { _id: project._id, name: project.name }
        : null,
    });
  });
};

const loadActorAndProject = async (task, actorId) => {
  const projectId = getProjectId(task);
  const actorStr = toId(actorId);
  const [project, actor] = await Promise.all([
    projectId ? Project.findById(projectId).select("name").lean() : null,
    actorStr ? Employee.findById(actorStr).select("fullName image").lean() : null,
  ]);
  return { project, actor };
};

/**
 * Notify newly assigned users about a task assignment.
 */
export const notifyTaskAssignees = async ({
  task,
  assigneeIds = [],
  assignedBy,
}) => {
  try {
    const { project, actor } = await loadActorAndProject(task, assignedBy);
    const projectName = project?.name || "a project";
    const actorName = actor?.fullName || "Someone";
    const taskTitle = task.title || "Untitled task";

    await createAndEmitNotifications({
      recipients: assigneeIds,
      actorId: assignedBy,
      title: "New task assigned",
      message: `${actorName} assigned you "${taskTitle}" in ${projectName}`,
      type: "TASK_ASSIGNED",
      task,
      actor,
      project,
    });
  } catch (err) {
    console.error("notifyTaskAssignees failed:", err?.message || err);
  }
};

/**
 * Notify creator + assignees when task status changes.
 */
export const notifyTaskStatusChange = async ({
  task,
  oldStatus,
  newStatus,
  changedBy,
}) => {
  try {
    if (!task?._id || !newStatus || oldStatus === newStatus) return;

    const { project, actor } = await loadActorAndProject(task, changedBy);
    const projectName = project?.name || "a project";
    const actorName = actor?.fullName || "Someone";
    const taskTitle = task.title || "Untitled task";

    await createAndEmitNotifications({
      recipients: getTaskParticipantIds(task),
      actorId: changedBy,
      title: "Task status updated",
      message: `${actorName} moved "${taskTitle}" from ${formatStatus(oldStatus)} to ${formatStatus(newStatus)} in ${projectName}`,
      type: "TASK_STATUS",
      task,
      actor,
      project,
    });
  } catch (err) {
    console.error("notifyTaskStatusChange failed:", err?.message || err);
  }
};

/**
 * Notify creator + assignees when a new comment is added.
 */
export const notifyTaskComment = async ({
  task,
  commentedBy,
  commentPreview,
}) => {
  try {
    if (!task?._id) return;

    const { project, actor } = await loadActorAndProject(task, commentedBy);
    const projectName = project?.name || "a project";
    const actorName = actor?.fullName || "Someone";
    const taskTitle = task.title || "Untitled task";
    const preview = (commentPreview || "").slice(0, 80);
    const suffix = preview ? `: "${preview}${commentPreview?.length > 80 ? "…" : ""}"` : "";

    await createAndEmitNotifications({
      recipients: getTaskParticipantIds(task),
      actorId: commentedBy,
      title: "New comment on task",
      message: `${actorName} commented on "${taskTitle}" in ${projectName}${suffix}`,
      type: "TASK_COMMENT",
      task,
      actor,
      project,
    });
  } catch (err) {
    console.error("notifyTaskComment failed:", err?.message || err);
  }
};
