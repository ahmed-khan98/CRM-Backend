import mongoose from "mongoose";
import { userHasHrAdminAccess } from "../utils/hrAccess.js";

export function deptIdOf(user) {
  const raw = user?.departmentId?._id || user?.departmentId || null;
  if (!raw) return null;
  try {
    return new mongoose.Types.ObjectId(String(raw));
  } catch {
    return null;
  }
}

/**
 * Department-scoped list filter for CRM (leads, sales, brands, …).
 * Super roles see all. DEP_ADMIN / USER see only their department.
 * Note: HR-department staff are NOT org-wide here (that broke lead isolation).
 * Use filterByRoleOrHrOrg on HRMS routes that need org-wide HR access.
 */
export const filterByRole = async (req, res, next) => {
  try {
    const role = String(req?.user?.role || "").toUpperCase();
    const superRoles = ["ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "SUBADMIN"];

    if (superRoles.includes(role)) {
      req.roleFilter = {};
    } else if (role === "DEP_ADMIN" || role === "USER") {
      const departmentId = deptIdOf(req.user);
      req.roleFilter = departmentId
        ? { departmentId }
        : { _id: null }; // no dept → see nothing
    } else {
      req.roleFilter = { _id: null };
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Same as filterByRole, but HR-department employees get org-wide filter
 * (payroll / leave / employee directory).
 */
export const filterByRoleOrHrOrg = async (req, res, next) => {
  try {
    if (await userHasHrAdminAccess(req.user)) {
      req.roleFilter = {};
      return next();
    }
    return filterByRole(req, res, next);
  } catch (err) {
    next(err);
  }
};
