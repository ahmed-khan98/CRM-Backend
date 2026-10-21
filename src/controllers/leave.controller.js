import moment from "moment-timezone";
import mongoose from "mongoose";
import { LeaveType } from "../models/leaveType.model.js";
import { LeaveRequest } from "../models/leaveRequest.model.js";
import { LeaveBalance } from "../models/leaveBalance.model.js";
import { Holiday } from "../models/holiday.model.js";
import { Employee } from "../models/employee.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadAttachmentOnCloudinary } from "../utils/cloudinary.js";
import {
  TZ,
  todayPKT,
  currentYear,
  ensureDefaultLeaveTypes,
  holidayDateSet,
  countLeaveDays,
  datesOverlap,
  scopedEmployees,
  assertTeamAccess,
  ensureBalances,
  populateRequest,
} from "../utils/leaveHelpers.js";

const overlapFilter = (from, to) => ({
  $or: [
    { fromDate: { $lte: to }, toDate: { $gte: from } },
  ],
});

const getLeaveTypes = asyncHandler(async (req, res) => {
  await ensureDefaultLeaveTypes();
  const includeInactive = req.query.includeInactive === "true";
  const filter = includeInactive ? {} : { isActive: true };
  const types = await LeaveType.find(filter).sort({ name: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, types, "Leave types fetched"));
});

const createLeaveType = asyncHandler(async (req, res) => {
  const { name, annualDays, carryForward, requiresDocument, isPaid } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Leave type name is required");
  const exists = await LeaveType.findOne({ name: name.trim() });
  if (exists) throw new ApiError(400, "Leave type already exists");
  const doc = await LeaveType.create({
    name: name.trim(),
    annualDays: Number(annualDays) || 0,
    carryForward: Boolean(carryForward),
    requiresDocument: Boolean(requiresDocument),
    isPaid: isPaid === false || isPaid === "false" ? false : true,
  });
  return res.status(201).json(new ApiResponse(201, doc, "Leave type created"));
});

const updateLeaveType = asyncHandler(async (req, res) => {
  const existing = await LeaveType.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Leave type not found");
  const fields = ["name", "annualDays", "carryForward", "requiresDocument", "isPaid", "isActive"];
  fields.forEach((key) => {
    if (req.body[key] === undefined) return;
    if (key === "annualDays") existing[key] = Number(req.body[key]) || 0;
    else if (["carryForward", "requiresDocument", "isPaid", "isActive"].includes(key)) {
      existing[key] = req.body[key] === true || req.body[key] === "true";
    } else existing[key] = req.body[key];
  });
  await existing.save();
  return res.status(200).json(new ApiResponse(200, existing, "Leave type updated"));
});

const deleteLeaveType = asyncHandler(async (req, res) => {
  const used = await LeaveRequest.countDocuments({ leaveTypeId: req.params.id });
  if (used > 0) {
    const type = await LeaveType.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!type) throw new ApiError(404, "Leave type not found");
    return res
      .status(200)
      .json(new ApiResponse(200, type, "Leave type archived because it is in use"));
  }
  const type = await LeaveType.findByIdAndDelete(req.params.id);
  if (!type) throw new ApiError(404, "Leave type not found");
  return res.status(200).json(new ApiResponse(200, type, "Leave type deleted"));
});

const getHolidays = asyncHandler(async (req, res) => {
  const { year, departmentId } = req.query;
  const filter = {};
  if (year) {
    filter.date = {
      $gte: `${year}-01-01`,
      $lte: `${year}-12-31`,
    };
  }
  if (departmentId) filter.departmentId = departmentId;
  const rows = await Holiday.find(filter)
    .populate("departmentId", "name")
    .sort({ date: 1 })
    .lean();
  return res.status(200).json(new ApiResponse(200, rows, "Holidays fetched"));
});

const createHoliday = asyncHandler(async (req, res) => {
  const { name, date, departmentId } = req.body;
  if (!name?.trim() || !date) throw new ApiError(400, "Name and date are required");
  const doc = await Holiday.create({
    name: name.trim(),
    date,
    departmentId: departmentId || null,
  });
  return res.status(201).json(new ApiResponse(201, doc, "Holiday created"));
});

const updateHoliday = asyncHandler(async (req, res) => {
  const existing = await Holiday.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Holiday not found");
  if (req.body.name !== undefined) existing.name = req.body.name.trim();
  if (req.body.date !== undefined) existing.date = req.body.date;
  if (req.body.departmentId !== undefined) {
    existing.departmentId = req.body.departmentId || null;
  }
  await existing.save();
  return res.status(200).json(new ApiResponse(200, existing, "Holiday updated"));
});

const deleteHoliday = asyncHandler(async (req, res) => {
  const doc = await Holiday.findByIdAndDelete(req.params.id);
  if (!doc) throw new ApiError(404, "Holiday not found");
  return res.status(200).json(new ApiResponse(200, doc, "Holiday deleted"));
});

