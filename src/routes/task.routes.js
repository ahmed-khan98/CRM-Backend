import { Router } from "express";
import {
  getTasksByProject, getAllTasks, createTask, updateTask, updateTaskStatus,
  addComment, deleteComment, uploadCreatorAttachment, uploadAssigneeAttachment, deleteTask,
  deleteCreatorAttachment, deleteAssigneeAttachment,
  proxyAttachment,
} from "../controllers/task.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();
router.use(verifyJWT);

// Must be before /:id routes
router.route("/all").get(getAllTasks);
router.route("/project/:projectId").get(getTasksByProject);
router.route("/attachment/proxy").get(proxyAttachment);

router.route("/").post(upload.array("attachment", 10), createTask);
router
  .route("/:id")
  .patch(upload.array("attachment", 10), updateTask)
  .delete(deleteTask);
router.route("/:id/status").patch(updateTaskStatus);
router.route("/:id/comment").post(addComment);
router.route("/:id/comment/:commentId").delete(deleteComment);
router
  .route("/:id/creator-attachment")
  .patch(upload.array("attachment", 10), uploadCreatorAttachment)
  .delete(deleteCreatorAttachment);
router
  .route("/:id/assignee-attachment")
  .patch(upload.array("attachment", 10), uploadAssigneeAttachment)
  .delete(deleteAssigneeAttachment);

export default router;
