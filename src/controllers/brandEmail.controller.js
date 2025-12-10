import { Domain } from "../models/brandEmail.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createBrandEmail = asyncHandler(async (req, res) => {
  const { name, email,brandId } = req.body;

  if (!name || !email|| !brandId) {
    throw new ApiError(400, "All field  is required");
  }

  const brandEmail = await Domain.create({
    name,
    email,
    brandId
  });

  if (!brandEmail) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, brandEmail, "Brand email created cuccessfully"));
});

const updateBrandEmail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email,brandId } = req.body;

  const existBrandEmail = await Domain.findById(id);

  if (!existBrandEmail) {
    throw new ApiError(409, "Brand Email not found");
  }

  const brandEmailData = {
    name,
    email,
    brandId
  };

  const brandEmail = await Domain.findOneAndUpdate(
    { _id: id },
    { $set: brandEmailData },
    { new: true }
  );

  if (!brandEmail) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, brandEmail, "brand email updated successfully"));
});

const deleteBrandEmail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existBrandEmail = await Domain.findById(id);

  if (!existBrandEmail) {
    throw new ApiError(409, "BrandEmail not found");
  }
  const brandEmail = await Domain.findByIdAndDelete(id);

  if (!brandEmail) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, brandEmail, "brand email deleted successfully"));
}); 

const getBrandEmailById = asyncHandler(async (req, res) => {

  const { id } = req.params;
  const brandEmail = await Domain.findById(id);

  if (!brandEmail) {
    throw new ApiError(404, "brand email not found");
  }
  return res.status(201).json(new ApiResponse(200, brandEmail, "brand email Found"));
});

const getBrandEmailByBrandId = asyncHandler(async (req, res) => {

  const { brandId } = req.params;
  const brandEmail = await Domain.find({brandId});

  if (!brandEmail) {
    throw new ApiError(404, "brand email not found");
  }
  return res.status(201).json(new ApiResponse(200, brandEmail, "brand email Found"));
});

const getAllBrandEmails = asyncHandler(async (req, res) => {
  const brandEmails = await Domain.find().sort({ createdAt: -1 }).populate('brandId','name') ;
  if (!brandEmails) {
    throw new ApiError(404, "Brand email not found");
  }
  return res.status(201).json(new ApiResponse(200, brandEmails, "All brand email Found"));
});


export {
  createBrandEmail,
  updateBrandEmail,
  deleteBrandEmail,
  getBrandEmailById,
  getAllBrandEmails,
  getBrandEmailByBrandId
};
