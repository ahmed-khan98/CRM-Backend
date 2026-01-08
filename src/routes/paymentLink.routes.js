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

const router = Router();

// router.use(adminVerify);

router.route("/").get(adminVerify,getAllPaymentLinks);
router.route("/add").post(adminVerify,createPaymentLink);
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
