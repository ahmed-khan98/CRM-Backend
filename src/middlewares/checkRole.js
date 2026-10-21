import { userHasHrAdminAccess } from "../utils/hrAccess.js";

export const checkRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const role = req.user?.role?.toUpperCase?.() || req.user?.role;
      const allowed = allowedRoles.map((r) => String(r).toUpperCase());

      if (allowed.includes(role)) {
        return next();
      }

      // HR department employees get the same access as HR_ADMIN for HRMS routes
      if (allowed.includes("HR_ADMIN") && (await userHasHrAdminAccess(req.user))) {
        return next();
      }

      return res
        .status(403)
        .json({ message: "You are not authorized for this action" });
    } catch (err) {
      return res
        .status(500)
        .json({ message: err?.message || "Authorization check failed" });
    }
  };
};
