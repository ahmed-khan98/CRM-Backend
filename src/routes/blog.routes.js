import { Router } from "express";
import { createBlog, deleteBlog, getAllBlogs, getBlogById, updateBlog } from "../controllers/blog.controller.js";
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router()

router.use(verifyJWT)

router.route('/').get(getAllBlogs)
router.route('/add').post(createBlog)
router.route('/:id').patch(updateBlog).delete(deleteBlog).get(getBlogById)

export default router