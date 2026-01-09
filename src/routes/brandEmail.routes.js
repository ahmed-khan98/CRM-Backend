import Router from 'express'
import { createBrandEmail, deleteBrandEmail, getAllBrandEmails, getBrandEmailByBrandId, getBrandEmailById, updateBrandEmail } from '../controllers/brandEmail.controller.js'
import { adminVerify } from '../middlewares/adminVerify.js'
import { verifyJWT } from '../middlewares/auth.middleware.js'

const router= Router()

router.use(verifyJWT)

router.route('/').get(getAllBrandEmails)
router.route('/add').post(adminVerify,createBrandEmail)
router.route('/:id').patch(adminVerify,updateBrandEmail).delete(adminVerify,deleteBrandEmail).get(getBrandEmailById)
router.route('/:brandId/brandById').get(getBrandEmailByBrandId)

export default router


