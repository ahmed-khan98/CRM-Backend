import Router from 'express'
import { createTemplate, deleteTemplate, getAllTemplates, getTemplateById, updateTemplate } from '../controllers/emailTemplate.controller.js'
import { adminVerify } from '../middlewares/adminVerify.js'
import { verifyJWT } from '../middlewares/auth.middleware.js'

const router= Router()

router.use(verifyJWT)

router.route('/').get(getAllTemplates)
router.route('/add').post(createTemplate)
router.route('/:id').patch(updateTemplate).delete(adminVerify,deleteTemplate).get(getTemplateById)

export default router


