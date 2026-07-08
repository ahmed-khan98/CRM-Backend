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

// router.use(verifyJWT);

router.route("/").get(verifyJWT,checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER','FINANCE_ADMIN'),filterByRole,getAllPaymentLinks);
router.route("/add").post(verifyJWT,checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER','FINANCE_ADMIN'),createPaymentLink);
router.route("/pay-with-paypal").post(createPaypalOrderLinkById);
router.route("/pay-with-paypal/:orderID/charge").post(paymentChargerByOrderId);
router
  .route("/:id")
  .delete(verifyJWT,checkRole("ADMIN","SUBADMIN"),deletePaymentLink)
  .get(getPaymentLinkById)
  .patch(verifyJWT,checkRole("ADMIN",'SUBADMIN','DEP_ADMIN','USER','FINANCE_ADMIN'),updatePaymentLink);
router.route("/:brandId/brandPaymentLink").get(verifyJWT,getPaymentLinksByBrandId);
router.route("/:leadId/leadPaymentLink").get(verifyJWT,getPaymentLinkById);
router.route("/:id/status").patch(verifyJWT,checkRole("ADMIN","SUBADMIN","DEP_ADMIN","USER","FINANCE_ADMIN"),filterByRole,statusChange);

export default router;
