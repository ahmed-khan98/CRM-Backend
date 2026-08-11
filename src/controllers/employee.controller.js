import { Attendance } from "../models/attendence.model.js";
import { Break } from "../models/break.model.js";
import { Employee } from "../models/employee.model.js";
import { EmployeeSalaryHistory } from "../models/employeeSalaryHistory.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { parseMaybeJson, toNumber } from "../utils/hrmsHelpers.js";
import mongoose from "mongoose";

const pickHrmsFields = (body) => {
  const emergencyContact = parseMaybeJson(body.emergencyContact, undefined);

  const fields = {};

  if (body.dateOfBirth !== undefined && body.dateOfBirth !== "") {
    fields.dateOfBirth = body.dateOfBirth;
  }
  if (body.gender !== undefined) fields.gender = body.gender || "";
  if (body.maritalStatus !== undefined)
    fields.maritalStatus = body.maritalStatus || "";
  if (body.bloodGroup !== undefined) fields.bloodGroup = body.bloodGroup || "";
  if (emergencyContact !== undefined) fields.emergencyContact = emergencyContact;
  if (body.employmentType !== undefined)
    fields.employmentType = body.employmentType || "";
  const salary = toNumber(body.currentSalary);
  if (salary !== undefined) fields.currentSalary = salary;
  if (body.bankName !== undefined) fields.bankName = body.bankName || "";
  if (body.accountTitle !== undefined)
    fields.accountTitle = body.accountTitle || "";
  if (body.accountNumber !== undefined)
    fields.accountNumber = body.accountNumber || "";
  if (body.iban !== undefined) fields.iban = body.iban || "";
  if (body.ntn !== undefined) fields.ntn = body.ntn || "";

  return fields;
};

const appendHistoryOnUpdate = async (existEmployee, nextFields, actorId, body) => {
  const actor = actorId || undefined;
  const effectiveDate = body.salaryEffectiveDate
    ? new Date(body.salaryEffectiveDate)
    : new Date();
  const salaryReason = body.salaryChangeReason || "";

  if (
    nextFields.currentSalary !== undefined &&
    Number(existEmployee.currentSalary || 0) !== Number(nextFields.currentSalary)
  ) {
    await EmployeeSalaryHistory.create({
      employeeId: existEmployee._id,
      previousSalary: existEmployee.currentSalary || 0,
      newSalary: nextFields.currentSalary,
      effectiveDate,
      reason: salaryReason,
      updatedBy: actor,
      createdBy: actor,
    });
  }
};

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

  const hrms = pickHrmsFields(req.body);

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
    ...hrms,
  });

  if (hrms.currentSalary !== undefined) {
    await EmployeeSalaryHistory.create({
      employeeId: employee._id,
      previousSalary: 0,
      newSalary: hrms.currentSalary,
      effectiveDate: joiningDate || new Date(),
      reason: "Initial salary",
      updatedBy: req.user?._id,
      createdBy: req.user?._id,
    });
  }

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

  const hrms = pickHrmsFields(req.body);
  await appendHistoryOnUpdate(existEmployee, hrms, req.user?._id, req.body);

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
    ...hrms,
    ...(image !== "" && { image }),
  };

  // Remove undefined core fields so partial JSON updates don't wipe them
  Object.keys(EmployeeData).forEach((key) => {
    if (EmployeeData[key] === undefined) delete EmployeeData[key];
  });

  const employee = await Employee.findByIdAndUpdate(
    id,
    {
      $set: EmployeeData,
    },
    { new: true },
  ).select("-password -refreshToken");

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
    ...req.roleFilter,
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

