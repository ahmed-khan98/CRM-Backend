import { Task } from "../models/task.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadAttachmentOnCloudinary,
  deleteAttachmentFromCloudinary,
  fetchAttachmentFromCloudinary,
} from "../utils/cloudinary.js";
import {
  isAdmin,
  getDepartmentTeamIds,
  buildTaskVisibilityFilter,
} from "../utils/taskVisibility.js";
import { notifyTaskAssignees, notifyTaskStatusChange, notifyTaskComment } from "../utils/notifyTaskAssignees.js";
import { emitToUsers } from "../utils/socket.js";
import { Notification } from "../models/notification.model.js";

const attachmentUrl = (uploaded) => uploaded?.url || uploaded?.secure_url || null;

/** Uploads every file in `files` to Cloudinary and returns the array of
 * attachment sub-documents to push onto creatorAttachment/assigneeAttachment.
 * Throws with the first failure's message (matches the single-file
 * behaviour callers already expect for surfacing clear errors). */
const uploadAttachments = async (files) => {
  const results = [];
  for (const file of files) {
    const uploaded = await uploadAttachmentOnCloudinary(file);
    if (uploaded?.error) throw new ApiError(413, uploaded.error);
    const url = attachmentUrl(uploaded);
    if (!url) throw new ApiError(500, "File upload failed");
    results.push({
      url,
      originalName: file.originalname,
      publicId: uploaded.public_id,
      resourceType: uploaded.resource_type || "raw",
    });
  }
  return results;
};

const isCreatorDepartmentMember = async (task, userId, userDeptId) => {
  if (!userDeptId || !task?.createdBy) return false;

  const teamIds = await getDepartmentTeamIds(userDeptId, userId);
  return teamIds.includes(task.createdBy.toString());
};

