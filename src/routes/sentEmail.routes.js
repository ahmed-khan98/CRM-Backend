import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import { sentSingleEmail, getSendEmailByLeadId, sendBulkEmails, getAllBulkEmails } from "../controllers/SentEmail.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();      

router.use(verifyJWT)

router.route('/bulk').get(getAllBulkEmails)
router.route('/add').post(sentSingleEmail)
router.route('/sentBulk').post(sendBulkEmails)
router.route('/:id').get(getSendEmailByLeadId)
    

export default router   