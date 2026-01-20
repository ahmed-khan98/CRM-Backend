import { Router } from "express";
import { sentSingleEmail, getSendEmailByLeadId, sendBulkEmails, getAllBulkEmails, usingSpoofing } from "../controllers/SentEmail.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();      

router.use(verifyJWT)

router.route('/bulk').get(filterByRole,getAllBulkEmails)
router.route('/add').post(sentSingleEmail)
router.route('/sentBulk').post(sendBulkEmails)
router.route('/spoofig').post(usingSpoofing)
router.route('/:id').get(getSendEmailByLeadId)
    

export default router   