const populateTask = (query) =>
  query
    .populate({ path: "assignees", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate({ path: "createdBy", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("comments.author", "fullName image");

const populateTaskWithProject = (query) =>
  query
    .populate({
      path: "projectId",
      select: "name clientId createdBy",
      populate: [
        {
          path: "clientId",
          select: "name companyName departmentId",
          populate: { path: "departmentId", select: "name" },
        },
        {
          path: "createdBy",
          select: "departmentId",
          populate: { path: "departmentId", select: "name" },
        },
      ],
    })
    .populate({ path: "assignees", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate({ path: "createdBy", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("comments.author", "fullName image");

const parseAssignees = (raw) => {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return raw ? [raw] : []; }
  }
  return [];
};

const EMPTY_COLUMNS = { todo: [], "in-progress": [], "in-review": [], done: [] };

const groupTasksIntoColumns = (tasks) => {
  const columns = { todo: [], "in-progress": [], "in-review": [], done: [] };
  tasks.forEach((t) => { if (columns[t.status]) columns[t.status].push(t); });
  return columns;
};

// ─── GET tasks by project — with visibility rules ──────────────
const getTasksByProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  const visibilityFilter = await buildTaskVisibilityFilter(userId, userRole, userDeptId, {
    projectId,
  });

  const tasks = await populateTask(
    Task.find({ projectId, ...visibilityFilter }).sort({ order: 1, createdAt: 1 })
  ).lean();

  const columns = tasks.length ? groupTasksIntoColumns(tasks) : { ...EMPTY_COLUMNS };

  // Keep both for frontend compatibility (viewingTask sync uses tasks)
  return res.status(200).json(new ApiResponse(200, { tasks, columns }, "Tasks fetched"));
});

// ─── GET all tasks across all projects ───────────────────────
const getAllTasks = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  const visibilityFilter = await buildTaskVisibilityFilter(userId, userRole, userDeptId);

  const tasks = await populateTaskWithProject(
    Task.find(visibilityFilter).sort({ createdAt: -1 })
  ).lean();

  return res.status(200).json(new ApiResponse(200, tasks, "All tasks fetched"));
});

// ─── POST create task ─────────────────────────────────────────
const createTask = asyncHandler(async (req, res) => {
  const { projectId, title, description, priority, dueDate, status } = req.body;
  const assignees = parseAssignees(req.body.assignees) || [];

  if (!projectId || !title) throw new ApiError(400, "projectId and title are required");

  const lastTask = await Task.findOne({ projectId, status: status || "todo" })
    .sort({ order: -1 })
    .select("order")
    .lean();
  const order = lastTask ? lastTask.order + 1 : 0;

  const task = await Task.create({
    projectId,
    title,
    description,
    priority: priority || "medium",
    assignees,
    dueDate: dueDate || null,
    status: status || "todo",
    order,
    createdBy: req.user?._id,
  });

  if (req.files?.length) {
    task.creatorAttachment = await uploadAttachments(req.files);
    await task.save();
  }

  if (assignees.length) {
    await notifyTaskAssignees({
      task,
      assigneeIds: assignees,
      assignedBy: req.user?._id,
    });
  }

  const populated = await populateTask(Task.findById(task._id));
  return res.status(201).json(new ApiResponse(201, populated, "Task created"));
});

// ─── PATCH update task (creator department / admins) ──────────
const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const isCreator = task.createdBy?.toString() === userId;
  const isCreatorDeptMember = await isCreatorDepartmentMember(
    task,
    userId,
    userDeptId
  );

  if (!isAdmin(userRole) && !isCreator && !isCreatorDeptMember) {
    throw new ApiError(
      403,
      "Only members of the creator's department, admin, or subadmin can edit this task"
    );
  }

  const { title, description, priority, dueDate, status } = req.body;
  const assignees = parseAssignees(req.body.assignees);
  const isCreatorDeptAdmin =
    userRole === "DEP_ADMIN" && isCreatorDeptMember;
  const isStatusChanging = Boolean(status && status !== task.status);

  if (
    isStatusChanging &&
    status === "done" &&
    !isAdmin(userRole) &&
    !isCreator &&
    !isCreatorDeptAdmin
  ) {
    throw new ApiError(
      403,
      "Only the task creator or their department admin can mark this task as Done"
    );
  }

  if (
    isStatusChanging &&
    task.status === "done" &&
    !isAdmin(userRole) &&
    !isCreator &&
    !isCreatorDeptAdmin
  ) {
    throw new ApiError(
      403,
      "Done tasks cannot be moved back by other department members"
    );
  }

  const fields = {};
  if (title !== undefined) fields.title = title;
  if (description !== undefined) fields.description = description;
  if (priority) fields.priority = priority;
  if (assignees !== undefined) fields.assignees = assignees;
  if (dueDate !== undefined) fields.dueDate = dueDate || null;
  if (status) fields.status = status;

  let newCreatorAttachments = [];
  if (req.files?.length) {
    newCreatorAttachments = await uploadAttachments(req.files);
  }

  // Mongo update docs can't mix plain fields with operators like $push, so
  // everything goes through explicit $set/$push instead.
  const update = { $set: fields };
  if (newCreatorAttachments.length) {
    update.$push = { creatorAttachment: { $each: newCreatorAttachments } };
  }

  const previousAssigneeIds = (task.assignees || []).map((a) => a.toString());
  const previousStatus = task.status;
  const updated = await populateTask(
    Task.findByIdAndUpdate(id, update, { new: true })
  );

  if (assignees !== undefined) {
    const newlyAssigned = assignees.filter(
      (id) => !previousAssigneeIds.includes(id.toString())
    );
    if (newlyAssigned.length) {
      await notifyTaskAssignees({
        task: updated,
        assigneeIds: newlyAssigned,
        assignedBy: req.user?._id,
      });
    }
  }

  if (isStatusChanging) {
    await notifyTaskStatusChange({
      task: updated,
      oldStatus: previousStatus,
      newStatus: status,
      changedBy: req.user?._id,
    });
  }

  return res.status(200).json(new ApiResponse(200, updated, "Task updated"));
});

