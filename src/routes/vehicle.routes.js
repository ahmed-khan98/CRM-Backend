import { Router } from "express";
import {
  getAllVehicles,
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
router.use(checkRole("ADMIN", "SUBADMIN"));

const vehicleMedia = upload.fields([
  { name: "images", maxCount: 20 },
  { name: "videos", maxCount: 10 },
]);

router.route("/").get(getAllVehicles);
router.route("/add").post(vehicleMedia, createVehicle);
router.route("/:id/mileage").post(addMileage);
router.route("/:id/maintenance").post(addMaintenance);
router
  .route("/:id")
  .get(getVehicleById)
  .patch(vehicleMedia, updateVehicle)
  .delete(deleteVehicle);

export default router;
