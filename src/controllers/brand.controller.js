import { Brand } from "../models/brand.model.js";
import { Department } from "../models/department.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createBrand = asyncHandler(async (req, res) => {
  const { name, departmentId } = req.body;

  if (!departmentId) {
    throw new ApiError(400, "department is required");
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    throw new ApiError(404, "department not found");
  }

  if (!name) {
    throw new ApiError(400, "brand name is required");
  }

  let image = "";
  const blogImg = req.file;
  if (blogImg) {
    const img = await uploadOnCloudinary(blogImg, "PPI-Brand");

    if (!img.url) {
      throw new ApiError(400, "brand logo is not uploaded");
    }
    image = img?.url;
  }

  const brand = await Brand.create({
    name,
    departmentId,
    image,
  });

  if (!brand) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, brand, "brand Created Successfully"));
});

const updateBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, departmentId } = req.body;

  const department = await Department.findById(departmentId);
  if (!department) {
    throw new ApiError(404, "department not found");
  }

  const existBrand = await Brand.findById(id);

  if (!existBrand) {
    throw new ApiError(409, "brand not found");
  }

    let image = "";
    const brandlogo = req.file;
    if (brandlogo) {
      const img = await uploadOnCloudinary(brandlogo, "PPI-Brand");
  
      if (!img.url) {
        throw new ApiError(400, "brand logo is not uploaded");
      }
      image = img?.url;
    }


  const BrandData = {
    name,
    departmentId,
     ...(image !== "" && { image }),
  };

  const brand = await Brand.findOneAndUpdate(
    { _id: id },
    { $set: BrandData },
    { new: true }
  );

  if (!brand) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, brand, "Brand Updated Successfully"));
});

const deleteBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existBrand = await Brand.findById(id);

  if (!existBrand) {
    throw new ApiError(409, "Brand not found");
  }
  const brand = await Brand.findByIdAndDelete(id);

  if (!brand) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, brand, "Brand Deleted Successfully"));
});

const getBrandById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const brand = await Brand.findById(id);
  if (!brand) {
    throw new ApiError(404, "brand not found");
  }
  return res.status(201).json(new ApiResponse(200, brand, "brand Found"));
});

const getAllBrands = asyncHandler(async (req, res) => {
  const brand = await Brand.find({ ...req.roleFilter }).populate("departmentId", "name");
  if (!brand) { 
    throw new ApiError(404, "brand not found");
  }
  return res.status(201).json(new ApiResponse(200, brand, "brand Found"));
});

const getAllBrandsByDepartmentId = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  const brand = await Brand.find({ departmentId });
  if (!brand) {
    throw new ApiError(404, "brand not found");
  }
  return res.status(201).json(new ApiResponse(200, brand, "brand Found"));
});

export {
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandById,
  getAllBrands,
  getAllBrandsByDepartmentId,
};