// Unfiltered list for task/sale assignment — any authenticated user
const getAssignees = asyncHandler(async (req, res) => {
  const employees = await Employee.find({
    role: { $ne: "ADMIN" },
    status: { $ne: "block" },
  })
    .select("fullName image departmentId role status")
    .sort({ fullName: 1 })
    .populate("departmentId", "name");

  return res
    .status(200)
    .json(new ApiResponse(200, employees, "Assignees fetched successfully"));
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

  const employee = await Employee.find({ role: { $ne: "ADMIN" },
    departmentId: id })
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

// const getAllBreaks = asyncHandler(async (req, res) => {
//   const { userId, status, type, attendanceId, startDate, endDate } = req.query;
//   const { roleFilter } = req;

//   let matchStage = {};
//   if (userId) matchStage.userId = new mongoose.Types.ObjectId(userId);
//   if (status) matchStage.status = status;
//   if (type) matchStage.type = type;
//   if (attendanceId)
//     matchStage.attendanceId = new mongoose.Types.ObjectId(attendanceId);

//   if (startDate || endDate) {
//     matchStage.breakIn = {};
//     if (startDate) matchStage.breakIn.$gte = new Date(startDate);
//     if (endDate) {
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       matchStage.breakIn.$lte = end;
//     }
//   }

//   const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//   const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
//   const skip = (page - 1) * limit;

//   const pipeline = [];

//   pipeline.push({ $match: matchStage });

//   pipeline.push({
//     $lookup: {
//       from: "employees", 
//       localField: "userId",
//       foreignField: "_id",
//       as: "employeeInfo",
//     },
//   });

//   pipeline.push({ $unwind: "$employeeInfo" });

//   // 4. Role Based Filter (Logic based on your existing middleware)
//   if (roleFilter && Object.keys(roleFilter).length > 0) {
//     // Agar DEP_ADMIN hai to middleware departmentId bhej raha hoga
//     if (roleFilter.departmentId) {
//       pipeline.push({
//         $match: {
//           "employeeInfo.departmentId": new mongoose.Types.ObjectId(
//             roleFilter.departmentId,
//           ),
//         },
//       });
//     }
//     // Agar sirf USER restriction hai
//     if (roleFilter.userId) {
//       pipeline.push({
//         $match: { userId: new mongoose.Types.ObjectId(roleFilter.userId) },
//       });
//     }
//   }

//   // 5. Total Count for Pagination
//   const totalRecords = await Break.aggregate([
//     ...pipeline,
//     { $count: "total" },
//   ]);
//   const total = totalRecords.length > 0 ? totalRecords[0].total : 0;
//   const totalPages = Math.max(Math.ceil(total / limit), 1);

//   // 6. Final Results (Sorting & Pagination)
//   pipeline.push({ $sort: { createdAt: -1 } });
//   pipeline.push({ $skip: skip });
//   pipeline.push({ $limit: limit });

//   // Attendance join
//   pipeline.push({
//     $lookup: {
//       from: "attendances",
//       localField: "attendanceId",
//       foreignField: "_id",
//       as: "attendanceId",
//     },
//   });
//   pipeline.push({
//     $unwind: { path: "$attendanceId", preserveNullAndEmptyArrays: true },
//   });

//   const breaks = await Break.aggregate(pipeline);

//   // Cleanup: Data ko wapis purane format (userId object) mein convert karna
//   const formattedBreaks = breaks.map((b) => ({
//     ...b,
//     userId: {
//       _id: b.employeeInfo._id,
//       fullName: b.employeeInfo.fullName,
//       email: b.employeeInfo.email,
//       designation: b.employeeInfo.designation,
//     },
//   }));

//   const meta = {
//     total,
//     page,
//     limit,
//     totalPages,
//     hasNext: page < totalPages,
//     hasPrevious: page > 1,
//   };

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(
//         200,
//         { items: formattedBreaks, meta },
//         "Breaks fetched successfully",
//       ),
//     );
// });


const getAllBreaks = asyncHandler(async (req, res) => {
  const { userId, status, type, startDate, endDate } = req.query;
  const { roleFilter } = req;

  let globalMatchStage = {};
  if (userId) globalMatchStage.userId = new mongoose.Types.ObjectId(userId);

  if (startDate || endDate) {
    globalMatchStage.shiftDate = {};
    if (startDate) globalMatchStage.shiftDate.$gte = startDate.toString().trim();
    if (endDate) globalMatchStage.shiftDate.$lte = endDate.toString().trim();
  }

  let tableMatchStage = {};
  if (status) tableMatchStage.status = status;
  if (type) tableMatchStage.type = type;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
  const skip = (page - 1) * limit;

  // Base Pipeline jahan sirf global filters aur lookups lag rha hy
  const basePipeline = [];
  basePipeline.push({ $match: globalMatchStage });

  basePipeline.push({
    $lookup: {
      from: "employees",
      localField: "userId",
      foreignField: "_id",
      as: "employeeInfo",
    },
  });
  basePipeline.push({ $unwind: "$employeeInfo" });

  if (roleFilter && Object.keys(roleFilter).length > 0) {
    if (roleFilter.departmentId) {
      basePipeline.push({
        $match: { "employeeInfo.departmentId": new mongoose.Types.ObjectId(roleFilter.departmentId) },
      });
    }
    if (roleFilter.userId) {
      basePipeline.push({
        $match: { userId: new mongoose.Types.ObjectId(roleFilter.userId) },
      });
    }
  }

  const aggregationResult = await Break.aggregate([
    ...basePipeline,
    {
      $facet: {
        typeStats: [
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
            },
          },
        ],
        liveStats: [
          { $match: { status: "break-in" } },
          { $count: "count" }
        ],
        paginatedData: [
          { $match: tableMatchStage }, 
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit }
        ],
        filteredTotalCount: [
          { $match: tableMatchStage }, 
          { $count: "count" }
        ],
        absoluteTotalCount: [
          { $count: "count" }
        ]
      }
    }
  ]);

  const facetResult = aggregationResult[0];
  
  const totalFiltered = facetResult.filteredTotalCount[0]?.count || 0; 
  const totalAbsolute = facetResult.absoluteTotalCount[0]?.count || 0; 
  const totalPages = Math.max(Math.ceil(totalFiltered / limit), 1);
  const rawBreaks = facetResult.paginatedData || [];
  const rawStats = facetResult.typeStats || [];
  const liveCount = facetResult.liveStats[0]?.count || 0;

  // 🛠️ INITIALIZE DEFAULT STATS
  const stats = {
    TOTAL_ALL: totalAbsolute, 
    LIVE: liveCount,     
    MEAL: 0,
    SMOKING: 0,
    PRAYER: 0,
    TEA: 0,
    OFFICIAL: 0,
    "REST ROOM": 0,
    "SYSTEM IDLE": 0
  };

  rawStats.forEach(item => {
    if (item._id) {
      const typeKey = item._id.toString().trim();
      stats[typeKey] = item.count;
    }
  });

  const formattedBreaks = rawBreaks.map((b) => ({
    ...b,
    userId: {
      _id: b.employeeInfo._id,
      fullName: b.employeeInfo.fullName,
      email: b.employeeInfo.email,
      designation: b.employeeInfo.designation,
    },
  }));

  const meta = {
    total: totalFiltered, 
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      { items: formattedBreaks, stats, meta },
      "Breaks, persistent stats and dynamic pagination fetched successfully",
    ),
  );
});

