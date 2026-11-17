import mongoose from "mongoose";
import { Brand } from "../models/brand.model.js";
import { Client } from "../models/client.model.js";
import { Employee } from "../models/employee.model.js";
import { Month } from "../models/month.model.js";
import { PaymentLink } from "../models/paymentLink.model.js";
import { Sale } from "../models/sale.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateAccessToken } from "../utils/paypalAuth.js";
import {
  createPaymentIntent,
  getStripeConfig,
  retrievePaymentIntent,
} from "../utils/stripeClient.js";
import {
  brandHasDepartment,
  brandPrimaryDepartmentId,
} from "../utils/brandDepartments.js";
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

const isStripeMerchant = (type) =>
  type === "Stripe" || type === "stripe";

const toSaleMerchantType = (type) =>
  isStripeMerchant(type) ? "Stripe" : type;

const createSaleFromPaymentLink = async (linkDetails, safeMonthId) => {
  return Sale.create({
    ...(linkDetails.brandId && { brandId: linkDetails.brandId }),
    ...(linkDetails.clientId && { clientId: linkDetails.clientId }),
    departmentId: linkDetails.departmentId,
    monthId: safeMonthId,
    paymentId: linkDetails._id,
    merchantType: toSaleMerchantType(linkDetails.merchantType),
    service: linkDetails.service,
    amount: linkDetails.amount,
    description: linkDetails.description,
    seller: linkDetails.seller,
    type: linkDetails.type || "FRESH",
    saleDate: linkDetails.paidAt,
    ...(linkDetails.currency && { currency: linkDetails.currency }),
    ...(linkDetails.agent && { agent: linkDetails.agent }),
  });
};

const markPaymentLinkPaidAndCreateSale = async (
  linkDetails,
  { stripePaymentIntentId } = {},
) => {
  const existingMonth = await Month.findOne({ status: "OPEN" });
  const safeMonthId = existingMonth
    ? existingMonth._id
    : new mongoose.Types.ObjectId();

  const updated = await PaymentLink.findOneAndUpdate(
    { _id: linkDetails._id, paymentStatus: "pending" },
    {
      $set: {
        paymentStatus: "paid",
        paidAt: new Date(),
        ...(stripePaymentIntentId && { stripePaymentIntentId }),
      },
    },
    { new: true },
  );

  if (!updated) {
    return PaymentLink.findById(linkDetails._id);
  }

  await createSaleFromPaymentLink(updated, safeMonthId);
  return updated;
};

const pickValidObjectId = (...values) => {
  for (const value of values) {
    const id = typeof value === "string" ? value.trim() : value;
    if (id && mongoose.Types.ObjectId.isValid(id)) return id;
  }
  return null;
};

const createPaymentLink = asyncHandler(async (req, res) => {
  const {
    leadId,
    clientId,
    brandId,
    departmentId,
    name,
    phoneNo,
    email,
    companyName,
    merchantType,
    service,
    amount,
    description,
    currency,
    agent,
    type,
    seller,
    fronter,
  } = req.body;

  const saleType = type?.toUpperCase()?.trim();
  const resolvedSeller = pickValidObjectId(seller, fronter);
  const resolvedAgent = pickValidObjectId(agent);

  // 1. Standard Fields Validation
  if (
    [
      name,
      phoneNo,
      email,
      merchantType,
      service,
      amount,
      type,
      departmentId,
    ].some((field) => field === undefined || field === "") ||
    !resolvedSeller
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Agent required only for FRESH sales
  if (saleType === "FRESH" && !resolvedAgent) {
    throw new ApiError(400, "Agent info is required when sale type is FRESH.");
  }

  if (brandId) {
    const existBrand = await Brand.findById(brandId).select(
      "departmentId departmentIds",
    );
    if (!existBrand) {
      throw new ApiError(404, "Brand not found");
    }
    if (!brandHasDepartment(existBrand, departmentId)) {
      throw new ApiError(400, "Brand is not linked to this department");
    }
  }

  let finalClientId = clientId;

  // 3. Agar Client exist nahi karta to naya create karein
  if (!clientId) {
    // Check if client with same email already exists to avoid duplication crashes
    const existingClient = await Client.findOne({ email: email.toLowerCase() });

    if (existingClient) {
      finalClientId = existingClient._id;
    } else {
      const handleBy =
        saleType === "FRESH"
          ? pickValidObjectId(resolvedAgent, resolvedSeller)
          : resolvedSeller;

      if (!handleBy) {
        throw new ApiError(400, "Valid seller or agent is required to create client");
      }

      const client = await Client.create({
        name,
        phoneNo,
        email,
        departmentId,
        handleBy,
        companyName,
        signupType: "other",
        ...(brandId && { brandId }),
      });
      finalClientId = client._id;
    }
  }

  // 🚀 4. Conditional Object Mapping for PaymentLink Creation
  const paymentLinkPayload = {
    ...(leadId && { leadId }),
    ...(brandId && { brandId }),
    clientId: finalClientId,
    departmentId,
    name,
    phoneNo,
    email,
    companyName,
    merchantType,
    service,
    amount,
    description,
    seller: resolvedSeller,
    type,
    ...(currency && { currency }),
  };

  if (saleType === "FRESH" && resolvedAgent) {
    paymentLinkPayload.agent = resolvedAgent;
  }

  const link = await PaymentLink.create(paymentLinkPayload);

  if (!link) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, link, "Payment link created successfully"));
});

