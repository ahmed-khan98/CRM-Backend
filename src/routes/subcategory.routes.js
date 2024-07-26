import Router from 'express'
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"
import { createSubCategory, deleteSubCategory, getAllSubCategories, getAllSubCategoriesByCategoryId, getSubCategoryById, updateSubCategory } from '../controllers/subcategory.controller.js'

const router= Router()

// router.use(verifyJWT)

router.route('/').get(getAllSubCategories)
router.route('/add/:categoryId').post(upload.single("image"),createSubCategory)
router.route('/:id').patch(upload.single("image"),updateSubCategory).delete(verifyJWT,deleteSubCategory).get(getSubCategoryById)
router.route('/getAllSubCategoriesByCategoryId/:categoryId').get(getAllSubCategoriesByCategoryId)

export default router


