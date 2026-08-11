import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import {
  createPaymentLink,
  deletePaymentLink,
  getAllPaymentLinks,
  getPaymentLinksByBrandId,
  getPaymentLinkById,
  updatePaymentLink,
  createPaypalOrderLinkById,
  paymentChargerByOrderId,
  statusChange,
} from "../controllers/paymentLink.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router = Router();
const allowRoles = ["ADMIN","SUBADMIN","DEP_ADMIN","USER","FINANCE_ADMIN"];

// router.use(verifyJWT);

router.route("/").get(verifyJWT,checkRole(...allowRoles),filterByRole,getAllPaymentLinks);
router.route("/add").post(verifyJWT,checkRole(...allowRoles),createPaymentLink);
router.route("/pay-with-paypal").post(createPaypalOrderLinkById);
router.route("/pay-with-paypal/:orderID/charge").post(paymentChargerByOrderId);
router
  .route("/:id")
  .delete(verifyJWT,checkRole("ADMIN","SUBADMIN"),deletePaymentLink)
  .get(getPaymentLinkById)
  .patch(verifyJWT,checkRole(...allowRoles),updatePaymentLink);
router.route("/:brandId/brandPaymentLink").get(verifyJWT,getPaymentLinksByBrandId);
router.route("/:leadId/leadPaymentLink").get(verifyJWT,getPaymentLinkById);
router.route("/:id/status").patch(verifyJWT,checkRole(...allowRoles),filterByRole,statusChange);

export default router;
