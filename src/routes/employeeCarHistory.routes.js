import { Router } from "express";
import {
  getAllCarHistory,
  getCarHistoryById,
  createCarHistory,
  updateCarHistory,
  deleteCarHistory,
} from "../controllers/employeeCarHistory.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllCarHistory);
router.route("/add").post(createCarHistory);
router
  .route("/:id")
  .get(getCarHistoryById)
  .patch(updateCarHistory)
  .delete(deleteCarHistory);

export default router;
