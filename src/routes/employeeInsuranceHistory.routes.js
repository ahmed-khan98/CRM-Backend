import { Router } from "express";
import {
  getAllInsuranceHistory,
  getInsuranceHistoryById,
  createInsuranceHistory,
  updateInsuranceHistory,
  deleteInsuranceHistory,
} from "../controllers/employeeInsuranceHistory.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllInsuranceHistory);
router.route("/add").post(createInsuranceHistory);
router
  .route("/:id")
  .get(getInsuranceHistoryById)
  .patch(updateInsuranceHistory)
  .delete(deleteInsuranceHistory);

export default router;
