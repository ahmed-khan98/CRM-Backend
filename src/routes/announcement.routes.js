import { Router } from "express";
import { createAnnouncement, deleteAnnouncement, getAllAnnouncements, getAnnouncementById, statusChange, updateAnnouncement } from "../controllers/announcement.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();
const allowRoles = ["ADMIN","SUBADMIN","DEP_ADMIN","HR_ADMIN"];
router.use(verifyJWT)

router.route('/').get(getAllAnnouncements)
router.route('/').post(checkRole(...allowRoles),createAnnouncement)
router.route('/:id').patch(checkRole(...allowRoles),updateAnnouncement).delete(checkRole(...allowRoles),deleteAnnouncement).get(getAnnouncementById)
router.route("/change-status/:id").patch(checkRole(...allowRoles),statusChange)
export default router   