const updatePaymentLink = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    leadId,
    clientId,
    brandId,
    name,
    phoneNo,
    email,
    companyName,
    merchantType,
    service,
    amount,
    description,
    currency,
  } = req.body;

  const existPaymentlink = await PaymentLink.findById(id);

  if (!existPaymentlink) {
    throw new ApiError(409, "Payment link not found");
  }
  if (
    existPaymentlink?.status === "paid" ||
    existPaymentlink?.status === "failed"
  ) {
    throw new ApiError(
      409,
      `Cannot update after payment status is ${existPaymentlink.status}`,
    );
  }

  const existBrand = await Brand.findById(brandId).select(
    "departmentId departmentIds",
  );
  if (!existBrand) {
    throw new ApiError(404, "Brand not found");
  }

  // Keep payment's own department when still linked to brand; else primary
  const nextDepartmentId = brandHasDepartment(
    existBrand,
    existPaymentlink.departmentId,
  )
    ? existPaymentlink.departmentId
    : brandPrimaryDepartmentId(existBrand);

  const linkData = {
    leadId,
    clientId,
    brandId,
    name,
    phoneNo,
    email,
    companyName,
    merchantType,
    service,
    amount,
    description,
    currency,
    departmentId: nextDepartmentId,
  };

  const link = await PaymentLink.findByIdAndUpdate(
    id,
    {
      $set: linkData,
    },
    { new: true },
  );

  if (!link) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, link, "Payment link updated Successfully"));
});

const deletePaymentLink = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existLink = await PaymentLink.findById(id);

  if (!existLink) {
    throw new ApiError(409, "link not found");
  }

  if (existLink.paymentStatus === "paid") {
    throw new ApiError(400, "Paid payment link cannot be deleted");
  }

  const link = await PaymentLink.findByIdAndDelete(id);

  if (!link) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, link, "Payment link deleted Successfully"));
});

const getAllPaymentLinks = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 200);
  const skip = (page - 1) * limit;
  const { search = "", departmentId } = req.query;

  const query = { ...req?.roleFilter };

  if (departmentId && !req.roleFilter?.departmentId) {
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      throw new ApiError(400, "Invalid departmentId");
    }

    query.departmentId = new mongoose.Types.ObjectId(departmentId);
  }

  const trimmedSearch = search.trim();

  if (trimmedSearch) {
    const searchRegex = new RegExp(trimmedSearch, "i");
    const [matchedClients, matchedEmployees] = await Promise.all([
      Client.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { companyName: searchRegex },
        ],
      }).select("_id"),
      Employee.find({ fullName: searchRegex }).select("_id"),
    ]);

    const clientIds = matchedClients.map((client) => client._id);
    const employeeIds = matchedEmployees.map((employee) => employee._id);

    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { companyName: searchRegex },
      ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
      ...(employeeIds.length
        ? [{ seller: { $in: employeeIds } }, { agent: { $in: employeeIds } }]
        : []),
    ];
  }

  const [items, total] = await Promise.all([
    PaymentLink.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("clientId", "name email phoneNo")
      .populate("brandId", "name")
      .populate("departmentId", "name")
      .populate("seller", "fullName")
      .populate("agent", "fullName")
      .lean(),
    PaymentLink.countDocuments(query),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const meta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, { items, meta }, "All Payment link found"));
});

