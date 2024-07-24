import { Router } from "express";
import {
  createBlog,
  deleteBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  uploadBlogImages,
} from "../controllers/blog.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// router.use(verifyJWT);

router.route("/").get(getAllBlogs);
router.route("/upload-blog-images").post(verifyJWT,upload.single("image"),uploadBlogImages);
router.route("/add").post(verifyJWT,upload.single("image"),createBlog);
router.route("/:id").patch(verifyJWT,upload.single("image"),updateBlog).delete(verifyJWT,deleteBlog).get(getBlogById);

export default router;
