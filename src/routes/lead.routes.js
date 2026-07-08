import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import { createLead, deleteLead, getAllLeads, getAllLeadsByBrandId, getLeadByDepartId, getLeadById, importLeadFromExcel, updateActionLead } from "../controllers/lead.controller.js";
import { upload } from "../middlewares/upload.js"; 
import { LeadAction } from "../controllers/leadComment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),filterByRole,getAllLeads)
router.post("/import-excel",checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'), upload.single("file"), importLeadFromExcel);
router.route('/add').post(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),createLead)
router.route('/:id').delete(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN'),deleteLead).get(getLeadById)
router.route('/:leadId/updateActionLead').patch(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),LeadAction)
router.route('/:departmentId/departmentLead').get(getLeadByDepartId)
router.route('/:brandId/brandLead').get(getAllLeadsByBrandId)

    

export default router   