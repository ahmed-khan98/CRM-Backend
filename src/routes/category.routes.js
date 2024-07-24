import { Router } from "express";
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import { createCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from "../controllers/category.controller.js";

const router=Router();

// router.use(verifyJWT); 

router.route('/').get(getAllCategories)
router.route('/add').post(verifyJWT,upload.single("image"),createCategory)
router.route('/:id').patch(verifyJWT,upload.single("image"),updateCategory).delete(verifyJWT,deleteCategory).get(getCategoryById)

export default router   