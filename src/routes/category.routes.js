import { Router } from "express";
import {upload} from "../middlewares/multer.middleware.js"
import { createCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from "../controllers/category.controller.js";

const router=Router();

router.route('/').get(getAllCategories)
router.route('/add').post(upload.single("image"),createCategory)
router.route('/:id').patch(upload.single("image"),updateCategory).delete(deleteCategory).get(getCategoryById)

export default router   