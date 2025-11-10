import { Department } from "../models/department.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createDepartment = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) {
    throw new ApiError(400, "name field is required");
  }

  const existDepartment = await Department.findOne({ name });
  if (existDepartment) {
    throw new ApiError(409, "Department name already exists");
  }

  const department = await Department.create({
    name,
  });

  if (!department) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, department, "Department Created Successfully"));
});

const updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const existDepartment = await Department.findById(id);

  if (!existDepartment) {
    throw new ApiError(409, "Department not found");
  }

  const DepartmentData = {
    name,
  };

  const department = await Department.findByIdAndUpdate(
    id,
    {
      $set: DepartmentData,
    },
    { new: true }
  );

  if (!department) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, department, "Department updated Successfully"));
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existDepartment = await Department.findById(id);

  if (!existDepartment) {
    throw new ApiError(409, "Department not found");
  }
  const department = await Department.findByIdAndDelete(id);

  if (!department) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, department, "Department deleted Successfully"));
});0.

const getAllDepartments = asyncHandler(async (req, res) => {
  const categories = await Department.find();
  if (!categories) {
    throw new ApiError("404", "Department not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, categories, "All Departments found"));
});


const getDepartmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const Department = await Department.findById(id);
  if (!Department) {
    throw new ApiError(404, "Department not found");
    // return res.status(404).json({ error: 'Department not found' });
  }
  return res
    .status(200)
    .json(new ApiResponse(200, Department, "Department Found"));
});

export {
  createDepartment,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
  getDepartmentById,
};
