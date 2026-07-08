import { Router } from "express";
import {
  getTasksByProject, getAllTasks, createTask, updateTask, updateTaskStatus,
  addComment, deleteComment, uploadCreatorAttachment, uploadAssigneeAttachment, deleteTask,
  proxyAttachment,
} from "../controllers/task.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router = Router();
router.use(verifyJWT);

// Must be before /:id routes
router.route("/all").get(getAllTasks);
router.route("/project/:projectId").get(getTasksByProject);
router.route("/attachment/proxy").get(proxyAttachment);

router.route("/").post(upload.single("attachment"),checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN','HR_ADMIN'), createTask);
router.route("/:id").patch(upload.single("attachment"), checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN','HR_ADMIN'), updateTask).delete(checkRole('ADMIN','SUBADMIN','DEP_ADMIN','FINANCE_ADMIN','HR_ADMIN'), deleteTask);
router.route("/:id/status").patch(updateTaskStatus);
router.route("/:id/comment").post(addComment);
router.route("/:id/comment/:commentId").delete(deleteComment);
router.route("/:id/creator-attachment").patch(upload.single("attachment"), uploadCreatorAttachment);
router.route("/:id/assignee-attachment").patch(upload.single("attachment"), uploadAssigneeAttachment);

export default router;