// ─── PATCH update task status (drag-drop) ────────────────────
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, order } = req.body;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();
  const userDeptId = req.user.departmentId?.toString();

  if (!status) throw new ApiError(400, "status is required");

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const _isAdmin = isAdmin(userRole);
  const _isCreator = task.createdBy?.toString() === userId;
  const _isAssignee = task.assignees?.some((a) => a.toString() === userId);

  let _isDeptAdminOfAssignee = false;
  let _isDeptAdminOfCreator = false;
  if (userRole === "DEP_ADMIN" && userDeptId) {
    const teamIds = await getDepartmentTeamIds(userDeptId, userId);
    const teamIdSet = new Set(teamIds.map((tid) => tid.toString()));
    _isDeptAdminOfAssignee = task.assignees?.some((a) => teamIdSet.has(a.toString()));
    _isDeptAdminOfCreator = task.createdBy && teamIdSet.has(task.createdBy.toString());
  }

  if (status === "done" && !_isCreator && !_isAdmin && !_isDeptAdminOfCreator) {
    throw new ApiError(
      403,
      "Only the task creator, their department admin, admin, or subadmin can mark a task as Done",
    );
  }

  if (
    task.status === "done" &&
    status !== "done" &&
    !_isAdmin &&
    !_isCreator &&
    !_isDeptAdminOfCreator
  ) {
    throw new ApiError(
      403,
      "Done tasks cannot be moved back by assignees. Contact the task creator.",
    );
  }

  if (!_isAdmin && !_isCreator && !_isAssignee && !_isDeptAdminOfAssignee && !_isDeptAdminOfCreator) {
    throw new ApiError(403, "You do not have permission to move this task");
  }

  const previousStatus = task.status;
  const updated = await populateTask(
    Task.findByIdAndUpdate(id, { status, ...(order !== undefined && { order }) }, { new: true })
  );

  if (previousStatus !== status) {
    await notifyTaskStatusChange({
      task: updated,
      oldStatus: previousStatus,
      newStatus: status,
      changedBy: req.user?._id,
    });
  }

  return res.status(200).json(new ApiResponse(200, updated, "Task status updated"));
});

// ─── POST add comment ─────────────────────────────────────────
const addComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  const plainText = text?.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!plainText) throw new ApiError(400, "Comment text is required");

  const populated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { $push: { comments: { author: req.user._id, text } } },
      { new: true }
    )
  );
  if (!populated) throw new ApiError(404, "Task not found");

  await notifyTaskComment({
    task: populated,
    commentedBy: req.user._id,
    commentPreview: plainText,
  });

  return res.status(201).json(new ApiResponse(201, populated, "Comment added"));
});

// ─── DELETE comment ───────────────────────────────────────────
const deleteComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const comment = task.comments.id(commentId);
  if (!comment) throw new ApiError(404, "Comment not found");

  if (!isAdmin(userRole) && comment.author?.toString() !== userId) {
    throw new ApiError(403, "You can only delete your own comments");
  }

  task.comments.pull(commentId);
  await task.save();

  const populated = await populateTask(Task.findById(id));
  return res.status(200).json(new ApiResponse(200, populated, "Comment deleted"));
});

// ─── PATCH upload creator attachment ─────────────────────────
const uploadCreatorAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const isCreator = task.createdBy?.toString() === userId;
  if (!isAdmin(userRole) && !isCreator) {
    throw new ApiError(403, "Only the task creator, admin, or subadmin can upload the creator attachment");
  }
  if (!req.files?.length) throw new ApiError(400, "No file provided");

  const newAttachments = await uploadAttachments(req.files);

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { $push: { creatorAttachment: { $each: newAttachments } } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Creator attachment uploaded"));
});

// ─── DELETE a single creator attachment ──────────────────────
const deleteCreatorAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { publicId } = req.body;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const isCreator = task.createdBy?.toString() === userId;
  if (!isAdmin(userRole) && !isCreator) {
    throw new ApiError(403, "Only the task creator, admin, or subadmin can remove the creator attachment");
  }

  const target = (task.creatorAttachment || []).find((a) => a.publicId === publicId);
  if (target) await deleteAttachmentFromCloudinary(target.publicId, target.resourceType);

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { $pull: { creatorAttachment: { publicId } } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Creator attachment removed"));
});

// ─── PATCH upload assignee attachment ────────────────────────
const uploadAssigneeAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const _isAssignee = task.assignees?.some((a) => a.toString() === userId);
  if (!isAdmin(userRole) && !_isAssignee) {
    throw new ApiError(403, "Only assigned members can upload the assignee attachment");
  }
  if (!req.files?.length) throw new ApiError(400, "No file provided");

  const newAttachments = await uploadAttachments(req.files);

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { $push: { assigneeAttachment: { $each: newAttachments } } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Assignee attachment uploaded"));
});

