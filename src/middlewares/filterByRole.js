import { userHasHrAdminAccess } from "../utils/hrAccess.js";

export const filterByRole = async (req, res, next) => {
  try {
    const role = req?.user?.role;
    const superRoles = ["ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "SUBADMIN"];

    if (superRoles.includes(role)) {
      req.roleFilter = {};
    } else if (await userHasHrAdminAccess(req.user)) {
      // HR department staff see org-wide data (same as HR_ADMIN)
      req.roleFilter = {};
    } else if (role === "DEP_ADMIN" || role === "USER") {
      req.roleFilter = { departmentId: req.user.departmentId };
    } else {
      req.roleFilter = { _id: null };
    }

    next();
  } catch (err) {
    next(err);
  }
};