const getMyBalances = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || currentYear();
  const rows = await ensureBalances(req.user._id, year);
  return res.status(200).json(new ApiResponse(200, rows, "Leave balances fetched"));
});

const getEmployeeBalances = asyncHandler(async (req, res) => {
  const allowed = await assertTeamAccess(req, req.params.employeeId);
  if (!allowed) throw new ApiError(403, "You are not authorized for this action");
  const year = Number(req.query.year) || currentYear();
  const rows = await ensureBalances(req.params.employeeId, year);
  return res.status(200).json(new ApiResponse(200, rows, "Leave balances fetched"));
});

const PROXY_ROLES = ["ADMIN", "SUBADMIN", "HR_ADMIN", "DEP_ADMIN"];

const applyLeave = asyncHandler(async (req, res) => {
  const { leaveTypeId, fromDate, toDate, reason, employeeId: requestedFor } = req.body;
  const halfDay = req.body.halfDay === true || req.body.halfDay === "true";
  let employeeId = req.user._id;
  let departmentId = req.user?.departmentId;

  if (requestedFor && String(requestedFor) !== String(req.user._id)) {
    const { userHasHrAdminAccess } = await import("../utils/hrAccess.js");
    const canProxy =
      PROXY_ROLES.includes(req.user?.role) ||
      (await userHasHrAdminAccess(req.user));
    if (!canProxy) {
      throw new ApiError(403, "You can only apply leave for yourself");
    }
    const allowed = await assertTeamAccess(req, requestedFor);
    if (!allowed) {
      throw new ApiError(403, "You can only apply leave for employees in your department");
    }
    const target = await Employee.findById(requestedFor).select("departmentId").lean();
    if (!target) throw new ApiError(404, "Employee not found");
    employeeId = requestedFor;
    departmentId = target.departmentId;
  }

  if (!leaveTypeId || !fromDate) {
    throw new ApiError(400, "Leave type and date are required");
  }
  const leaveDate = fromDate;
  const endDate = fromDate;

  const type = await LeaveType.findById(leaveTypeId);
  if (!type || !type.isActive) throw new ApiError(404, "Leave type not found");

  if (type.requiresDocument && !req.file) {
    throw new ApiError(400, "A supporting document is required for this leave type");
  }

  const holidays = await holidayDateSet(departmentId);
  const days = countLeaveDays(leaveDate, endDate, halfDay, holidays);
  if (!days) throw new ApiError(400, "Selected date falls on weekend or holiday");

  const clash = await LeaveRequest.findOne({
    employeeId,
    status: { $in: ["pending", "approved"] },
    ...overlapFilter(leaveDate, endDate),
  });
  if (clash) {
    throw new ApiError(
      400,
      String(employeeId) === String(req.user._id)
        ? "You already have leave on this date"
        : "This employee already has leave on this date"
    );
  }

  if (type.isPaid) {
    const year = moment(leaveDate).year();
    const balances = await ensureBalances(employeeId, year);
    const balance = balances.find((b) => String(b.leaveTypeId?._id || b.leaveTypeId) === String(leaveTypeId));
    if (balance && balance.remaining < days) {
      throw new ApiError(400, `Insufficient ${type.name} balance. Remaining: ${balance.remaining}`);
    }
  }

  let documentUrl = "";
  let documentName = "";
  if (req.file) {
    const uploaded = await uploadAttachmentOnCloudinary(req.file);
    if (!uploaded?.url && !uploaded?.secure_url) {
      throw new ApiError(400, "File upload failed");
    }
    documentUrl = uploaded.secure_url || uploaded.url;
    documentName = req.file.originalname || "";
  }

  const request = await LeaveRequest.create({
    employeeId,
    leaveTypeId,
    fromDate: leaveDate,
    toDate: endDate,
    days,
    halfDay,
    reason: reason || "",
    documentUrl,
    documentName,
    status: "pending",
    history: [{ action: "submitted", by: req.user._id, note: reason || "" }],
  });

  const populated = await populateRequest(LeaveRequest.findById(request._id));
  return res.status(201).json(new ApiResponse(201, populated, "Leave request submitted"));
});

const getMyRequests = asyncHandler(async (req, res) => {
  const { status, leaveTypeId } = req.query;
  const filter = { employeeId: req.user._id };
  if (status) filter.status = status;
  if (leaveTypeId) filter.leaveTypeId = leaveTypeId;
  const rows = await populateRequest(LeaveRequest.find(filter).sort({ createdAt: -1 }));
  return res.status(200).json(new ApiResponse(200, rows, "Leave requests fetched"));
});

