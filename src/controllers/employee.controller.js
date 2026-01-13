import { Employee } from "../models/employee.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createEmployee = asyncHandler(async (req, res) => {
  const {
    fullName,
    phoneNo,
    CNIC,
    email,
    designation,
    departmentId,
    joiningDate,
    address,
    password,
  } = req.body;
  if (
    [fullName, phoneNo, CNIC, designation, departmentId, joiningDate].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existEmployee = await Employee.findOne({ CNIC });
  if (existEmployee) {
    throw new ApiError(409, "Employee CNIC already exists");
  }

  const EmployeeImg = req.file;

  if (!EmployeeImg) {
    throw new ApiError(400, "Employee Image is required");
  }

  const image = await uploadOnCloudinary(EmployeeImg, "PPI-Employee");

  if (!image.url) {
    throw new ApiError(400, "Employee image is not uploaded");
  }
  const employee = await Employee.create({
    fullName,
    phoneNo,
    CNIC,
    email,
    designation,
    departmentId,
    address,
    password,
    image: image?.url,
    joiningDate,
  });

  const createdUser = await Employee.findById(employee._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "Employee Created Successfully"));
});

const updateEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    fullName,
    phoneNo,
    CNIC,
    email,
    designation,
    departmentId,
    joiningDate,
    address,
  } = req.body;

  const existEmployee = await Employee.findById(id);

  if (!existEmployee) {
    throw new ApiError(409, "Employee not found");
  }

  let image = "";
  const EmployeeImg = req.file;
  if (EmployeeImg) {
    const img = await uploadOnCloudinary(EmployeeImg, "PPI-Employee");

    if (!img.url) {
      throw new ApiError(400, "Employee image is not uploaded");
    }
    image = img?.url;
  }

  const EmployeeData = {
    fullName,
    phoneNo,
    CNIC,
    email,
    designation,
    departmentId,
    joiningDate,
    address,
    ...(image !== "" && { image }),
  };

  const employee = await Employee.findByIdAndUpdate(
    id,
    {
      $set: EmployeeData,
    },
    { new: true }
  );

  if (!employee) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, employee, "Employee updated Successfully"));
});

const deleteEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existEmployee = await Employee.findById(id);

  if (!existEmployee) {
    throw new ApiError(409, "Employee not found");
  }
  const employee = await Employee.findByIdAndDelete(id);

  if (!employee) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, employee, "Employee deleted Successfully"));
});

const getAllEmployees = asyncHandler(async (req, res) => {
  const employees = await Employee.find({role:'USER'})
    .select("-password")
    .sort({ createdAt: -1 })
    .populate("departmentId", "name");
   

  if (!employees) {
    throw new ApiError("404", "Employee not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, employees, "All Employees found"));
});

const getEmployeeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employee = await Employee.findById(id)
    .select("-password")
    .populate("departmentId", "name");
  if (!employee) {
    throw new ApiError(404, "Employee not found");
    // return res.status(404).json({ error: 'Employee not found' });
  }
  return res.status(200).json(new ApiResponse(200, employee, "Employee Found"));
});

const getEmployeesByDepartId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employee = await Employee.find({ departmentId: id })
    .select("-password")
    .populate("departmentId", "name");
  if (!employee) {
    throw new ApiError(404, "Employee not found");
    // return res.status(404).json({ error: 'Employee not found' });
  }
  return res.status(200).json(new ApiResponse(200, employee, "Employee Found"));
});

export {
  createEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeesByDepartId,
};
