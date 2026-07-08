import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";
import { Employee } from "../models/employee.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const ADMIN_ROLES = ["ADMIN", "SUBADMIN"];

// GET all projects — with task counts + visibility filtering
const getAllProjects = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role?.toUpperCase();
  const userDeptId = req.user.departmentId?.toString();

  let projects = await Project.find()
    .populate({ path: "clientId", select: "name companyName email image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("createdBy", "fullName image")
    .sort({ createdAt: -1 });

  // Visibility: non-admin only see projects where they have tasks
  if (!ADMIN_ROLES.includes(userRole)) {
    let allowedProjectIds;

    if (userRole === "DEP_ADMIN") {
      const deptEmps = await Employee.find({ departmentId: userDeptId }).select("_id");
      const deptIds = [userId, ...deptEmps.map((e) => e._id)];
      const deptTasks = await Task.find({
        $or: [{ createdBy: { $in: deptIds } }, { assignees: { $elemMatch: { $in: deptIds } } }],
      }).select("projectId");
      allowedProjectIds = new Set(deptTasks.map((t) => t.projectId?.toString()).filter(Boolean));
    } else {
      const userTasks = await Task.find({
        $or: [{ createdBy: userId }, { assignees: userId }],
      }).select("projectId");
      allowedProjectIds = new Set(userTasks.map((t) => t.projectId?.toString()).filter(Boolean));
    }

    projects = projects.filter((p) => allowedProjectIds.has(p._id.toString()));
  }

  // Aggregate task counts per project
  const taskCounts = await Task.aggregate([
    { $match: { projectId: { $in: projects.map((p) => p._id) } } },
    { $group: { _id: { projectId: "$projectId", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const countsMap = {};
  taskCounts.forEach(({ _id, count }) => {
    const pid = _id.projectId.toString();
    if (!countsMap[pid]) countsMap[pid] = { todo: 0, "in-progress": 0, "in-review": 0, done: 0, total: 0 };
    countsMap[pid][_id.status] = count;
    countsMap[pid].total += count;
  });

  const result = projects.map((p) => ({
    ...p.toObject(),
    taskCounts: countsMap[p._id.toString()] || { todo: 0, "in-progress": 0, "in-review": 0, done: 0, total: 0 },
  }));

  return res.status(200).json(new ApiResponse(200, result, "Projects fetched successfully"));
});

// GET single project
const getProjectById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const project = await Project.findById(id)
    .populate({ path: "clientId", select: "name companyName email image departmentId", populate: { path: "departmentId", select: "name" } })
    .populate("createdBy", "fullName image");

  if (!project) throw new ApiError(404, "Project not found");

  return res.status(200).json(new ApiResponse(200, project, "Project fetched successfully"));
});

// POST create project manually
const createProject = asyncHandler(async (req, res) => {
  const { clientId, name, description, status } = req.body;

  if (!name) throw new ApiError(400, "Project name is required");

  if (clientId) {
    const exists = await Project.findOne({ clientId });
    if (exists) throw new ApiError(409, "A project for this client already exists");
  }

  const project = await Project.create({
    clientId: clientId || null,
    name,
    description,
    ...(status && { status }),
    createdBy: req.user?._id,
  });

  return res.status(201).json(new ApiResponse(201, project, "Project created successfully"));
});

// PATCH update project
const updateProject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const project = await Project.findByIdAndUpdate(
    id,
    { ...(name && { name }), ...(description !== undefined && { description }), ...(status && { status }) },
    { new: true }
  );

  if (!project) throw new ApiError(404, "Project not found");

  return res.status(200).json(new ApiResponse(200, project, "Project updated successfully"));
});

// DELETE project (cascade tasks)
const deleteProject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const project = await Project.findByIdAndDelete(id);
  if (!project) throw new ApiError(404, "Project not found");

  return res.status(200).json(new ApiResponse(200, {}, "Project deleted successfully"));
});

export { getAllProjects, getProjectById, createProject, updateProject, deleteProject };
