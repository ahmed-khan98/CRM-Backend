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
    throw new ApiError(400, `You have already timed in for the shift of ${shiftDate}`);
  }
  // -----------------------------

  // Late & Half Day Logic
  let attendanceStatus = "present";
  
  // Safety for shiftStart split
  const shiftTimeStr = employee?.shiftStart || "20:00";
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
  // toh hum 26 Jan (pichli date) ki attendance dhoondenge.
  if (currentHour >= 0 && currentHour < 6) {
    shiftDate = nowPKT.clone().subtract(1, "days").format("YYYY-MM-DD");
  }

  // Database mein check karein ke is shiftDate ke liye entry hai?
  const attendance = await Attendance.findOne({
    employeeId: req.user._id,
    shiftDate: shiftDate,
  });

  if (!attendance) {
     return res
    .status(200)
    .json(
      new ApiResponse(200, {}, "No attendance found for today's shift."),
    );
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

  // Check if startDate exists and is not just an empty string
  if (startDate && startDate.trim() !== "") {
    finalStartDate = moment(startDate).startOf('day').format("YYYY-MM-DD");
    
    // Agar endDate khali hai toh startDate ko hi range bana do (Single Day View)
    finalEndDate = (endDate && endDate.trim() !== "") 
      ? moment(endDate).endOf('day').format("YYYY-MM-DD") 
      : moment(startDate).endOf('day').format("YYYY-MM-DD");
  } 
  else if (month && year) {
    finalStartDate = moment(`${year}-${month}-01`).startOf('month').format("YYYY-MM-DD");
    finalEndDate = moment(`${year}-${month}-01`).endOf('month').format("YYYY-MM-DD");
  } 
  else {
    // Default current month if nothing is provided
    finalStartDate = moment().startOf('month').format("YYYY-MM-DD");
    finalEndDate = moment().endOf('month').format("YYYY-MM-DD");
  }

  const records = await Attendance.find({
    employeeId: req.user._id,
    shiftDate: { 
      $gte: finalStartDate, 
      $lte: finalEndDate 
    }
  }).sort({ shiftDate: -1 });

  return res.status(200).json(
    new ApiResponse(200, records, "Attendance records fetched successfully")
  );
});

export { TimeIn, TimeOut,getTodayUserAttendance,getMonthlyAttendance };
