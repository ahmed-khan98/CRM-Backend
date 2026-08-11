import { Router } from "express";
import {
  getAllDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
} from "../controllers/employeeDocument.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();
const hrRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.use(verifyJWT);
router.use(checkRole(...hrRoles));

router.route("/").get(getAllDocuments);
router.route("/add").post(upload.single("file"), createDocument);
router
  .route("/:id")
  .get(getDocumentById)
  .patch(upload.single("file"), updateDocument)
  .delete(deleteDocument);

export default router;
