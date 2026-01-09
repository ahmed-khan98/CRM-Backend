import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import { createLead, deleteLead, getAllLeads, getAllLeadsByBrandId, getLeadByDepartId, getLeadById, importLeadFromExcel, updateActionLead } from "../controllers/lead.controller.js";
import { upload } from "../middlewares/upload.js"; 
import { LeadAction } from "../controllers/leadComment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(getAllLeads)
router.post("/import-excel", upload.single("file"), importLeadFromExcel);
router.route('/add').post(createLead)
router.route('/:id').delete(adminVerify,deleteLead).get(getLeadById)
router.route('/:leadId/updateActionLead').patch(adminVerify,LeadAction)
router.route('/:departmentId/departmentLead').get(getLeadByDepartId)
router.route('/:brandId/brandLead').get(getAllLeadsByBrandId)

    

export default router   