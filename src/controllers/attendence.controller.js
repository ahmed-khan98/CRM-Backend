import moment from "moment-timezone";
import { Attendance } from "../models/attendence.model.js";
import { Employee } from "../models/employee.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const TimeIn = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.user._id);
  if (employee.status === "de active")
    throw new ApiError(403, "Account Deactivated plz contact your manager");

  const nowPKT = moment().tz("Asia/Karachi");
  const currentHour = nowPKT.hour();

  if (currentHour >= 8 && currentHour < 18) {
  throw new ApiError(
    400, 
    "Shift timing has not started yet. You can only Time-In after 08:00 PM."
  );
}

  // Midnight Logic: Raat 12 se Subah 6 tak login = Pichli Date
  let shiftDate = nowPKT.format("YYYY-MM-DD");
  if (currentHour >= 0 && currentHour < 6) {
    shiftDate = nowPKT.clone().subtract(1, "days").format("YYYY-MM-DD");
  }

  // --- YE CHECK ADD KIYA HAI ---
  const existingAttendance = await Attendance.findOne({
    employeeId: req.user._id,
    shiftDate: shiftDate,
  });

  if (existingAttendance) {
    throw new ApiError(
      400,
      `You have already marked attendance for the shift of ${shiftDate}`,
    );
  }

  // Late & Half Day Logic
  let attendanceStatus = "present";

  // Safety for shiftStart split
  const shiftTimeStr = employee?.shiftStart || "20:30";
  const [sHour, sMin] = shiftTimeStr.split(":").map(Number);

  const shiftStartToday = moment()
    .tz("Asia/Karachi")
    .set({ hour: sHour, minute: sMin, second: 0 });

  const graceTime = shiftStartToday.clone().add(30, "minutes");

  if (currentHour >= 0 && currentHour < 6) {
    attendanceStatus = "half-day";
  } else if (nowPKT.isAfter(graceTime)) {
    attendanceStatus = "late";
  }

  const attendance = await Attendance.create({
    employeeId: req.user._id,
    shiftDate,
    timeIn: nowPKT.toDate(),
    status: attendanceStatus,
    lastActivity: nowPKT.toDate(), // Ise active rakhein taake cron job break calculate kar sake
  });

  return res
    .status(200)
    .json(new ApiResponse(200, attendance, "Attendance Timed In Successfully"));
});

const TimeOut = asyncHandler(async (req, res) => {
  const nowPKT = moment().tz("Asia/Karachi").toDate();

  const attendance = await Attendance.findOneAndUpdate(
    { employeeId: req.user._id, timeOut: null },
    { timeOut: nowPKT },
    { new: true, sort: { createdAt: -1 } },
  );

  if (!attendance) throw new ApiError(404, "No active shift found");

  return res
    .status(200)
    .json(new ApiResponse(200, attendance, "Attendance Timed OUt"));
});

const UpdateActivity = asyncHandler(async (req, res) => {
  await Attendance.findOneAndUpdate(
    { employeeId: req.user._id, timeOut: null },
    { lastActivity: new Date() },
    { sort: { createdAt: -1 } },
  );
  res.status(200).json({ success: true });
});

const AdminUpdateBreak = asyncHandler(async (req, res) => {
  const { attendanceId, newBreak } = req.body;
  const attendance = await Attendance.findById(attendanceId);

  attendance.totalBreakMinutes = newBreak;
  await attendance.save();

  let employee;
  if (newBreak < 60) {
    employee = await Employee.findByIdAndUpdate(attendance.employeeId, {
      status: "active",
    });
  }
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Break Updated successfully"));
});

const getTodayUserAttendance = asyncHandler(async (req, res) => {
  const nowPKT = moment().tz("Asia/Karachi");
  const currentHour = nowPKT.hour();

  // --- Wahi Logic: Shift Date nikalne ke liye ---
  let shiftDate = nowPKT.format("YYYY-MM-DD");
  
  // Agar raat 12 AM se subah 6 AM ke darmiyan check kar raha hai,
  if (currentHour >= 0 && currentHour < 6) {
    shiftDate = nowPKT.clone().subtract(1, "days").format("YYYY-MM-DD");
  }
  console.log(shiftDate,'shiftDate')

  // Database mein check karein ke is shiftDate ke liye entry hai?
  const attendance = await Attendance.findOne({
    employeeId: req.user._id,
    shiftDate: shiftDate,
  });

  if (!attendance) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "No attendance found for today's shift."));
    // throw new ApiError(200, {}, "No attendance found for today's shift");
  }

  // Agar entry mil gayi
  return res
    .status(200)
    .json(
      new ApiResponse(200, attendance, "Attendance found for today's shift."),
    );
});

const getMonthlyAttendance = asyncHandler(async (req, res) => {
  let { month, year, startDate, endDate } = req.query;
  let finalStartDate, finalEndDate;

  if (startDate && startDate.trim() !== "") {
    finalStartDate = moment(startDate).startOf("day").format("YYYY-MM-DD");

    finalEndDate =
      endDate && endDate.trim() !== ""
        ? moment(endDate).endOf("day").format("YYYY-MM-DD")
        : moment(startDate).endOf("day").format("YYYY-MM-DD");
  } else if (month && year) {

    const baseDate = moment({ 
        year: parseInt(year), 
        month: parseInt(month) - 1, 
        day: 1 
    });

    finalStartDate = baseDate.clone().startOf("month").format("YYYY-MM-DD");
    finalEndDate = baseDate.clone().endOf("month").format("YYYY-MM-DD");

    // finalStartDate = moment(`${year}-${month}-01`)
    //   .startOf("month")
    //   .format("YYYY-MM-DD");
    // finalEndDate = moment(`${year}-${month}-01`)
    //   .endOf("month")
    //   .format("YYYY-MM-DD");
  } else {
    // Default current month if nothing is provided
    finalStartDate = moment().startOf("month").format("YYYY-MM-DD");
    finalEndDate = moment().endOf("month").format("YYYY-MM-DD");
  }

  const records = await Attendance.find({
    employeeId: req.user._id,
    shiftDate: {
      $gte: finalStartDate,
      $lte: finalEndDate,
    },
  }).sort({ shiftDate: -1 });

  return res
    .status(200)
    .json(
      new ApiResponse(200, records, "Attendance records fetched successfully"),
    );
});

