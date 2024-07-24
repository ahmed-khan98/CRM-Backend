import Router from 'express'
import {verifyJWT} from "../middlewares/auth.middleware.js"
import { createSubCategory, deleteSubCategory, getAllSubCategories, getAllSubCategoriesByCategoryId, getSubCategoryById, updateSubCategory } from '../controllers/subcategory.controller.js'

const router= Router()

// router.use(verifyJWT)

router.route('/').get(getAllSubCategories)
router.route('/add/:categoryId').post(verifyJWT,createSubCategory)
router.route('/:id').patch(updateSubCategory).delete(verifyJWT,deleteSubCategory).get(getSubCategoryById)
router.route('/getAllSubCategoriesByCategoryId/:categoryId').get(getAllSubCategoriesByCategoryId)

export default router


