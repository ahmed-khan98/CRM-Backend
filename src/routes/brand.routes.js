import Router from 'express'
import { createBrand, deleteBrand,  getAllBrands,  getAllBrandsByDepartmentId,  getBrandById, updateBrand } from '../controllers/brand.controller.js'
import { upload } from "../middlewares/multer.middleware.js";
import { adminVerify } from '../middlewares/adminVerify.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { checkRole } from '../middlewares/checkRole.js';
import { filterByRole } from '../middlewares/filterByRole.js';


const router= Router()

const manageBrandRoles = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

router.route('/').get(filterByRole,getAllBrands)
router.route('/add').post(
  verifyJWT,
  checkRole(...manageBrandRoles),
  upload.single("image"),
  createBrand
)
router.route('/:id')
  .patch(verifyJWT, checkRole(...manageBrandRoles), upload.single("image"), updateBrand)
  .delete(adminVerify, deleteBrand)
  .get(getBrandById)
router.route('/:departmentId/departmentBrand').get(getAllBrandsByDepartmentId)

export default router


