import Router from 'express'
import { createBrandEmail, deleteBrandEmail, getAllBrandEmails, getBrandEmailByBrandId, getBrandEmailById, updateBrandEmail } from '../controllers/brandEmail.controller.js'
import { adminVerify } from '../middlewares/adminVerify.js'
import { verifyJWT } from '../middlewares/auth.middleware.js'
import { checkRole } from '../middlewares/checkRole.js'
import { filterByRole } from '../middlewares/filterByRole.js'

const router= Router()

router.use(verifyJWT)

router.route('/').get(filterByRole,getAllBrandEmails)
router.route('/add').post(checkRole("ADMIN",'SUBADMIN'),createBrandEmail)
router.route('/:id').patch(checkRole("ADMIN",'SUBADMIN'),updateBrandEmail).delete(adminVerify,deleteBrandEmail).get(getBrandEmailById)
router.route('/:brandId/brandById').get(getBrandEmailByBrandId)

export default router


