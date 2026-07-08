import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getDashboardCount } from "../controllers/dashboard-count.controller.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router = Router()

router.use(verifyJWT)

router.route('/count').get(filterByRole,getDashboardCount)

export default router;