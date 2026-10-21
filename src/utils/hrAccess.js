import { Department } from "../models/department.model.js";

/** Dept names that count as HR (any employee here gets HR_ADMIN-level HRMS access). */
export function isHrDepartmentName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase().trim();
  return (
    n === "hr" ||
    n === "h.r" ||
    n === "h.r." ||
    n.includes("human resource") ||
    n.includes("human-resource") ||
    /(^|[^a-z])hr([^a-z]|$)/.test(n)
  );
}

/**
 * True if user role is already HR/super, or their department is HR.
 * Used so every HR-department employee can use HRMS (same as HR_ADMIN).
 */
export async function userHasHrAdminAccess(user) {
  if (!user) return false;
  const role = String(user.role || "").toUpperCase();
  if (["ADMIN", "SUBADMIN", "HR_ADMIN"].includes(role)) return true;

  const populatedName = user.departmentId?.name;
  if (populatedName) return isHrDepartmentName(populatedName);

  const deptId = user.departmentId?._id || user.departmentId;
  if (!deptId) return false;

  const dept = await Department.findById(deptId).select("name").lean();
  return isHrDepartmentName(dept?.name);
}