const getMyBreak = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const filters = { userId: req.user._id };
  const { status, type, startDate, endDate } = req.query;

  if (status) filters.status = status;
  if (type) filters.type = type;

  // 👈 FIX: shiftDate dynamic filters conversion for plain Mongoose lookup
  if (startDate || endDate) {
    filters.shiftDate = {};
    if (startDate) {
      filters.shiftDate.$gte = startDate.toString().trim();
    }
    if (endDate) {
      filters.shiftDate.$lte = endDate.toString().trim();
    }
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
  const skip = (page - 1) * limit;
  
  const total = await Break.countDocuments(filters);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const breaks = await Break.find(filters)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("userId", "fullName designation ");

  const meta = {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      { items: breaks, meta },
      "Your break records fetched successfully",
    ),
  );
});

const breakIn = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { shiftDate, type, reason } = req.body;

  if (!shiftDate) {
    throw new ApiError(400, "Shift date is required to start a break");
  }

  const activeBreaksCount = await Break.countDocuments({
    breakOut: null,
    shiftDate
  });


  if (activeBreaksCount >= 3) {
    throw new ApiError(
      400,
      "Please wait, 3 employees are already on break. Try again after some time.",
    );
  }

  const employee = await Employee.findById(userId);

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  if (employee.activityStatus !== "active") {
    return res.status(200).json(new ApiResponse(200, {}, "Already on break."));
  }

  const existingBreak = await Break.findOne({
    userId,
    shiftDate,
    breakOut: null,
  });

  if (existingBreak) {
    throw new ApiError(400, "Already on break. Close previous break first.");
  }

  const newLog = await Break.create({
    userId,
    shiftDate,
    type,
    reason,
    breakIn: new Date(),
    status: "break-in",
  });

  employee.activityStatus = type === "SYSTEM IDLE" ? "idle" : "break";
  employee.lastBreakInTime = new Date();
  await employee.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activityStatus: employee.activityStatus,
        breakRecord: newLog,
      },
      "Break started successfully",
    ),
  );
});

