import { Router } from "express";
import {
  getAllAllowances,
  getAllowanceById,
  createAllowance,
  updateAllowance,
  deleteAllowance,
} from "../controllers/employeeAllowance.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllAllowances);
router.route("/add").post(createAllowance);
router
  .route("/:id")
  .get(getAllowanceById)
  .patch(updateAllowance)
  .delete(deleteAllowance);

export default router;
