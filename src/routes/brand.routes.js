import Router from 'express'
import {verifyJWT} from "../middlewares/auth.middleware.js"
import { createBrand, deleteBrand,  getAllBrands,  getAllBrandsByDepartmentId,  getBrandById, updateBrand } from '../controllers/brand.controller.js'
import { upload } from "../middlewares/multer.middleware.js";


const router= Router()

// router.use(verifyJWT)

router.route('/').get(getAllBrands)
router.route('/add').post(upload.single("image"),createBrand)
router.route('/:id').patch(upload.single("image"),updateBrand).delete(verifyJWT,deleteBrand).get(getBrandById)
router.route('/:departmentId/departmentBrand').get(getAllBrandsByDepartmentId)

export default router


