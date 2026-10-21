import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getDashboardCount,
  getDashboardAttendanceSummary,
  getDashboardMonthlySales,
} from "../controllers/dashboard-count.controller.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router = Router()

router.use(verifyJWT)

router.route('/count').get(filterByRole, getDashboardCount);
router
  .route("/attendance-summary")
  .get(filterByRole, getDashboardAttendanceSummary);
router.route("/monthly-sales").get(filterByRole, getDashboardMonthlySales);

export default router;