const getPaymentLinksByBrandId = asyncHandler(async (req, res) => {
  const { brandId } = req?.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 1, 1), 200);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    PaymentLink.find({ brandId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("client", "name email phoneNo")
      .populate("brandId", "name")
      .populate("departmentId", "name")
      .populate("seller", "fullName")
      .populate("agent", "fullName")
      .lean(),
    PaymentLink.countDocuments({ brandId }),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const meta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, { items, meta }, "Brand All Payment link found"),
    );
});

const getPaymentLinkById = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const link = await PaymentLink.findById(id)
    .populate("leadId", "name")
    .populate("brandId", "name image")
    .populate("clientId", "name email phoneNo")
    .populate("departmentId", "name")
      .populate("seller", "fullName")
      .populate("agent", "fullName")
    .lean();

  if (!link) {
    throw new ApiError(404, "payment link not found");
    // return res.status(404).json({ error: 'Lead not found' });
  }

  const isStripe = isStripeMerchant(link.merchantType);
  const client_id = isStripe
    ? null
    : link.merchantType === "Skyliner Trading LLC"
      ? process.env.PAYPAL3_CLIENT_ID
      : process.env.PAYPAL1_CLIENT_ID;

  const stripe = getStripeConfig();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          ...link,
          paypalClientId: client_id,
          ...(isStripe && {
            stripePublishableKey: stripe.publishableKey || null,
          }),
        },
        "Payment link found",
      ),
    );
});

const createPaypalOrderLinkById = asyncHandler(async (req, res) => {
  // Frontend se ab sirf id aur brand name (brand) aayega
  const { id, brand } = req.body;

  let finalAmount = 0;
  let finalService = ["Promotional Publishing Package"]; // Default hardcoded service
  let descriptionText = "";
  let merchantType = "";
  let linkDetails = null;

  if (brand) {
    const normalizedBrand = brand.toLowerCase().trim();

    if (normalizedBrand === "writerz paradise") {
      finalAmount = 99;
      merchantType = "Augmentus";
    } else if (
      normalizedBrand === "boston publishers" ||
      normalizedBrand === "boston publisher"
    ) {
      finalAmount = 110;
      merchantType = "Augmentus";
    } else {
      finalAmount = 150;
      merchantType = "Augmentus";
    }

    descriptionText = `Service: ${finalService[0]} for Master Checkout`;
  } else {
    linkDetails = await PaymentLink.findById(id);
    if (!linkDetails || linkDetails.paymentStatus !== "pending") {
      return res.status(400).json({ message: "Link already paid or invalid." });
    }
    finalAmount = linkDetails.amount;
    finalService = linkDetails.service;
    merchantType = linkDetails.merchantType;
    descriptionText =
      linkDetails.description ||
      `Service: ${finalService[0]} for ${linkDetails.name}`;
    // descriptionText = `Service: ${finalService[0]} for ${linkDetails.name}`;
  }

  // Generate Token and Create Order on PayPal
  const accessToken = await generateAccessToken(merchantType);

  const orderData = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: brand ? "USD" : linkDetails.currency || "USD",
          value: finalAmount.toFixed(2),
        },
        description: descriptionText,
        custom_id: brand ? `MASTER_${id}_${brand}` : `PAYMENTLINK_${id}`,
      },
    ],
    application_context: {
      return_url: `${process.env.FRONTEND_BASE_URL}/payment-success`,
      cancel_url: `${process.env.FRONTEND_BASE_URL}/payment-failed`,
      user_action: "PAY_NOW",
    },
  };

  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderData),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    console.log("PAYPAL ERROR:", data);
    return res
      .status(response.status)
      .json({ message: data.message || "Failed to create PayPal order" });
  }

  return res.status(200).json(new ApiResponse(200, { transactionId: data.id }));
});

