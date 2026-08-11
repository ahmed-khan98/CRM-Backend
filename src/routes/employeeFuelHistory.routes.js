import { Router } from "express";
import {
  getAllFuelHistory,
  getFuelHistoryById,
  createFuelHistory,
  updateFuelHistory,
  deleteFuelHistory,
} from "../controllers/employeeFuelHistory.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllFuelHistory);
router.route("/add").post(createFuelHistory);
router
  .route("/:id")
  .get(getFuelHistoryById)
  .patch(updateFuelHistory)
  .delete(deleteFuelHistory);

export default router;
