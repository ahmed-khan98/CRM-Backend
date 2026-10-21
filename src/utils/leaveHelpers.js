import moment from "moment-timezone";
import { LeaveType } from "../models/leaveType.model.js";
import { LeaveBalance } from "../models/leaveBalance.model.js";
import { Holiday } from "../models/holiday.model.js";
import { Employee } from "../models/employee.model.js";

export const TZ = "Asia/Karachi";
export const EMP_SAFE_FIELDS = "fullName designation image departmentId role email";

const DEFAULT_TYPES = [
  { name: "Annual Leave", annualDays: 14, carryForward: true, requiresDocument: false, isPaid: true },
  { name: "Sick Leave", annualDays: 10, carryForward: false, requiresDocument: true, isPaid: true },
  { name: "Casual Leave", annualDays: 7, carryForward: false, requiresDocument: false, isPaid: true },
  { name: "Unpaid Leave", annualDays: 0, carryForward: false, requiresDocument: false, isPaid: false },
];

export const todayPKT = () => moment().tz(TZ).format("YYYY-MM-DD");

export const currentYear = () => moment().tz(TZ).year();

export async function ensureDefaultLeaveTypes() {
  const count = await LeaveType.countDocuments();
  if (count > 0) return;
  await LeaveType.insertMany(DEFAULT_TYPES);
}

export async function holidayDateSet(departmentId) {
  const query = departmentId
    ? { $or: [{ departmentId: null }, { departmentId }] }
    : { $or: [{ departmentId: null }, { departmentId: { $exists: false } }] };
  const rows = await Holiday.find(query).select("date").lean();
  // Normalize to YYYY-MM-DD so payroll matching never misses holidays
  return new Set(
    rows
      .map((h) => {
        const raw = h?.date;
        if (!raw) return "";
        if (raw instanceof Date) {
          return moment(raw).tz("Asia/Karachi").format("YYYY-MM-DD");
        }
        const s = String(raw).trim().slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
      })
      .filter(Boolean)
  );
}

export function countLeaveDays(fromDate, toDate, halfDay, holidaySet) {
  if (halfDay) return 0.5;
  const start = moment(fromDate, "YYYY-MM-DD");
  const end = moment(toDate, "YYYY-MM-DD");
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return 0;

  let days = 0;
  const cursor = start.clone();
  while (cursor.isSameOrBefore(end, "day")) {
    const dow = cursor.day();
    const key = cursor.format("YYYY-MM-DD");
    if (dow !== 0 && dow !== 6 && !holidaySet.has(key)) days += 1;
    cursor.add(1, "day");
  }
  return days;
}

export function datesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && aTo >= bFrom;
}

export async function scopedEmployees(req, employeeId) {
  const query = {
    status: "active",
    role: { $ne: "ADMIN" },
    ...(req.roleFilter || {}),
  };
  if (employeeId && employeeId !== "undefined" && employeeId !== "") {
    query._id = employeeId;
  }
  return Employee.find(query).select(EMP_SAFE_FIELDS).lean();
}

export async function assertTeamAccess(req, employeeId) {
  const role = req.user?.role;
  if (["ADMIN", "SUBADMIN", "HR_ADMIN"].includes(role)) return true;
  const { userHasHrAdminAccess } = await import("./hrAccess.js");
  if (await userHasHrAdminAccess(req.user)) return true;
  if (role === "DEP_ADMIN") {
    const emp = await Employee.findById(employeeId).select("departmentId").lean();
    if (!emp) return false;
    return String(emp.departmentId) === String(req.user.departmentId);
  }
  return String(employeeId) === String(req.user._id);
}

export async function ensureBalances(employeeId, year = currentYear()) {
  await ensureDefaultLeaveTypes();
  const types = await LeaveType.find({ isActive: true }).lean();
  const existing = await LeaveBalance.find({ employeeId, year }).lean();
  const have = new Set(existing.map((b) => String(b.leaveTypeId)));

  const toCreate = [];
  for (const type of types) {
    if (have.has(String(type._id))) continue;
    let allocated = type.annualDays || 0;
    if (type.carryForward) {
      const prev = await LeaveBalance.findOne({
        employeeId,
        leaveTypeId: type._id,
        year: year - 1,
      }).lean();
      if (prev?.remaining > 0) allocated += prev.remaining;
    }
    toCreate.push({
      employeeId,
      leaveTypeId: type._id,
      year,
      allocated,
      used: 0,
      remaining: allocated,
    });
  }
  if (toCreate.length) await LeaveBalance.insertMany(toCreate);

  return LeaveBalance.find({ employeeId, year })
    .populate("leaveTypeId")
    .lean();
}

export function populateRequest(query) {
  return query
    .populate({
      path: "employeeId",
      select: EMP_SAFE_FIELDS,
      populate: { path: "departmentId", select: "name" },
    })
    .populate("leaveTypeId")
    .populate("approvedBy", "fullName designation")
    .populate("history.by", "fullName designation");
}
