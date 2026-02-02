import { Router } from "express";
import { sendTmBulkEmails, getAllTmBulkEmails } from "../controllers/sentTmEmail.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();      

router.use(verifyJWT)

router.route('/bulk').get(filterByRole,getAllTmBulkEmails)
router.route('/sentBulk').post(sendTmBulkEmails)
    

export default router   