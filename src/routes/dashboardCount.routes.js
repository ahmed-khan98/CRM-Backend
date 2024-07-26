import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getDashboardCount } from "../controllers/dashboard-count.controller.js";

const router = Router()

router.use(verifyJWT)

router.route('/dashboardCount').get(getDashboardCount)

export default router;