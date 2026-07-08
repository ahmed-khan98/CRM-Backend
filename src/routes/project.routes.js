import { Router } from "express";
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();

router.use(verifyJWT);

router.route("/").get(getAllProjects).post(checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN','HR_ADMIN'),createProject);
router
  .route("/:id")
  .get(getProjectById)
  .patch(checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN','HR_ADMIN'),updateProject)
  .delete(checkRole('ADMIN','SUBADMIN'),deleteProject);

export default router;
