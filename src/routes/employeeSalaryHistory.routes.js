import { Router } from "express";
import {
  getAllSalaryHistory,
  getSalaryHistoryById,
  createSalaryHistory,
  updateSalaryHistory,
  deleteSalaryHistory,
} from "../controllers/employeeSalaryHistory.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllSalaryHistory);
router.route("/add").post(createSalaryHistory);
router
  .route("/:id")
  .get(getSalaryHistoryById)
  .patch(updateSalaryHistory)
  .delete(deleteSalaryHistory);

export default router;
