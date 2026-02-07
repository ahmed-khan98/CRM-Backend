import { Attendance } from "../models/attendence.model.js";
import { Break } from "../models/break.model.js";
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
    role,
  } = req.body;
  if (
    [fullName, phoneNo, CNIC, designation, departmentId, joiningDate].some(
      (field) => field === undefined || field === "",
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
    role,
  });

  const createdUser = await Employee.findById(employee._id).select(
    "-password -refreshToken",
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
    role,
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
    role,
    ...(image !== "" && { image }),
  };

  const employee = await Employee.findByIdAndUpdate(
    id,
    {
      $set: EmployeeData,
    },
    { new: true },
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
  const employees = await Employee.find({
    role: { $ne: "ADMIN" },
    ...req.roleFilter 
  })
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

const statusChange = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // const { status } = req.body;

  // if (!status) {
  //     throw new ApiError(400, "Status field is required");
  // }
  const existUser = await Employee.findById(id);
  if (!existUser) {
    throw new ApiError(404, "Employee Not Found");
  }
  const user = await Employee.findByIdAndUpdate(
    req?.params?.id,
    {
      $set: {
        status: existUser?.status === "active" ? "de active" : "active",
      },
    },
    { new: true },
  );

  if (!user) {
    throw new ApiError(500, "Something went wrong while changing status");
  }
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user,
        `${existUser.fullName} employee status changed successfully`,
      ),
    );
});

const breakIn = asyncHandler(async (req, res) => {  
  const userId = req.user._id;
  const { attendanceId } = req.body; 
  console.log(attendanceId,'attendanceId')

  if (!attendanceId) {
    throw new ApiError(400, "Attendance ID is required to start a break");
  }

  const employee = await Employee.findById(userId);

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  if (employee.activityStatus === "idle") {
    return res.status(200).json(new ApiResponse(200, {}, "Already on break."));
  }

  employee.activityStatus = "idle";
  employee.lastBreakInTime = new Date();
  await employee.save();

  const existingBreak = await Break.findOne({
    userId,
    attendanceId,
    breakOut: null, 
  });

  if (existingBreak) {
    throw new ApiError(400, "A break is already active in records.");
  }

  const newLog = await Break.create({
    userId,
    attendanceId,
    breakIn: new Date(),
    status: "break-in",
  });

  console.log(`Activity: User ${employee.fullName} is now IDLE`);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activityStatus: employee.activityStatus,
        lastBreakInTime: employee.lastBreakInTime,
        breakRecord: newLog
      },
      "Break-In registered successfully"
    )
  );
});

const manualBreakOut = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { attendanceId } = req.body;

  if (!attendanceId) {
    throw new ApiError(400, "Attendance ID is required for break-out.");
  }

  const employee = await Employee.findById(userId);

  if (employee?.activityStatus === "active") {
    return res.status(200).json(new ApiResponse(200, {}, "User is already active."));
  }

  const openBreak = await Break.findOne({
    userId,
    attendanceId,
    breakOut: null
  }).sort({ createdAt: -1 }); 

  if (!openBreak) {
    employee.activityStatus = "active";
    await employee.save();
    return res.status(200).json(new ApiResponse(200, {}, "No open break record found, but status reset to active."));
  }

  const now = new Date();
  const diffInMs = now - openBreak.breakIn;
  const diffInMins = Math.round(diffInMs / 60000); 

  openBreak.breakOut = now;
  openBreak.status = "break-out"; 
  openBreak.duration = diffInMins; 
  await openBreak.save();

  await Attendance.findByIdAndUpdate(attendanceId, {
    $inc: { totalBreakMinutes: diffInMins }
  });

  employee.activityStatus = "active";
  employee.lastBreakInTime = null; 
  await employee.save();

  console.log(`Activity: User ${employee.fullName} is now ACTIVE. Break Duration: ${diffInMins} mins.`);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activityStatus: "active",
        lastBreakInTime: null,
        breakDuration: diffInMins,
        totalBreakMinutesInShift: await Attendance.findById(attendanceId).then(a => a.totalBreakMinutes)
      },
      `Break-Out successfully. Duration: ${diffInMins} minutes.`
    )
  );
});

export {
  createEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeesByDepartId,
  statusChange,
  breakIn,
  manualBreakOut,
};
