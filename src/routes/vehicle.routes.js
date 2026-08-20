import { Router } from "express";
import {
  getAllVehicles,
  getAvailableVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  addMileage,
  addMaintenance,
} from "../controllers/vehicle.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

const vehicleMedia = upload.fields([
  { name: "images", maxCount: 20 },
  { name: "videos", maxCount: 10 },
]);
const allowRoles = ["ADMIN", "SUBADMIN"];

// HR needs available cars for Car Allowance (company car option)
router
  .route("/available")
  .get(checkRole("ADMIN", "SUBADMIN", "HR_ADMIN"), getAvailableVehicles);

router.route("/").get(checkRole(), getAllVehicles);
router
  .route("/add")
  .post(checkRole(...allowRoles), vehicleMedia, createVehicle);
router.route("/:id/mileage").post(checkRole(...allowRoles), addMileage);
router.route("/:id/maintenance").post(checkRole(...allowRoles), addMaintenance);
router
  .route("/:id")
  .get(checkRole("ADMIN", "SUBADMIN", "HR_ADMIN"), getVehicleById)
  .patch(checkRole(...allowRoles), vehicleMedia, updateVehicle)
  .delete(checkRole(...allowRoles), deleteVehicle);

export default router;
