import { Brand } from "../models/brand.model.js";
import { PaymentLink } from "../models/paymentLink.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateAccessToken } from "../utils/paypalAuth.js";
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

const createPaymentLink = asyncHandler(async (req, res) => {
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

  if (
    [brandId, name, phoneNo, email, merchantType, service, amount].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existBrand = await Brand.findById(brandId);
  if (!existBrand) {
    throw new ApiError(404, "Brand not found");
  }

  const link = await PaymentLink.create({
    ...(leadId && { leadId }),
    ...(clientId && { clientId }),
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
  });

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
      `Cannot update after payment status is ${existPaymentlink.status}`
    );
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
  };

  const link = await PaymentLink.findByIdAndUpdate(
    id,
    {
      $set: linkData,
    },
    { new: true }
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

  console.log(page, limit, skip, "page,limit,skip");

  const [items, total] = await Promise.all([
    PaymentLink.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("clientId", "name email phoneNo")
      .populate("brandId", "name")
      .lean(),
    PaymentLink.countDocuments(),
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
      // .populate("agent", "fullName"),
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
      new ApiResponse(200, { items, meta }, "Brand All Payment link found")
    );
});

const getPaymentLinkById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const link = await PaymentLink.findById(id)
    .populate("leadId", "name")
    .populate("brandId", "name image")
    .populate("clientId", "name email phoneNo")
    .lean();

  if (!link) {
    throw new ApiError(404, "payment link not found");
    // return res.status(404).json({ error: 'Lead not found' });
  }

  const client_id =
    link.merchantType === "Kinatech Business Solutions LLC"
      ? process.env.PAYPAL1_CLIENT_ID
      : link.merchantType === "Pay Kinetic"
        ? process.env.PAYPAL2_CLIENT_ID
        : process.env.PAYPAL3_CLIENT_ID;

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...link, paypalClientId: client_id },
        "Payment link found"
      )
    );
});

const createPaypalOrderLinkById = asyncHandler(async (req, res) => {
  const { id } = req.body;

  console.log(id, "------------------>>id");
  const linkDetails = await PaymentLink.findById(id);
  console.log(linkDetails, "------------------>>linkDetails");
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
        description: `Service: ${service[0]} for ${name}`,
        custom_id: `PAYMENTLINK_${_id.toString()}`, // Database lookup ke liye
        // payee: {
        // Agar aapko specific PayPal email address par payment chahiye (optional)
        // email_address: merchantType === 'paypal1' ? 'paypal1-email@example.com' : 'paypal2-email@example.com'
        // },
      },
    ],
    application_context: {
      return_url: `${FRONTEND_BASE_URL}/payment-success`,
      cancel_url: `${FRONTEND_BASE_URL}/payment-failed`,
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

  console.log(data, "-->>>paypal create order data");

  if (!response.ok) {
    console.error("PayPal Order Creation Failed:", data);
    return res
      .status(response.status)
      .json({ message: data.message || "Failed to create PayPal order" });
  }

  return res.status(200).json(new ApiResponse(200, { transactionId: data.id }));
});

const paymentChargerByOrderId = asyncHandler(async (req, res) => {
  const { orderID } = req.params;
  const { id } = req.body;

  const linkDetails = await PaymentLink.findById(id);

  if (!linkDetails || linkDetails.paymentStatus !== "pending") {
    return res.status(400).json({ message: "Payment Link already paid or invalid." });
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
    linkDetails.paymentStatus = "failed";
    await linkDetails.save();

    return res
      .status(response.status)
      .json({ message: data.message || "Payment capture failed" });
  }

  if (data.status === "COMPLETED") {
    linkDetails.paymentStatus = "paid";
    // transaction ID save karein
    linkDetails.paypalOrderId = data.id;
    await linkDetails.save();
  }

  return res.status(200).json({
    success: true,
    message: "Payment charged successfully",
    data: {
      status: data.status,
      linkDetails: linkDetails,
    },
  });
});

export {
  createPaymentLink,
  getAllPaymentLinks,
  updatePaymentLink,
  deletePaymentLink,
  getPaymentLinkById,
  getPaymentLinksByBrandId,
  createPaypalOrderLinkById,
  paymentChargerByOrderId
};