const paymentChargerByOrderId = asyncHandler(async (req, res) => {
  const { orderID } = req.params;
  const { id, brand } = req.body;

  let merchantType = "";
  let linkDetails = null;

  if (brand) {
    const brandDetails = await Brand.findById(id);
    if (!brandDetails) {
      return res
        .status(404)
        .json({ message: "Brand configuration not found." });
    }
    merchantType = "Augmentus";
  } else {
    linkDetails = await PaymentLink.findById(id);
    if (!linkDetails || linkDetails.paymentStatus !== "pending") {
      return res
        .status(400)
        .json({ message: "Payment Link already paid or invalid." });
    }
    merchantType = linkDetails.merchantType;
  }

  const accessToken = await generateAccessToken(merchantType);

  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    if (!brand && linkDetails) {
      linkDetails.paymentStatus = "failed";
      await linkDetails.save();
    }
    return res
      .status(response.status)
      .json({ message: "Transaction could not be processed by payment gateway." });
  }

  const existingMonth = await Month.findOne({ status: "OPEN" });
   const safeMonthId = existingMonth ? existingMonth._id : new mongoose.Types.ObjectId();

  if (data.status === "COMPLETED") {
    if (brand) {
      let verifiedAmount = 0;
      const normalizedBrand = brand.toLowerCase().trim();

      if (normalizedBrand === "writerz paradise") {
        verifiedAmount = 99;
      } else if (
        normalizedBrand === "boston publishers" ||
        normalizedBrand === "boston publisher"
      ) {
        verifiedAmount = 110;
      } else {
        verifiedAmount = 150;
      }

      // CASE B: Naya clean Document pipeline create karein database table me
      linkDetails = await PaymentLink.create({
        brandId: id, // Mapping brand object identity
        departmentId: "68c0775f7461c6fef325f17c",
        merchantType: "Augmentus",
        amount: verifiedAmount,
        currency: "USD",
        paidAt: new Date(),
        service: ["Promotional Publishing Package"],
        paymentStatus: "paid", // Instantly generated as paid
        paypalOrderId: data.id,
        seller:'69f8f464177f7dabdb00c90c',
        // name: "Master Link Client",
        // email: "signup-client@paypal-checkout.com",
        // phoneNo: "0000000000",
        isMasterPayemntLink: true,
      });
    } else {
      // CASE A: Standard entry logic lookup manipulation update
      linkDetails.paymentStatus = "paid";
      linkDetails.paypalOrderId = data.id;
      linkDetails.paidAt = new Date();
      await linkDetails.save();
    }

    await createSaleFromPaymentLink(linkDetails, safeMonthId);
  }

  return res.status(200).json({
    success: true,
    message: "Payment processed and charged successfully",
    data: {
      status: data.status,
      linkDetails: linkDetails, // Front-end successful dynamic check complete template return
    },
  });
});

/**
 * Create Stripe PaymentIntent for a payment link.
 * Body: { id }
 * Returns: { clientSecret, paymentIntentId }
 */
const createStripePaymentIntent = asyncHandler(async (req, res) => {
  const { id } = req.body || {};
  if (!id) throw new ApiError(400, "Payment link id is required");

  const linkDetails = await PaymentLink.findById(id);
  if (!linkDetails) throw new ApiError(404, "Payment link not found");
  if (!isStripeMerchant(linkDetails.merchantType)) {
    throw new ApiError(400, "This payment link is not configured for Stripe");
  }
  if (!linkDetails.isActive) {
    throw new ApiError(400, "Payment link is disabled");
  }
  if (linkDetails.paymentStatus !== "pending") {
    throw new ApiError(400, "Payment link already paid or invalid");
  }

  let intent;
  try {
    intent = await createPaymentIntent({
      amount: linkDetails.amount,
      currency: linkDetails.currency || "USD",
      paymentLinkId: linkDetails._id,
      description:
        linkDetails.description ||
        `Payment link ${linkDetails._id}`,
    });
  } catch (err) {
    console.error("STRIPE INTENT ERROR:", err?.message || err);
    throw new ApiError(502, err.message || "Failed to create Stripe payment");
  }

  linkDetails.stripePaymentIntentId = intent.id;
  await linkDetails.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      },
      "Stripe PaymentIntent created",
    ),
  );
});

/**
 * Confirm Stripe payment after Elements success.
 * Body: { id, paymentIntentId }
 */
const confirmStripePayment = asyncHandler(async (req, res) => {
  const { id, paymentIntentId } = req.body || {};
  if (!id || !paymentIntentId) {
    throw new ApiError(400, "Payment link id and paymentIntentId are required");
  }

  const linkDetails = await PaymentLink.findById(id);
  if (!linkDetails) throw new ApiError(404, "Payment link not found");
  if (!isStripeMerchant(linkDetails.merchantType)) {
    throw new ApiError(400, "This payment link is not configured for Stripe");
  }

  if (linkDetails.paymentStatus === "paid") {
    return res.status(200).json(
      new ApiResponse(
        200,
        { status: "succeeded", linkDetails },
        "Payment already recorded",
      ),
    );
  }

  let intent;
  try {
    intent = await retrievePaymentIntent(paymentIntentId);
  } catch (err) {
    console.error("STRIPE RETRIEVE ERROR:", err?.message || err);
    throw new ApiError(502, err.message || "Failed to verify Stripe payment");
  }

  if (intent.metadata?.paymentLinkId !== String(linkDetails._id)) {
    throw new ApiError(400, "PaymentIntent does not match this payment link");
  }

  if (intent.status !== "succeeded") {
    throw new ApiError(
      402,
      `Stripe payment not completed (status: ${intent.status})`,
    );
  }

  const updated = await markPaymentLinkPaidAndCreateSale(linkDetails, {
    stripePaymentIntentId: intent.id,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { status: intent.status, paymentIntentId: intent.id, linkDetails: updated },
      "Payment processed and charged successfully",
    ),
  );
});

