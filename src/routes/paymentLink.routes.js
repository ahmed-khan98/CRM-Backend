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
} from "../controllers/paymentLink.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { filterByRole } from "../middlewares/filterByRole.js";

const router = Router();

// router.use(verifyJWT);

router.route("/").get(filterByRole,getAllPaymentLinks);
router.route("/add").post(verifyJWT,createPaymentLink);
router.route("/pay-with-paypal").post(createPaypalOrderLinkById);
router.route("/pay-with-paypal/:orderID/charge").post(paymentChargerByOrderId);
router
  .route("/:id")
  .delete(verifyJWT,checkRole("ADMIN",'SUBADMIN'),deletePaymentLink)
  .get(getPaymentLinkById)
  .patch(updatePaymentLink);
router.route("/:brandId/brandPaymentLink").get(getPaymentLinksByBrandId);
router.route("/:leadId/leadPaymentLink").get(getPaymentLinkById);

export default router;
