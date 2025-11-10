import Router from 'express'
import { createTemplate, deleteTemplate, getAllTemplates, getTemplateById, updateTemplate } from '../controllers/emailTemplate.controller.js'

const router= Router()

// router.use(verifyJWT)

router.route('/').get(getAllTemplates)
router.route('/add').post(createTemplate)
router.route('/:id').patch(updateTemplate).delete(deleteTemplate).get(getTemplateById)

export default router