const breakOut = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { shiftDate } = req.body;

  if (!shiftDate) {
    throw new ApiError(400, "Shift date is required for break-out.");
  }

  const employee = await Employee.findById(userId);

  if (employee?.activityStatus === "active") {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Employee is already active."));
  }

  const openBreak = await Break.findOne({
    userId,
    shiftDate,
    breakOut: null,
  }).sort({ createdAt: -1 });

  if (!openBreak) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "No open break record found, but status reset to active.",
        ),
      );
  }

  const now = new Date();
  const diffInMins = Math.round((now - openBreak.breakIn) / 60000);

  openBreak.breakOut = now;
  openBreak.duration = diffInMins;
  openBreak.status = "break-out";
  await openBreak.save();

  const allBreaks = await Break.find({
    shiftDate,  
    userId,
    type: { $ne: "OFFICIAL" },
  });

  const totalCalculatedMinutes = allBreaks.reduce(
    (sum, b) => sum + (b.duration || 0),
    0,
  );

  const updatedAttendance = await Attendance.findOneAndUpdate(
    { shiftDate, employeeId: userId },
    { totalBreakMinutes: totalCalculatedMinutes },
    { new: true },
  );

  const privilegedRoles = ["ADMIN", "SUBADMIN"];

  if (
    updatedAttendance.totalBreakMinutes > 90 &&
    openBreak.type !== "OFFICIAL" &&
    !privilegedRoles.includes(employee.role)
  ) {
    employee.status = "de active";
    await employee.save();
  }

  employee.activityStatus = "active";
  employee.lastBreakInTime = null;
  await employee.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        breakDuration: diffInMins,
        totalBreakMinutes: updatedAttendance.totalBreakMinutes,
        ...(updatedAttendance.totalBreakMinutes > 90 &&
          openBreak.type !== "OFFICIAL" && { mustLogout: true }),
      },
      `Break-Out successfully. Duration: ${diffInMins} minutes.`,
    ),
  );
});

export {
  createEmployee,
  getAllEmployees,
  getAssignees,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeesByDepartId,
  getAllBreaks,
  getMyBreak,
  statusChange,
  breakIn,
  breakOut,
};


// const getAllBreaks = asyncHandler(async (req, res) => {
//   const { userId, status, type, attendanceId, startDate, endDate } = req.query;
//   const { roleFilter } = req;

//   // 1. GLOBAL FILTERS (Jo stats aur data dono pr lagenge)
//   let globalMatchStage = {};
//   if (userId) globalMatchStage.userId = new mongoose.Types.ObjectId(userId);
//   if (attendanceId) globalMatchStage.attendanceId = new mongoose.Types.ObjectId(attendanceId);

//   if (startDate || endDate) {
//     globalMatchStage.breakIn = {};
//     if (startDate) globalMatchStage.breakIn.$gte = new Date(startDate);
//     if (endDate) {
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       globalMatchStage.breakIn.$lte = end;
//     }
//   }

//   // 2. TABLE SPECIFIC FILTERS (Jo sirf table aur table k count ko filter krenge)
//   let tableMatchStage = {};
//   if (status) tableMatchStage.status = status;
//   if (type) tableMatchStage.type = type;

//   // Pagination bounds
//   const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//   const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
//   const skip = (page - 1) * limit;

//   // Base Pipeline jahan sirf global filters aur lookups lag rha hy
//   const basePipeline = [];
//   basePipeline.push({ $match: globalMatchStage });

//   basePipeline.push({
//     $lookup: {
//       from: "employees",
//       localField: "userId",
//       foreignField: "_id",
//       as: "employeeInfo",
//     },
//   });
//   basePipeline.push({ $unwind: "$employeeInfo" });

//   // Role Based Filters
//   if (roleFilter && Object.keys(roleFilter).length > 0) {
//     if (roleFilter.departmentId) {
//       basePipeline.push({
//         $match: { "employeeInfo.departmentId": new mongoose.Types.ObjectId(roleFilter.departmentId) },
//       });
//     }
//     if (roleFilter.userId) {
//       basePipeline.push({
//         $match: { userId: new mongoose.Types.ObjectId(roleFilter.userId) },
//       });
//     }
//   }

