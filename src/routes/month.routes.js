import { Router } from "express";
import { createMonth,closeMonth,getAllMonths,deleteMonth } from "../controllers/month.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";

const router=Router();

router.use(verifyJWT)

router.route('/').get(getAllMonths).post(checkRole("ADMIN","SUBADMIN","HR_ADMIN"),createMonth)
router.route('/:id').patch(checkRole("ADMIN","SUBADMIN"),closeMonth).get(getAllMonths).delete(checkRole("ADMIN",'SUBADMIN'),deleteMonth)
export default router   