/**
 * Optional Stripe webhook (payment_intent.succeeded).
 * Primary flow is confirmStripePayment (sync after Elements).
 */
const stripeWebhook = asyncHandler(async (req, res) => {
  const { webhookSecret } = getStripeConfig();
  let event = req.body;

  if (webhookSecret) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const signature = req.headers["stripe-signature"];
    try {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("STRIPE WEBHOOK SIGNATURE ERROR:", err.message);
      throw new ApiError(400, `Webhook Error: ${err.message}`);
    }
  }

  if (event?.type === "payment_intent.succeeded") {
    const intent = event.data?.object;
    const paymentLinkId = intent?.metadata?.paymentLinkId;
    if (paymentLinkId && mongoose.Types.ObjectId.isValid(paymentLinkId)) {
      const linkDetails = await PaymentLink.findById(paymentLinkId);
      if (
        linkDetails &&
        isStripeMerchant(linkDetails.merchantType) &&
        linkDetails.paymentStatus !== "paid"
      ) {
        await markPaymentLinkPaidAndCreateSale(linkDetails, {
          stripePaymentIntentId: intent.id,
        });
      }
    }
  }

  return res.status(200).json({ received: true });
});

const statusChange = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existPaymentLink = await PaymentLink.findById(id);
  if (!existPaymentLink) {
    throw new ApiError(404, "PaymentLink Not Found");
  }

  const userRole = req?.user?.role;
  const userDeptId = req?.user?.departmentId;

  if (userRole === "DEP_ADMIN" || userRole === "USER") {
    if (!userDeptId) {
      throw new ApiError(403, "Your department is not assigned");
    }

    const linkDeptId = existPaymentLink.departmentId
      ? existPaymentLink.departmentId.toString()
      : null;

    if (!linkDeptId || linkDeptId !== userDeptId.toString()) {
      throw new ApiError(
        403,
        "Not authorized to change status of this payment link",
      );
    }
  }

  if (existPaymentLink.paymentStatus === "paid") {
    throw new ApiError(400, "Paid payment link cannot be disabled");
  }

  const updatedPaymentLink = await PaymentLink.findByIdAndUpdate(
    id,
    {
      $set: {
        isActive: !existPaymentLink.isActive,
      },
    },
    { new: true },
  );

  if (!updatedPaymentLink) {
    throw new ApiError(500, "Something went wrong while changing status");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPaymentLink,
        `PaymentLink changed to ${updatedPaymentLink.isActive ? "Enabled" : "Disabled"} successfully`,
      ),
    );
});

const getPaymentLinksByLeadId = asyncHandler(async (req, res) => {
  const { leadId } = req.params;

  const items = await PaymentLink.find({ leadId })
    .sort({ createdAt: -1 })
    .populate("brandId", "name")
    .populate("clientId", "name email")
    .populate("agent", "fullName")
    .populate("seller", "fullName")
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, items, "Lead payment links found"));
});

const getPaymentLinksByClientId = asyncHandler(async (req, res) => {
  const { clientId } = req.params;

  const sales = await Sale.find({ clientId })
    .sort({ saleDate: -1 })
    .populate("brandId", "name")
    .populate("departmentId", "name")
    .populate("seller", "fullName")
    .populate("agent", "fullName")
    .limit(100)
    .lean();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { sales },
        "Client activity found",
      ),
    );
});

export {
  createPaymentLink,
  getAllPaymentLinks,
  updatePaymentLink,
  deletePaymentLink,
  getPaymentLinkById,
  getPaymentLinksByBrandId,
  getPaymentLinksByLeadId,
  getPaymentLinksByClientId,
  createPaypalOrderLinkById,
  paymentChargerByOrderId,
  createStripePaymentIntent,
  confirmStripePayment,
  stripeWebhook,
  statusChange,
};
