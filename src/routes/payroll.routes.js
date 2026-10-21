import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRoleOrHrOrg } from "../middlewares/filterByRole.js";
import {
  getSettings,
  updateSettings,
  createDeductionType,
  updateDeductionType,
  deleteDeductionType,
  getRun,
  generatePayroll,
  finalizeRun,
  markPaid,
  unlockRun,
  addEntryDeduction,
  updateEntryAmounts,
  getEntry,
  myPayslips,
  teamPayslips,
  downloadPayslipPdf,
  emailPayslips,
} from "../controllers/payroll.controller.js";

const router = Router();
const manageRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];
const viewRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN", "DEP_ADMIN", "FINANCE_ADMIN"];
const allRoles = [...viewRoles, "USER"];

router.use(verifyJWT);

router.route("/settings").get(checkRole(...manageRoles), getSettings);
router.route("/settings").patch(checkRole(...manageRoles), updateSettings);
router.route("/deduction-types").post(checkRole(...manageRoles), createDeductionType);
router
  .route("/deduction-types/:id")
  .patch(checkRole(...manageRoles), updateDeductionType)
  .delete(checkRole(...manageRoles), deleteDeductionType);

router.route("/run").get(checkRole(...manageRoles), filterByRoleOrHrOrg, getRun);
router.route("/generate").post(checkRole(...manageRoles), generatePayroll);
router.route("/runs/:id/finalize").post(checkRole(...manageRoles), finalizeRun);
router.route("/runs/:id/pay").post(checkRole(...manageRoles), markPaid);
router.route("/runs/:id/unlock").post(checkRole("ADMIN"), unlockRun);
router.route("/entries/:id/deduction").post(checkRole(...manageRoles), addEntryDeduction);
router
  .route("/entries/:id")
  .get(checkRole(...allRoles), getEntry)
  .patch(checkRole(...manageRoles), updateEntryAmounts);
router
  .route("/entries/:id/pdf")
  .get(checkRole(...allRoles), downloadPayslipPdf);

router.route("/payslips/me").get(checkRole(...allRoles), myPayslips);
router.route("/payslips").get(checkRole(...allRoles), filterByRoleOrHrOrg, teamPayslips);
router.route("/payslips/email").post(checkRole(...manageRoles), emailPayslips);

export default router;
