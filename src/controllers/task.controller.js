import { Task } from "../models/task.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAttachmentOnCloudinary, fetchAttachmentFromCloudinary } from "../utils/cloudinary.js";

const ADMIN_ROLES = ["ADMIN", "SUBADMIN"];
const isAdmin = (role) => ADMIN_ROLES.includes(role?.toUpperCase());

const populateTask = (query) =>
  query
    .populate({ path: "assignees", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate({ path: "createdBy", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("comments.author", "fullName image");

const populateTaskWithProject = (query) =>
  query
    .populate({
      path: "projectId",
      select: "name clientId",
      populate: { path: "clientId", select: "departmentId", populate: { path: "departmentId", select: "name" } },
    })
    .populate({ path: "assignees", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate({ path: "createdBy", select: "fullName image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("comments.author", "fullName image");

// Parse assignees from FormData (sent as JSON string) or JSON array
const parseAssignees = (raw) => {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return raw ? [raw] : []; }
  }
  return [];
};

// ─── GET tasks by project — with visibility rules ──────────────
const getTasksByProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();
  const userDeptId = req.user.departmentId?.toString();

  let tasks = await populateTask(
    Task.find({ projectId }).sort({ order: 1, createdAt: 1 })
  );

  if (!isAdmin(userRole)) {
    tasks = tasks.filter((task) => {
      const creatorId = task.createdBy?._id?.toString();
      const creatorDeptId = task.createdBy?.departmentId?.toString();
      const assigneeIds = task.assignees?.map((a) => a._id?.toString()) || [];
      const assigneeDeptIds = task.assignees?.map((a) => a.departmentId?.toString()) || [];

      if (userRole === "DEP_ADMIN") {
        return creatorId === userId || creatorDeptId === userDeptId || assigneeDeptIds.includes(userDeptId);
      }
      return creatorId === userId || assigneeIds.includes(userId);
    });
  }

  const columns = { todo: [], "in-progress": [], "in-review": [], done: [] };
  tasks.forEach((t) => { if (columns[t.status]) columns[t.status].push(t); });

  return res.status(200).json(new ApiResponse(200, { tasks, columns }, "Tasks fetched"));
});

// ─── GET all tasks across all projects ───────────────────────
const getAllTasks = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();
  const userDeptId = req.user.departmentId?.toString();

  let tasks = await populateTaskWithProject(
    Task.find().sort({ createdAt: -1 })
  );

  if (!isAdmin(userRole)) {
    tasks = tasks.filter((task) => {
      const creatorId = task.createdBy?._id?.toString();
      const creatorDeptId = task.createdBy?.departmentId?.toString();
      const assigneeIds = task.assignees?.map((a) => a._id?.toString()) || [];
      const assigneeDeptIds = task.assignees?.map((a) => a.departmentId?.toString()) || [];

      if (userRole === "DEP_ADMIN") {
        return creatorId === userId || creatorDeptId === userDeptId || assigneeDeptIds.includes(userDeptId);
      }
      return creatorId === userId || assigneeIds.includes(userId);
    });
  }

  return res.status(200).json(new ApiResponse(200, tasks, "All tasks fetched"));
});

// ─── POST create task ─────────────────────────────────────────
const createTask = asyncHandler(async (req, res) => {
  const { projectId, title, description, priority, dueDate, status } = req.body;
  const assignees = parseAssignees(req.body.assignees) || [];

  if (!projectId || !title) throw new ApiError(400, "projectId and title are required");

  const lastTask = await Task.findOne({ projectId, status: status || "todo" }).sort({ order: -1 });
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

  // Upload creator attachment if provided
  if (req.file) {
    const uploaded = await uploadAttachmentOnCloudinary(req.file);
    if (uploaded?.url) {
      task.creatorAttachment = {
        url: uploaded.secure_url,
        originalName: req.file.originalname,
        publicId: uploaded.public_id,
      };
      await task.save();
    }
  }

  const populated = await populateTask(Task.findById(task._id));
  return res.status(201).json(new ApiResponse(201, populated, "Task created"));
});

// ─── PATCH update task (creator/admin only) ───────────────────
const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  if (!isAdmin(userRole) && task.createdBy?.toString() !== userId) {
    throw new ApiError(403, "Only the task creator can edit this task");
  }

  const { title, description, priority, dueDate, status } = req.body;
  const assignees = parseAssignees(req.body.assignees);

  const update = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (priority) update.priority = priority;
  if (assignees !== undefined) update.assignees = assignees;
  if (dueDate !== undefined) update.dueDate = dueDate || null;
  if (status) update.status = status;

  // Replace creator attachment if a new file was sent
  if (req.file) {
    const uploaded = await uploadAttachmentOnCloudinary(req.file);
    if (uploaded?.url) {
      update.creatorAttachment = {
        url: uploaded.url,
        originalName: req.file.originalname,
        publicId: uploaded.public_id,
      };
    }
  }

  const updated = await populateTask(
    Task.findByIdAndUpdate(id, update, { new: true })
  );

  return res.status(200).json(new ApiResponse(200, updated, "Task updated"));
});

