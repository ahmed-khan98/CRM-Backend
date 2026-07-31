import mongoose from "mongoose";
import { Employee } from "../models/employee.model.js";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";

export const ADMIN_ROLES = ["ADMIN", "SUBADMIN"];
export const isAdmin = (role) => ADMIN_ROLES.includes(role?.toUpperCase());

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const toObjectIds = (ids) => ids.map((id) => toObjectId(id));

export const getDepartmentTeamIds = async (departmentId, userId) => {
  if (!departmentId) {
    return userId ? [String(userId)] : [];
  }

  const deptEmployees = await Employee.find({ departmentId: toObjectId(departmentId) })
    .select("_id")
    .lean();
  const teamIds = new Set(deptEmployees.map((emp) => emp._id.toString()));
  if (userId) teamIds.add(String(userId));

  return [...teamIds];
};

const getDepartmentProjectIds = async (teamIds) => {
  if (!teamIds.length) return [];

  const teamObjectIds = toObjectIds(teamIds);

  const [teamCreatedProjects, deptTasks] = await Promise.all([
    Project.find({ createdBy: { $in: teamObjectIds } }).select("_id").lean(),
    Task.find({
      $or: [{ createdBy: { $in: teamObjectIds } }, { assignees: { $in: teamObjectIds } }],
    })
      .select("projectId")
      .lean(),
  ]);

  return [
    ...new Set([
      ...teamCreatedProjects.map((p) => p._id.toString()),
      ...deptTasks.map((t) => t.projectId?.toString()).filter(Boolean),
    ]),
  ];
};

/** USER: split dept-created vs cross-dept task projects */
export const getUserProjectGroups = async (userId, userDeptId) => {
  const teamIds = await getDepartmentTeamIds(userDeptId, userId);
  const userObjectId = toObjectId(userId);
  const teamObjectIds = teamIds.length ? toObjectIds(teamIds) : [];

  const [deptCreatedProjects, userTasks] = await Promise.all([
    teamObjectIds.length
      ? Project.find({ createdBy: { $in: teamObjectIds } }).select("_id").lean()
      : [],
    Task.find({
      $or: [{ createdBy: userObjectId }, { assignees: userObjectId }],
    })
      .select("projectId")
      .lean(),
  ]);

  const department = deptCreatedProjects.map((p) => p._id.toString());
  const departmentSet = new Set(department);
  const assigned = [
    ...new Set(
      userTasks.map((t) => t.projectId?.toString()).filter((id) => id && !departmentSet.has(id))
    ),
  ];

  return {
    department,
    assigned,
    all: [...new Set([...department, ...assigned])],
  };
};

const getDepartmentCreatedProjectIds = async (userDeptId, userId) => {
  const teamIds = await getDepartmentTeamIds(userDeptId, userId);
  const teamObjectIds = teamIds.length ? toObjectIds(teamIds) : [];
  if (!teamObjectIds.length) return [];

  const projects = await Project.find({ createdBy: { $in: teamObjectIds } })
    .select("_id")
    .lean();

  return projects.map((p) => p._id);
};

export const buildTaskVisibilityFilter = async (userId, userRole, userDeptId, options = {}) => {
  const { projectId } = options;

  if (isAdmin(userRole)) return {};

  const userObjectId = toObjectId(userId);

  if (userRole === "DEP_ADMIN") {
    const teamIds = await getDepartmentTeamIds(userDeptId, userId);
    if (!teamIds.length) return { _id: null };

    const teamObjectIds = toObjectIds(teamIds);

    return {
      $or: [
        { createdBy: { $in: teamObjectIds } },
        { assignees: { $in: teamObjectIds } },
      ],
    };
  }

  if (userRole === "USER" && userDeptId) {
    const teamIds = await getDepartmentTeamIds(userDeptId, userId);
    const teamObjectIds = teamIds.length ? toObjectIds(teamIds) : [];

    if (projectId && teamObjectIds.length) {
      const deptProject = await Project.findOne({
        _id: projectId,
        createdBy: { $in: teamObjectIds },
      })
        .select("_id")
        .lean();

      if (deptProject) return {};
    }

    const deptProjectIds = await getDepartmentCreatedProjectIds(userDeptId, userId);

    return {
      $or: [
        ...(deptProjectIds.length ? [{ projectId: { $in: deptProjectIds } }] : []),
        { createdBy: userObjectId },
        { assignees: userObjectId },
      ],
    };
  }

  return {
    $or: [
      { createdBy: userObjectId },
      { assignees: userObjectId },
    ],
  };
};

/**
 * USER / DEP_ADMIN may update/delete only projects created by their department team.
 * Admins can manage any project.
 */
export const canManageProject = async (project, userId, userRole, userDeptId) => {
  if (!project) return false;
  if (isAdmin(userRole)) return true;

  if (!userDeptId || (userRole !== "USER" && userRole !== "DEP_ADMIN")) {
    return false;
  }

  const teamIds = await getDepartmentTeamIds(userDeptId, userId);
  if (!teamIds.length) return false;

  const creatorId =
    project.createdBy?._id?.toString() || project.createdBy?.toString() || null;

  return Boolean(creatorId && teamIds.includes(creatorId));
};

/**
 * Project IDs the user is allowed to see.
 * Returns null for admins (no restriction).
 * Returns [] when nothing is accessible.
 */
export const getAccessibleProjectIds = async (userId, userRole, userDeptId) => {
  if (isAdmin(userRole)) return null;

  if (userRole === "DEP_ADMIN") {
    const teamIds = await getDepartmentTeamIds(userDeptId, userId);
    return getDepartmentProjectIds(teamIds);
  }

  if (userRole === "USER" && userDeptId) {
    const groups = await getUserProjectGroups(userId, userDeptId);
    return groups.all;
  }

  const userObjectId = toObjectId(userId);

  const [ownProjects, userTasks] = await Promise.all([
    Project.find({ createdBy: userObjectId }).select("_id").lean(),
    Task.find({
      $or: [{ createdBy: userObjectId }, { assignees: userObjectId }],
    })
      .select("projectId")
      .lean(),
  ]);

  return [
    ...new Set([
      ...ownProjects.map((p) => p._id.toString()),
      ...userTasks.map((t) => t.projectId?.toString()).filter(Boolean),
    ]),
  ];
};
