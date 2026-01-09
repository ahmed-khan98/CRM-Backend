import Router from 'express'
import { createBrand, deleteBrand,  getAllBrands,  getAllBrandsByDepartmentId,  getBrandById, updateBrand } from '../controllers/brand.controller.js'
import { upload } from "../middlewares/multer.middleware.js";
import { adminVerify } from '../middlewares/adminVerify.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';


const router= Router()

router.use(verifyJWT)

router.route('/').get(getAllBrands)
router.route('/add').post(adminVerify,upload.single("image"),createBrand)
router.route('/:id').patch(adminVerify,upload.single("image"),updateBrand).delete(adminVerify,deleteBrand).get(getBrandById)
router.route('/:departmentId/departmentBrand').get(getAllBrandsByDepartmentId)

export default router


