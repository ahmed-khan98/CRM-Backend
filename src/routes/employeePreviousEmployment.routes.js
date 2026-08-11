import { Router } from "express";
import {
  getAllPreviousEmployment,
  getPreviousEmploymentById,
  createPreviousEmployment,
  updatePreviousEmployment,
  deletePreviousEmployment,
} from "../controllers/employeePreviousEmployment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllPreviousEmployment);
router.route("/add").post(createPreviousEmployment);
router
  .route("/:id")
  .get(getPreviousEmploymentById)
  .patch(updatePreviousEmployment)
  .delete(deletePreviousEmployment);

export default router;
