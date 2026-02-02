import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";
import { getMonthlyAttendance, getTodayUserAttendance, TimeIn, TimeOut } from "../controllers/attendence.controller.js";

const router=Router();


router.use(verifyJWT)

router.route('/todayUserAttendence').get(getTodayUserAttendance)
router.route('/my-attendance').get(getMonthlyAttendance)
router.route('/time-in').post(TimeIn)
router.route('/time-out').post(TimeOut)
// router.route("/change-status/:id").patch(checkRole("ADMIN",'SUBADMIN'),statusChange)




export default router   