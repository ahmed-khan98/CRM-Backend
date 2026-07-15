import mongoose from "mongoose";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getAccessibleProjectIds,
  getUserProjectGroups,
  isAdmin,
} from "../utils/taskVisibility.js";

const EMPTY_TASK_COUNTS = { todo: 0, "in-progress": 0, "in-review": 0, done: 0, total: 0 };

const projectPopulate = [
  {
    path: "clientId",
    select: "name companyName email image departmentId",
    populate: { path: "departmentId", select: "name" },
  },
  {
    path: "createdBy",
    select: "fullName image departmentId",
    populate: { path: "departmentId", select: "name" },
  },
];

const populateProject = (query) => query.populate(projectPopulate);

const attachTaskCounts = (projects, taskCounts) => {
  const countsMap = {};
  taskCounts.forEach(({ _id, count }) => {
    const pid = _id.projectId.toString();
    if (!countsMap[pid]) countsMap[pid] = { ...EMPTY_TASK_COUNTS };
    countsMap[pid][_id.status] = count;
    countsMap[pid].total += count;
  });

  return projects.map((p) => ({
    ...p,
    taskCounts: countsMap[p._id.toString()] || { ...EMPTY_TASK_COUNTS },
  }));
};

const sortProjectsNewestFirst = (projects) =>
  [...projects].sort((a, b) => {
    const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return String(b._id).localeCompare(String(a._id));
  });

const fetchProjectsWithCounts = async (filter) => {
  const projects = await populateProject(
    Project.find(filter).sort({ createdAt: -1, _id: -1 })
  ).lean();
  const projectObjectIds = projects.map((p) => p._id);

  const taskCounts = projectObjectIds.length
    ? await Task.aggregate([
        { $match: { projectId: { $in: projectObjectIds } } },
        { $group: { _id: { projectId: "$projectId", status: "$status" }, count: { $sum: 1 } } },
      ])
    : [];

  return sortProjectsNewestFirst(attachTaskCounts(projects, taskCounts));
};

// GET all projects — with task counts + visibility filtering
const getAllProjects = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  if (userRole === "USER" && userDeptId) {
    const groups = await getUserProjectGroups(userId, userDeptId);

    if (!groups.all.length) {
      return res.status(200).json(
        new ApiResponse(
          200,
          { grouped: true, departmentProjects: [], assignedProjects: [] },
          "Projects fetched successfully"
        )
      );
    }

    const allObjectIds = groups.all.map((id) => new mongoose.Types.ObjectId(id));
    const projects = await fetchProjectsWithCounts({ _id: { $in: allObjectIds } });
    const departmentSet = new Set(groups.department);
    const assignedSet = new Set(groups.assigned);

    const departmentProjects = projects.filter((p) => departmentSet.has(p._id.toString()));
    const assignedProjects = projects.filter((p) => assignedSet.has(p._id.toString()));

    return res.status(200).json(
      new ApiResponse(
        200,
        { grouped: true, departmentProjects, assignedProjects },
        "Projects fetched successfully"
      )
    );
  }

  const allowedIds = await getAccessibleProjectIds(userId, userRole, userDeptId);

  if (Array.isArray(allowedIds) && allowedIds.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "Projects fetched successfully"));
  }

  const filter =
    allowedIds === null
      ? {}
      : { _id: { $in: allowedIds.map((id) => new mongoose.Types.ObjectId(id)) } };

  const result = await fetchProjectsWithCounts(filter);

  return res.status(200).json(new ApiResponse(200, result, "Projects fetched successfully"));
});

// GET single project
const getProjectById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role?.toUpperCase();
  const userDeptId =
    req.user.departmentId?._id?.toString() || req.user.departmentId?.toString();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, "Project not found");
  }

  if (!isAdmin(userRole)) {
    const allowedIds = await getAccessibleProjectIds(userId, userRole, userDeptId);
    if (!allowedIds.includes(id.toString())) {
      throw new ApiError(404, "Project not found");
    }
  }

  const project = await populateProject(Project.findById(id)).lean();
  if (!project) throw new ApiError(404, "Project not found");

  return res.status(200).json(new ApiResponse(200, project, "Project fetched successfully"));
});

// POST create project manually
const createProject = asyncHandler(async (req, res) => {
  const { clientId, name, description, status } = req.body;

  if (!name) throw new ApiError(400, "Project name is required");

  const validClientId =
    clientId && mongoose.Types.ObjectId.isValid(String(clientId))
      ? clientId
      : undefined;

  if (validClientId) {
    const exists = await Project.findOne({ clientId: validClientId }).select("_id").lean();
    if (exists) throw new ApiError(409, "A project for this client already exists");
  }

  const project = await Project.create({
    ...(validClientId && { clientId: validClientId }),
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
