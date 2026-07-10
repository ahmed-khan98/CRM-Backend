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

router.route("/").get(getAllProjects).post(createProject);
router
  .route("/:id")
  .get(getProjectById)
  .patch(updateProject)
  .delete(checkRole('ADMIN','SUBADMIN'),deleteProject);

export default router;
