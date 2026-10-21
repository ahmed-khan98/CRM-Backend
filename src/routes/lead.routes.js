import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import { createLead, deleteLead, getAllLeads, getAllLeadsByBrandId, getLeadByDepartId, getLeadById, importLeadFromExcel, updateLead } from "../controllers/lead.controller.js";
import { upload } from "../middlewares/upload.js"; 
import { LeadAction } from "../controllers/leadComment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { processDueLeadScheduleReminders } from "../utils/notifyLeadSchedule.js";

const router=Router();      

router.use(verifyJWT)

router.route('/').get(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),filterByRole,getAllLeads)
router.post("/import-excel",checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'), upload.single("file"), importLeadFromExcel);
router.post(
  "/run-schedule-reminders",
  checkRole("ADMIN", "SUBADMIN"),
  asyncHandler(async (req, res) => {
    const result = await processDueLeadScheduleReminders();
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Schedule reminders processed"));
  }),
);
router.route('/add').post(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),createLead)
router.route('/:id').delete(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN'),deleteLead).get(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),filterByRole,getLeadById).patch(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),updateLead)
router.route('/:leadId/updateActionLead').patch(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),LeadAction)
router.route('/:departmentId/departmentLead').get(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),filterByRole,getLeadByDepartId)
router.route('/:brandId/brandLead').get(checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER'),filterByRole,getAllLeadsByBrandId)

    

export default router   