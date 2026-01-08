// routes/paymentLink.js

import express from "express";
import { PaymentLink } from "../models/paymentLinkModel.js";
import { generateAccessToken } from "../utils/paypalAuth.js";
import fetch from "node-fetch";
// Import karein aapki middleware (e.g., verifyAdmin)
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL; // .env se uthaayein

// ------------------------------------------------------------------
// A. ADMIN ENDPOINT: Create Payment Link (POST)
// URL: /api/v1/payment/admin/create
// ------------------------------------------------------------------
router.post("/admin/create", verifyAdmin, async (req, res) => {
  const {
    name,
    email,
    phoneNo,
    service,
    amount,
    merchantType,
    brandId,
    companyName,
    leadId,
    clientId,
  } = req.body;

  if (!name || !email || !service || !amount || !merchantType || !brandId) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    const newPaymentLink = await PaymentLink.create({
      name,
      email,
      phoneNo,
      service,
      amount,
      merchantType,
      brandId,
      companyName,
      leadId,
      clientId,
      paymentStatus: "pending",
    });

    // Yeh URL admin copy karke user ko dega
    const paymentLinkUrl = `${FRONTEND_BASE_URL}/pay/${newPaymentLink._id}`;

    return res.status(201).json({
      success: true,
      message: "Payment link created successfully.",
      data: {
        linkId: newPaymentLink._id,
        paymentLink: paymentLinkUrl,
      },
    });
  } catch (error) {
    console.error("Error creating payment link:", error);
    return res.status(500).json({ message: "Failed to create payment link." });
  }
});

// ------------------------------------------------------------------
// B. PUBLIC ENDPOINT: Get Link Details for UI (GET)
// URL: /api/v1/payment/public/:linkId
// ------------------------------------------------------------------
router.get("/public/:linkId", async (req, res) => {
  const { linkId } = req.params;

  try {
    const linkDetails = await PaymentLink.findById(linkId);

    if (!linkDetails) {
      return res.status(404).json({ message: "Payment link not found." });
    }

    const client_id =
      linkDetails.merchantType === "Kinatech Business Solutions LLC"
        ? process.env.PAYPAL1_CLIENT_ID
        : linkDetails.merchantType === "Pay Kinetic"
          ? process.env.PAYPAL2_CLIENT_ID
          : process.env.PAYPAL3_CLIENT_ID;

    return res.status(200).json({
      success: true,
      data: linkDetails,
      paypalClientId: client_id,
    });
  } catch (error) {
    console.error("Error fetching payment link details:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// ------------------------------------------------------------------
// C. PUBLIC ENDPOINT: Create PayPal Order (POST)
// Frontend ka createOrder function isko call karega.
// URL: /api/v1/payment/public/:linkId/create-order
// ------------------------------------------------------------------
router.post("/public/:linkId/create-order", async (req, res) => {
  const { linkId } = req.params;

  try {
    const linkDetails = await PaymentLink.findById(linkId);

    if (!linkDetails || linkDetails.paymentStatus !== "pending") {
      return res.status(400).json({ message: "Link already paid or invalid." });
    }

    const { amount, service, merchantType, _id, name, email } = linkDetails;
    const accessToken = await generateAccessToken(merchantType);

    const orderData = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD", // Aapki currency yahan set hogi
            value: amount.toFixed(2),
          },
          description: `Service: ${service} for ${name}`,
          custom_id: `PAYMENTLINK_${_id.toString()}`, // Database lookup ke liye
          // payee: {
          // Agar aapko specific PayPal email address par payment chahiye (optional)
          // email_address: merchantType === 'paypal1' ? 'paypal1-email@example.com' : 'paypal2-email@example.com'
          // },
        },
      ],
      application_context: {
        return_url: `${FRONTEND_BASE_URL}/payment-success?id=${linkId}`,
        cancel_url: `${FRONTEND_BASE_URL}/payment-failed?id=${linkId}`,
        user_action: "PAY_NOW",
      },
    };

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal Order Creation Failed:", data);
      return res
        .status(response.status)
        .json({ message: data.message || "Failed to create PayPal order" });
    }

    return res.status(200).json({
      success: true,
      data: { transactionId: data.id }, // PayPal Order ID
    });
  } catch (error) {
    console.error("API Error in Create Order:", error.message);
    return res.status(500).json({
      message: error.message || "Internal server error during order creation",
    });
  }
});

// ------------------------------------------------------------------
// D. PUBLIC ENDPOINT: Capture Payment (POST)
// Frontend ka onApprove function isko call karega.
// URL: /api/v1/payment/public/:linkId/charge
// ------------------------------------------------------------------
router.post("/public/:linkId/charge", async (req, res) => {
  const { linkId } = req.params;
  const { orderID } = req.body; // orderID frontend se aayega

  try {
    const linkDetails = await PaymentLink.findById(linkId);

    if (!linkDetails || linkDetails.paymentStatus !== "pending") {
      return res.status(400).json({ message: "Link already paid or invalid." });
    }

    const accessToken = await generateAccessToken(linkDetails.merchantType);

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal Capture Failed:", data);
      // Failed payment status update
      linkDetails.paymentStatus = "failed";
      await linkDetails.save();
      return res
        .status(response.status)
        .json({ message: data.message || "Payment capture failed" });
    }

    // Zaroori Step: Database Update (Only if PayPal r`eports 'COMPLETED')
    if (data.status === "COMPLETED") {
      linkDetails.paymentStatus = "paid";
      // transaction ID save karein
      linkDetails.paypalOrderId = data.id;
      await linkDetails.save();
    }

    return res.status(200).json({
      success: true,
      message: "Payment charged successfully.",
      data: {
        status: data.status,
        linkDetails: linkDetails,
      },
    });
  } catch (error) {
    console.error("API Error in Capture Payment:", error.message);
    return res.status(500).json({
      message: error.message || "Internal server error during payment capture",
    });
  }
});

export default router;
