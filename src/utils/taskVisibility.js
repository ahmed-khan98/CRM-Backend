import { Employee } from "../models/employee.model.js";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";

export const ADMIN_ROLES = ["ADMIN", "SUBADMIN"];
export const isAdmin = (role) => ADMIN_ROLES.includes(role?.toUpperCase());

export const getDepartmentTeamIds = async (departmentId, userId) => {
  if (!departmentId) {
    return userId ? [userId] : [];
  }

  const deptEmployees = await Employee.find({ departmentId }).select("_id").lean();
  const teamIds = new Set(deptEmployees.map((emp) => emp._id.toString()));
  if (userId) teamIds.add(userId.toString());

  return [...teamIds];
};

export const buildTaskVisibilityFilter = async (userId, userRole, userDeptId) => {
  if (isAdmin(userRole)) return {};

  if (userRole === "DEP_ADMIN") {
    const teamIds = await getDepartmentTeamIds(userDeptId, userId);
    if (!teamIds.length) return { _id: null };

    return {
      $or: [
        { createdBy: { $in: teamIds } },
        { assignees: { $in: teamIds } },
      ],
    };
  }

  return {
    $or: [
      { createdBy: userId },
      { assignees: userId },
    ],
  };
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
    if (!teamIds.length) return [];

    const [teamCreatedProjects, deptTasks] = await Promise.all([
      Project.find({ createdBy: { $in: teamIds } }).select("_id").lean(),
      Task.find({
        $or: [{ createdBy: { $in: teamIds } }, { assignees: { $in: teamIds } }],
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
  }

  const [ownProjects, userTasks] = await Promise.all([
    Project.find({ createdBy: userId }).select("_id").lean(),
    Task.find({
      $or: [{ createdBy: userId }, { assignees: userId }],
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
