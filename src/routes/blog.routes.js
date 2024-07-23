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

router.use(verifyJWT);

router.route("/").get(getAllBlogs);
router.route("/upload-blog-images").post( upload.fields([
    {
        name: "image",
        maxCount: 1
    }, 
]),uploadBlogImages);
router.route("/add").post(createBlog);
router.route("/:id").patch(updateBlog).delete(deleteBlog).get(getBlogById);

export default router;
