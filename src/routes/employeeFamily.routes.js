import { Router } from "express";
import {
  getAllFamilies,
  getFamilyById,
  getFamilyByEmployee,
  upsertFamily,
  deleteFamily,
} from "../controllers/employeeFamily.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllFamilies);
router.route("/add").post(upsertFamily);
router.route("/by-employee/:employeeId").get(getFamilyByEmployee).put(upsertFamily);
router
  .route("/:id")
  .get(getFamilyById)
  .patch(upsertFamily)
  .delete(deleteFamily);

export default router;
