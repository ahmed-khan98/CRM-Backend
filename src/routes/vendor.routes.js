import { Router } from "express";
import {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} from "../controllers/vendor.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(checkRole("ADMIN", "SUBADMIN"));
router.route("/").get(getAllVendors);
router.route("/add").post(upload.single("profilePicture"), createVendor);
router
  .route("/:id")
  .get(getVendorById)
  .patch(upload.single("profilePicture"), updateVendor)
  .delete(deleteVendor);

export default router;
