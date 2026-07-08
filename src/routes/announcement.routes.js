import { Router } from "express";
import { createAnnouncement, deleteAnnouncement, getAllAnnouncements, getAnnouncementById, statusChange, updateAnnouncement } from "../controllers/announcement.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(getAllAnnouncements)
router.route('/').post(checkRole("ADMIN","SUBADMIN","DEP_ADMIN","HR_ADMIN"),createAnnouncement)
router.route('/:id').patch(checkRole("ADMIN","SUBADMIN","DEP_ADMIN","HR_ADMIN"),updateAnnouncement).delete(checkRole("ADMIN","SUBADMIN","DEP_ADMIN","HR_ADMIN"),deleteAnnouncement).get(getAnnouncementById)
router.route("/change-status/:id").patch(checkRole("ADMIN","SUBADMIN","DEP_ADMIN","HR_ADMIN"),statusChange)
export default router   