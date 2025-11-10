import Router from 'express'
import { createBrandEmail, deleteBrandEmail, getAllBrandEmails, getBrandEmailByBrandId, getBrandEmailById, updateBrandEmail } from '../controllers/brandEmail.controller.js'

const router= Router()

// router.use(verifyJWT)

router.route('/').get(getAllBrandEmails)
router.route('/add').post(createBrandEmail)
router.route('/:id').patch(updateBrandEmail).delete(deleteBrandEmail).get(getBrandEmailById)
router.route('/:brandId/brandById').get(getBrandEmailByBrandId)

export default router