//   // =================================================================
//   // 🚀 FACET PIPELINE WITH ISOLATED TABLE FILTERS
//   // =================================================================
//   const aggregationResult = await Break.aggregate([
//     ...basePipeline,
//     {
//       $facet: {
//         // Pipeline 1: Global Stats (Isme tableMatchStage nahi chalayein ge)
//         typeStats: [
//           {
//             $group: {
//               _id: "$type",
//               count: { $sum: 1 },
//             },
//           },
//         ],
//         // Pipeline 2: Global Live Count (Isme bhi table filters touch nahi honge)
//         liveStats: [
//           { $match: { status: "break-in" } },
//           { $count: "count" }
//         ],
//         // Pipeline 3: Paginated Table Data (Yahan tableMatchStage apply hoga)
//         paginatedData: [
//           { $match: tableMatchStage }, // 👈 Table specific filters (type/status) yahan isolate kr diye
//           { $sort: { createdAt: -1 } },
//           { $skip: skip },
//           { $limit: limit },
//           {
//             $lookup: {
//               from: "attendances",
//               localField: "attendanceId",
//               foreignField: "_id",
//               as: "attendanceId",
//             },
//           },
//           { $unwind: { path: "$attendanceId", preserveNullAndEmptyArrays: true } },
//         ],
//         // Pipeline 4: Filtered Total Count (Pagination calculations k liye)
//         filteredTotalCount: [
//           { $match: tableMatchStage }, // 👈 Table filters yahan bhi lgenge taake pagination size accurate rhe
//           { $count: "count" }
//         ],
//         // Pipeline 5: Absolute Total (Bina table filters k total card k liye)
//         absoluteTotalCount: [
//           { $count: "count" }
//         ]
//       }
//     }
//   ]);

//   const facetResult = aggregationResult[0];
  
//   // Extraction
//   const totalFiltered = facetResult.filteredTotalCount[0]?.count || 0; // Filtered records for table pagination
//   const totalAbsolute = facetResult.absoluteTotalCount[0]?.count || 0; // Absolute total for cards
//   const totalPages = Math.max(Math.ceil(totalFiltered / limit), 1);
//   const rawBreaks = facetResult.paginatedData || [];
//   const rawStats = facetResult.typeStats || [];
//   const liveCount = facetResult.liveStats[0]?.count || 0;

//   // =================================================================
//   // 🛠️ INITIALIZE DEFAULT STATS (Hamesha real absolute total dikhayega)
//   // =================================================================
//   const stats = {
//     TOTAL_ALL: totalAbsolute, // 👈 Yeh ab type select karne pr bhi change nahi hoga!
//     LIVE: liveCount,     
//     MEAL: 0,
//     SMOKING: 0,
//     PRAYER: 0,
//     "REST ROOM": 0,
//     "SYSTEM IDLE": 0
//   };

//   rawStats.forEach(item => {
//     if (item._id) {
//       const typeKey = item._id.toString().trim();
//       stats[typeKey] = item.count;
//     }
//   });

//   // Formatting output array
//   const formattedBreaks = rawBreaks.map((b) => ({
//     ...b,
//     userId: {
//       _id: b.employeeInfo._id,
//       fullName: b.employeeInfo.fullName,
//       email: b.employeeInfo.email,
//       designation: b.employeeInfo.designation,
//     },
//   }));

//   const meta = {
//     total: totalFiltered, // Table me kitne items hain actual pagination k liye
//     page,
//     limit,
//     totalPages,
//     hasNext: page < totalPages,
//     hasPrevious: page > 1,
//   };

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       { 
//         items: formattedBreaks, 
//         stats, 
//         meta 
//       },
//       "Breaks, persistent stats and dynamic pagination fetched successfully",
//     ),
//   );
// });

// const getMyBreak = asyncHandler(async (req, res) => {
//   const userId = req.user._id;
//   const filters = { userId: req.user._id };
//   const { status, type, startDate, endDate } = req.query;

//   if (status) filters.status = status;
//   if (type) filters.type = type;

//   if (startDate || endDate) {
//     filters.breakIn = {};
//     if (startDate) {
//       filters.breakIn.$gte = new Date(startDate);
//     }
//     if (endDate) {
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       filters.breakIn.$lte = end;
//     }
//   }

//   const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//   const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
//   const skip = (page - 1) * limit;
//   const total = await Break.countDocuments(filters);
//   const totalPages = Math.max(Math.ceil(total / limit), 1);

//   const breaks = await Break.find(filters)
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .populate("attendanceId", "shiftDate")
//     .populate("userId", "fullName designation ");

//   const meta = {
//     total,
//     page,
//     limit,
//     totalPages,
//     hasNext: page < totalPages,
//     hasPrevious: page > 1,
//     nextPage: page < totalPages ? page + 1 : null,
//     previousPage: page > 1 ? page - 1 : null,
//   };

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(
//         200,
//         { items: breaks, meta },
//         "Your break records fetched successfully",
//       ),
//     );
// });