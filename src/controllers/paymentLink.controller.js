import { Brand } from "../models/brand.model.js";
import { PaymentLink } from "../models/paymentLink.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
    currency
  } = req.body;
  
  if (
    [
      brandId,
      name,
      phoneNo,
      email,
      merchantType,
      service,
      amount,
    ].some((field) => field === undefined || field === "")
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
    currency
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
    currency
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
      `Cannot update after payment is ${existPaymentlink.status}`
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
    currency
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
  const { leadId } = req.params;

  const link = await PaymentLink.find({ leadId })
    .populate("leadId", "name")
    .populate("brandId", "name")
    .populate("clientId", "name email phoneNo")
    .lean();

  if (!link) {
    throw new ApiError(404, "payment link not found");
    // return res.status(404).json({ error: 'Lead not found' });
  }
  return res
    .status(200)
    .json(new ApiResponse(200, link, "lead all payment link found"));
});

export {
  createPaymentLink,
  getAllPaymentLinks,
  updatePaymentLink,
  deletePaymentLink,
  getPaymentLinkById,
  getPaymentLinksByBrandId,
};
