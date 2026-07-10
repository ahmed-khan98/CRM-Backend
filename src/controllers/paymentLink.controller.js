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
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

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

  const existBrand = await Brand.findById(brandId);
  if (!existBrand) {
    throw new ApiError(404, "Brand not found");
  }

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
    departmentId: existBrand?.departmentId,
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
  const id = req.params.id || req.params.leadId;

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

  const client_id =
    link.merchantType === "Kinatech Business Solutions LLC"
      ? process.env.PAYPAL1_CLIENT_ID
      : process.env.PAYPAL2_CLIENT_ID;

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...link, paypalClientId: client_id },
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

    const createSale = await Sale.create({
      ...(linkDetails.brandId && { brandId: linkDetails.brandId }),
      ...(linkDetails.clientId && { clientId: linkDetails.clientId }),
      departmentId: linkDetails.departmentId,
      monthId: safeMonthId,
      paymentId: linkDetails._id,
      merchantType: linkDetails.merchantType,
      service: linkDetails.service,
      amount: linkDetails.amount,
      description: linkDetails.description,
      seller: linkDetails.seller ,
      type: linkDetails.type || "FRESH",
      saleDate: linkDetails.paidAt,
      ...(linkDetails.currency && { currency: linkDetails.currency }),
      ...(linkDetails.agent && { agent: linkDetails.agent }),
    });
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

export {
  createPaymentLink,
  getAllPaymentLinks,
  updatePaymentLink,
  deletePaymentLink,
  getPaymentLinkById,
  getPaymentLinksByBrandId,
  createPaypalOrderLinkById,
  paymentChargerByOrderId,
  statusChange,
};