// const getEmployeeAttendance = asyncHandler(async (req, res) => {
//   let { month, year, startDate, endDate, employeeId } = req.query;

//   let query = {};

//   // 1. Employee Filter
//   if (employeeId && employeeId !== "undefined" && employeeId !== "") {
//     query.employeeId = employeeId;
//   } else{
//     // Check karein ke departmentId sahi ID string hai
//     const employeesInDept = await Employee.find({ ...req.roleFilter  }).select("_id");

//     if (employeesInDept.length > 0) {
//       query.employeeId = { $in: employeesInDept.map((emp) => emp._id) };
//     } else {
//       // Agar department mein koi employee nahi mila toh empty return kar dein
//       return res
//         .status(200)
//         .json(
//           new ApiResponse(200, [], "No employees found in this department"),
//         );
//     }
//   }

//   if (startDate && endDate) {
//     if (startDate === endDate) {
//       query.shiftDate = startDate; // Exact match for Today
//     } else {
//       query.shiftDate = { $gte: startDate, $lte: endDate };
//     }
//   } else if (month && year) {
//     const monthStr = String(month).padStart(2, "0");
//     const baseDate = `${year}-${monthStr}-01`;
//     query.shiftDate = {
//       $gte: moment(baseDate).startOf("month").format("YYYY-MM-DD"),
//       $lte: moment(baseDate).endOf("month").format("YYYY-MM-DD"),
//     };
//   } else {
//     const now = moment().tz("Asia/Karachi");
//     query.shiftDate =
//       now.hour() < 8
//         ? now.subtract(1, "days").format("YYYY-MM-DD")
//         : now.format("YYYY-MM-DD");
//   }

//   const records = await Attendance.find(query)
//     .populate("employeeId", "fullName  designation")
//     .sort({ shiftDate: -1 });

//   return res
//     .status(200)
//     .json(new ApiResponse(200, records, "Attendance fetched successfully"));
// });

const getEmployeeAttendance = asyncHandler(async (req, res) => {
  let { month, year, startDate, endDate, employeeId } = req.query;
  let query = {};

  // 1. Employees Filter
  let employeeListQuery = { ...req.roleFilter };
  if (employeeId && employeeId !== "undefined" && employeeId !== "") {
    employeeListQuery._id = employeeId;
  }
  
  const employees = await Employee.find(employeeListQuery).select("fullName designation");
  const employeeIds = employees.map(emp => emp._id.toString());

  // 2. Attendance Query Build
  query.employeeId = { $in: employees.map(emp => emp._id) };

  // Date Logic
  let targetDate = null;
  if (startDate && endDate) {
    if (startDate === endDate) {
      query.shiftDate = startDate;
      targetDate = startDate;
    } else {
      query.shiftDate = { $gte: startDate, $lte: endDate };
    }
  } else if (month && year) {
    const monthStr = String(month).padStart(2, "0");
    const baseDate = `${year}-${monthStr}-01`;
    query.shiftDate = {
      $gte: moment(baseDate).startOf("month").format("YYYY-MM-DD"),
      $lte: moment(baseDate).endOf("month").format("YYYY-MM-DD"),
    };
  } else {
    const now = moment().tz("Asia/Karachi");
    targetDate = now.hour() < 8 
      ? now.subtract(1, "days").format("YYYY-MM-DD") 
      : now.format("YYYY-MM-DD");
    query.shiftDate = targetDate;
  }

  // 3. Database se records layein
  const records = await Attendance.find(query)
    .populate("employeeId", "fullName designation")
    .sort({ shiftDate: -1, timeIn: -1 });

  // 4. LOGIC FIX:
  let finalData = [];
  
  // Agar exact EK din select hai (Today ya Custom Single Date)
  const isSingleDay = (startDate && endDate && startDate === endDate) || (!startDate && !month);

  if (isSingleDay) {
    // TODAY/SINGLE DAY: Saare employees dikhao (Present + Absent)
    finalData = employees.map(emp => {
      const attendanceRecord = records.find(r => r.employeeId._id.toString() === emp._id.toString());
      return {
        employeeId: emp, 
        record: attendanceRecord || null,
        isAbsent: !attendanceRecord
      };
    });
  } else {
    // RANGE/MONTH VIEW: Sirf database ke valid records dikhao (2 Feb, 3 Feb etc.)
    finalData = records.map(r => ({
      employeeId: r.employeeId, // Populated data directly from record
      record: r,
      isAbsent: false
    }));
  }

  // 5. Stats calculation
  const stats = {
    total: employees.length,
    present: records.filter(r => r.shiftDate === (targetDate || startDate)).length,
    absent: isSingleDay ? (employees.length - records.length) : 0
  };

  return res.status(200).json(
    new ApiResponse(200, { data: finalData }, "Attendance fetched successfully")
  );
});

export {
  TimeIn,
  TimeOut,
  getTodayUserAttendance,
  getMonthlyAttendance,
  getEmployeeAttendance,
};
