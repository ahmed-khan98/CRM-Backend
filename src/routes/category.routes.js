import { Router } from "express";
import {verifyJWT} from "../middlewares/auth.middleware.js"
import { createCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from "../controllers/category.controller.js";

const router=Router();

router.use(verifyJWT); 

router.route('/').get(getAllCategories)
router.route('/add').post(createCategory)
router.route('/:id').patch(updateCategory).delete(deleteCategory).get(getCategoryById)

export default router   