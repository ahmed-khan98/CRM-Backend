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

const router = Router();

router.use(verifyJWT);

router.route("/").get(getAllPaymentLinks);
router.route("/add").post(createPaymentLink);
router.route("/pay-with-paypal").post(createPaypalOrderLinkById);
router.route("/pay-with-paypal/:orderId/charge").post(paymentChargerByOrderId);
router
  .route("/:id")
  .delete(adminVerify,deletePaymentLink)
  .get(getPaymentLinkById)
  .patch(adminVerify,updatePaymentLink);
router.route("/:brandId/brandPaymentLink").get(getPaymentLinksByBrandId);
router.route("/:leadId/leadPaymentLink").get(getPaymentLinkById);

export default router;