const getEmployeeRequests = asyncHandler(async (req, res) => {
  const allowed = await assertTeamAccess(req, req.params.employeeId);
  if (!allowed) throw new ApiError(403, "You are not authorized for this action");
  const filter = { employeeId: req.params.employeeId };
  if (req.query.status) filter.status = req.query.status;
  const rows = await populateRequest(LeaveRequest.find(filter).sort({ createdAt: -1 }));
  return res.status(200).json(new ApiResponse(200, rows, "Leave requests fetched"));
});

const getTeamLeave = asyncHandler(async (req, res) => {
  const { employeeId, leaveTypeId, status, startDate, endDate, month, year } = req.query;
  const employees = await scopedEmployees(req, employeeId);
  const employeeIds = employees.map((e) => e._id);

  let from;
  let to;
  const now = moment().tz(TZ);
  if (startDate && endDate) {
    from = startDate;
    to = endDate;
  } else if (month && year) {
    const base = moment({ year: Number(year), month: Number(month) - 1, day: 1 });
    from = base.clone().startOf("month").format("YYYY-MM-DD");
    to = base.clone().endOf("month").format("YYYY-MM-DD");
  } else if (startDate) {
    from = startDate;
    to = startDate;
  } else {
    from = now.format("YYYY-MM-DD");
    to = now.format("YYYY-MM-DD");
  }

  const filter = {
    employeeId: { $in: employeeIds },
    ...overlapFilter(from, to),
  };
  if (leaveTypeId) filter.leaveTypeId = leaveTypeId;
  if (status) filter.status = status;

  const rows = await populateRequest(LeaveRequest.find(filter).sort({ fromDate: -1, createdAt: -1 }));

  const today = todayPKT();
  const monthStart = now.clone().startOf("month").format("YYYY-MM-DD");
  const monthEnd = now.clone().endOf("month").format("YYYY-MM-DD");
  const monthScope = {
    employeeId: { $in: employeeIds },
    ...overlapFilter(monthStart, monthEnd),
  };

  const [onLeaveToday, monthDocs] = await Promise.all([
    LeaveRequest.countDocuments({
      employeeId: { $in: employeeIds },
      status: "approved",
      ...overlapFilter(today, today),
    }),
    LeaveRequest.find(monthScope).select("status").lean(),
  ]);

  const stats = {
    pending: monthDocs.filter((r) => r.status === "pending").length,
    approved: monthDocs.filter((r) => r.status === "approved").length,
    rejected: monthDocs.filter((r) => r.status === "rejected").length,
    onLeaveToday,
    monthTotal: monthDocs.length,
    total: rows.length,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, { items: rows, stats }, "Team leave fetched"));
});

const getLeaveById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(404, "Leave request not found");
  }
  const doc = await populateRequest(LeaveRequest.findById(req.params.id));
  if (!doc) throw new ApiError(404, "Leave request not found");
  const allowed = await assertTeamAccess(req, doc.employeeId?._id || doc.employeeId);
  if (!allowed) throw new ApiError(403, "You are not authorized for this action");
  return res.status(200).json(new ApiResponse(200, doc, "Leave request fetched"));
});

const decideLeave = async (req, status) => {
  const request = await LeaveRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, "Leave request not found");
  if (request.status !== "pending") {
    throw new ApiError(400, "Only pending requests can be updated");
  }

  const allowed = await assertTeamAccess(req, request.employeeId);
  if (!allowed) throw new ApiError(403, "You are not authorized for this action");

  if (status === "approved") {
    const type = await LeaveType.findById(request.leaveTypeId);
    if (type?.isPaid) {
      const year = moment(request.fromDate).year();
      await ensureBalances(request.employeeId, year);
      const balance = await LeaveBalance.findOne({
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
      });
      if (balance && balance.remaining < request.days) {
        throw new ApiError(400, "Employee no longer has enough leave balance");
      }
      if (balance) {
        balance.used += request.days;
        balance.remaining = Math.max(0, balance.allocated - balance.used);
        await balance.save();
      }
    }
  }

  const note = req.body?.note || "";
  request.status = status;
  request.approvedBy = req.user._id;
  request.decisionNote = note;
  request.history.push({
    action: status === "approved" ? "approved" : "rejected",
    by: req.user._id,
    note,
  });
  await request.save();
  return populateRequest(LeaveRequest.findById(request._id));
};

const approveLeave = asyncHandler(async (req, res) => {
  const doc = await decideLeave(req, "approved");
  return res.status(200).json(new ApiResponse(200, doc, "Leave approved"));
});

const rejectLeave = asyncHandler(async (req, res) => {
  const doc = await decideLeave(req, "rejected");
  return res.status(200).json(new ApiResponse(200, doc, "Leave rejected"));
});

export {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getMyBalances,
  getEmployeeBalances,
  applyLeave,
  getMyRequests,
  getEmployeeRequests,
  getTeamLeave,
  getLeaveById,
  approveLeave,
  rejectLeave,
};
