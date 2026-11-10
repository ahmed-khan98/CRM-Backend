import { Brand } from "../models/brand.model.js";
import { Department } from "../models/department.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  brandQueryForDepartment,
  brandRoleFilterQuery,
  parseDepartmentIdsFromBody,
  syncBrandDepartmentFields,
} from "../utils/brandDepartments.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

async function assertDepartmentsExist(departmentIds) {
  if (!departmentIds.length) {
    throw new ApiError(400, "At least one department is required");
  }
  const found = await Department.find({ _id: { $in: departmentIds } }).select(
    "_id",
  );
  if (found.length !== departmentIds.length) {
    throw new ApiError(404, "One or more departments not found");
  }
}

const createBrand = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const departmentIds = parseDepartmentIdsFromBody(req.body);
  await assertDepartmentsExist(departmentIds);

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
    ...syncBrandDepartmentFields(departmentIds),
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
  const { name } = req.body;
  const departmentIds = parseDepartmentIdsFromBody(req.body);
  await assertDepartmentsExist(departmentIds);

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
    ...syncBrandDepartmentFields(departmentIds),
    ...(image !== "" && { image }),
  };

  const brand = await Brand.findOneAndUpdate(
    { _id: id },
    { $set: BrandData },
    { new: true },
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
  const brand = await Brand.findById(id)
    .populate("departmentId", "name")
    .populate("departmentIds", "name");
  if (!brand) {
    throw new ApiError(404, "brand not found");
  }
  return res.status(201).json(new ApiResponse(200, brand, "brand Found"));
});

const getAllBrands = asyncHandler(async (req, res) => {
  const brand = await Brand.find(brandRoleFilterQuery(req.roleFilter || {}))
    .populate("departmentId", "name")
    .populate("departmentIds", "name");
  if (!brand) {
    throw new ApiError(404, "brand not found");
  }
  return res.status(201).json(new ApiResponse(200, brand, "brand Found"));
});

const getAllBrandsByDepartmentId = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;
  const role = String(req?.user?.role || "").toUpperCase();
  if (role === "DEP_ADMIN" || role === "USER") {
    const scoped = req.roleFilter?.departmentId;
    if (!scoped || String(scoped) !== String(departmentId)) {
      throw new ApiError(403, "You cannot access brands from another department");
    }
  }

  const brand = await Brand.find(brandQueryForDepartment(departmentId))
    .populate("departmentId", "name")
    .populate("departmentIds", "name");
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