// ─── PATCH update task status (drag-drop) ────────────────────
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, order } = req.body;
  const userId = req.user._id.toString();
  const userRole = req.user.role?.toUpperCase();

  if (!status) throw new ApiError(400, "status is required");

  const task = await Task.findById(id);
  if (!task) throw new ApiError(404, "Task not found");

  const _isAdmin = isAdmin(userRole);
  const _isCreator = task.createdBy?.toString() === userId;
  const _isAssignee = task.assignees?.some((a) => a.toString() === userId);

  if (status === "done" && !_isCreator && !_isAdmin) {
    throw new ApiError(403, "Only the task creator or admin can mark a task as Done");
  }
  if (!_isAdmin && !_isCreator && !_isAssignee) {
    throw new ApiError(403, "You do not have permission to move this task");
  }

  const updated = await populateTask(
    Task.findByIdAndUpdate(id, { status, ...(order !== undefined && { order }) }, { new: true })
  );

  return res.status(200).json(new ApiResponse(200, updated, "Task status updated"));
});

// ─── POST add comment ─────────────────────────────────────────
const addComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text?.trim()) throw new ApiError(400, "Comment text is required");

  await Task.findByIdAndUpdate(
    id,
    { $push: { comments: { author: req.user._id, text: text.trim() } } }
  );
  const populated = await populateTask(Task.findById(id));
  if (!populated) throw new ApiError(404, "Task not found");

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

  if (!isAdmin(userRole) && task.createdBy?.toString() !== userId) {
    throw new ApiError(403, "Only the task creator can upload the creator attachment");
  }
  if (!req.file) throw new ApiError(400, "No file provided");

  const uploaded = await uploadAttachmentOnCloudinary(req.file);
  if (!uploaded?.url) throw new ApiError(500, "File upload failed");

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { creatorAttachment: { url: uploaded.url, originalName: req.file.originalname, publicId: uploaded.public_id } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Creator attachment uploaded"));
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
  if (!req.file) throw new ApiError(400, "No file provided");

  const uploaded = await uploadAttachmentOnCloudinary(req.file);
  if (!uploaded?.url) throw new ApiError(500, "File upload failed");

  const updated = await populateTask(
    Task.findByIdAndUpdate(
      id,
      { assigneeAttachment: { url: uploaded.url, originalName: req.file.originalname, publicId: uploaded.public_id } },
      { new: true }
    )
  );

  return res.status(200).json(new ApiResponse(200, updated, "Assignee attachment uploaded"));
});

// ─── DELETE task ──────────────────────────────────────────────
const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await Task.findByIdAndDelete(id);
  if (!task) throw new ApiError(404, "Task not found");
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
  const safeName = sanitizeFilename(filename ? decodeURIComponent(filename) : undefined);
  const contentType = resolveContentType(safeName, upstream.headers.get("content-type"));
  const disp = disposition === "attachment" ? "attachment" : "inline";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${disp}; filename="${safeName}"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, max-age=3600");

  return res.send(buffer);
});

export {
  getTasksByProject, getAllTasks, createTask, updateTask, updateTaskStatus,
  addComment, deleteComment, uploadCreatorAttachment, uploadAssigneeAttachment, deleteTask,
  proxyAttachment,
};
