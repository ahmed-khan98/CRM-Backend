import { Router } from "express";
import { adminVerify } from "../middlewares/adminVerify.js";
import {
  createPaymentLink,
  deletePaymentLink,
  getAllPaymentLinks,
  getPaymentLinksByBrandId,
  getPaymentLinkById,
  updatePaymentLink,
} from "../controllers/paymentLink.controller.js";

const router = Router();

// router.use(adminVerify);

router.route("/").get(getAllPaymentLinks);
router.route("/add").post(createPaymentLink);
router
  .route("/:id")
  .delete(deletePaymentLink)
  .get(getPaymentLinkById)
  .patch(updatePaymentLink);
router.route("/:brandId/brandPaymentLink").get(getPaymentLinksByBrandId);
router.route("/:leadId/leadPaymentLink").get(getPaymentLinkById);

export default router;