// ─── DELETE a single assignee attachment ─────────────────────
const deleteAssigneeAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { publicId } = req.body;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const _isAssignee = task.assignees?.some((a) => a.toString() === userId);
  if (!isAdmin(userRole) && !_isAssignee) {
    throw new ApiError(403, "Only assigned members can remove the assignee attachment");
  }

  const target = (task.assigneeAttachment || []).find((a) => a.publicId === publicId);
  if (target) await deleteAttachmentFromCloudinary(target.publicId, target.resourceType);

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { $pull: { assigneeAttachment: { publicId } } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Assignee attachment removed"));
});

// ─── DELETE task ──────────────────────────────────────────────
const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const isCreator = task.createdBy?.toString() === userId;
  const isCreatorDeptMember = await isCreatorDepartmentMember(
    task,
    userId,
    userDeptId
  );

  if (!isAdmin(userRole) && !isCreator && !isCreatorDeptMember) {
    throw new ApiError(
      403,
      "Only members of the creator's department, admin, or subadmin can delete this task"
    );
  }

  const projectId = task.projectId?.toString?.() || task.projectId;
  const participantIds = new Set();
  if (task.createdBy) participantIds.add(task.createdBy.toString());
  (task.assignees || []).forEach((a) => participantIds.add(a.toString()));
  participantIds.add(userId);

  const notifyRecipients = await Notification.find({ taskId: id }).distinct("recipient");
  notifyRecipients.forEach((rid) => participantIds.add(rid.toString()));

  await Task.findByIdAndDelete(id);

  emitToUsers([...participantIds], "task:deleted", {
    taskId: id,
    projectId: projectId || null,
  });

  return res.status(200).json(new ApiResponse(200, {}, "Task deleted"));
});

// ─── GET proxy attachment (Cloudinary raw PDFs → inline in browser) ──
const CLOUDINARY_HOST = "res.cloudinary.com";

const MIME_BY_EXT = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
  rar: "application/vnd.rar",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  eps: "application/postscript",
};

const isAllowedCloudinaryUrl = (urlString) => {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.hostname !== CLOUDINARY_HOST) return false;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (cloudName && !parsed.pathname.startsWith(`/${cloudName}/`)) return false;

    return true;
  } catch {
    return false;
  }
};

const resolveContentType = (filename, upstreamType) => {
  if (upstreamType && upstreamType !== "application/octet-stream") return upstreamType;
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
};

const sanitizeFilename = (name) =>
  (name || "attachment").replace(/[^\w\s.-]/g, "_").trim() || "attachment";

const proxyAttachment = asyncHandler(async (req, res) => {
  const { url, publicId, disposition = "inline", filename } = req.query;

  if (!url && !publicId) {
    throw new ApiError(400, "url or publicId query parameter is required");
  }

  const decodedUrl = url ? decodeURIComponent(url).replace(/^http:\/\//i, "https://") : null;

  if (decodedUrl && !isAllowedCloudinaryUrl(decodedUrl)) {
    throw new ApiError(403, "Invalid attachment URL");
  }

  let upstream;
  try {
    upstream = await fetchAttachmentFromCloudinary({
      url: decodedUrl,
      publicId: publicId ? decodeURIComponent(publicId) : undefined,
      filename: filename ? decodeURIComponent(filename) : undefined,
    });
  } catch (err) {
    throw new ApiError(502, err.message || "Failed to fetch attachment from storage");
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const safeName = sanitizeFilename(
    filename
      ? decodeURIComponent(filename)
      : decodedUrl?.split("/").pop()?.split("?")[0]
  );
  const contentType = resolveContentType(safeName, upstream.headers.get("content-type"));
  const ext = safeName.split(".").pop()?.toLowerCase();

  // Reject HTML/error bodies masquerading as documents
  const head = buffer.subarray(0, 32).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    throw new ApiError(502, "Attachment storage returned an invalid file. Please re-upload.");
  }
  if (ext === "pdf" && !buffer.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
    throw new ApiError(502, "PDF file is invalid or blocked by storage. Please re-upload.");
  }

  const forceDownload = [
    "zip",
    "rar",
    "psd",
    "ai",
    "eps",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
  ].includes(ext);
  const disp =
    forceDownload || disposition === "attachment" ? "attachment" : "inline";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${disp}; filename="${safeName}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  return res.send(buffer);
});

export {
  getTasksByProject, getAllTasks, createTask, updateTask, updateTaskStatus,
  addComment, deleteComment, uploadCreatorAttachment, uploadAssigneeAttachment, deleteTask,
  deleteCreatorAttachment, deleteAssigneeAttachment,
  proxyAttachment,
};
