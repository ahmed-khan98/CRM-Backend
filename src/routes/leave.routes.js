import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getMyBalances,
  getEmployeeBalances,
  applyLeave,
  getMyRequests,
  getEmployeeRequests,
  getTeamLeave,
  getLeaveById,
  approveLeave,
  rejectLeave,
} from "../controllers/leave.controller.js";

const router = Router();
const teamRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN", "DEP_ADMIN"];
const settingsRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];
const allRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN", "DEP_ADMIN", "USER", "FINANCE_ADMIN"];

router.use(verifyJWT);

router.route("/types").get(checkRole(...allRoles), getLeaveTypes);
router.route("/types").post(checkRole(...settingsRoles), createLeaveType);
router
  .route("/types/:id")
  .patch(checkRole(...settingsRoles), updateLeaveType)
  .delete(checkRole(...settingsRoles), deleteLeaveType);

router.route("/holidays").get(checkRole(...allRoles), getHolidays);
router.route("/holidays").post(checkRole(...settingsRoles), createHoliday);
router
  .route("/holidays/:id")
  .patch(checkRole(...settingsRoles), updateHoliday)
  .delete(checkRole(...settingsRoles), deleteHoliday);

router.route("/my-balances").get(checkRole(...allRoles), getMyBalances);
router.route("/my-requests").get(checkRole(...allRoles), getMyRequests);
router.route("/apply").post(checkRole(...allRoles), upload.single("file"), applyLeave);

router
  .route("/team")
  .get(checkRole(...teamRoles), filterByRole, getTeamLeave);

router
  .route("/employee/:employeeId/balances")
  .get(checkRole(...teamRoles), filterByRole, getEmployeeBalances);
router
  .route("/employee/:employeeId/requests")
  .get(checkRole(...teamRoles), filterByRole, getEmployeeRequests);

router.route("/:id/approve").post(checkRole(...teamRoles), approveLeave);
router.route("/:id/reject").post(checkRole(...teamRoles), rejectLeave);
router.route("/:id").get(checkRole(...allRoles), getLeaveById);

export default router;
