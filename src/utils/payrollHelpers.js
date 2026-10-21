import moment from "moment-timezone";
import { Attendance } from "../models/attendence.model.js";
import { Employee } from "../models/employee.model.js";
import { EmployeeAllowance } from "../models/employeeAllowance.model.js";
import { LeaveRequest } from "../models/leaveRequest.model.js";
import { DeductionType } from "../models/deductionType.model.js";
import { PayrollSettings } from "../models/payrollSettings.model.js";
import { holidayDateSet } from "./leaveHelpers.js";

export const TZ = "Asia/Karachi";
export const EMP_SAFE =
  "fullName designation image departmentId role email currentSalary bankName accountNumber accountTitle joiningDate";

const DEFAULT_TYPES = [
  { name: "Income Tax", code: "tax", calcType: "percentage", defaultAmount: 0 },
  { name: "Provident Fund", code: "pf", calcType: "percentage", defaultAmount: 0 },
  { name: "Loan Recovery", code: "loan", calcType: "fixed", defaultAmount: 0 },
  { name: "Absent Deduction Rate", code: "absent", calcType: "percentage", defaultAmount: 100 },
];

const DEFAULT_SLABS = [
  { from: 0, to: 600000, rate: 0 },
  { from: 600001, to: 1200000, rate: 5 },
  { from: 1200001, to: 2400000, rate: 15 },
  { from: 2400001, to: 999999999, rate: 25 },
];

/** Selected month M ends on cycleEndDay (default 25). Start is the next day of the previous month (default 26). */
export function payCycleRange(year, month, cycleEndDay = 25) {
  const endDay = Math.min(28, Math.max(1, Number(cycleEndDay) || 25));
  const end = moment({ year, month: month - 1, day: endDay });
  const start = end.clone().subtract(1, "month").add(1, "day");
  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
  };
}

export function monthRange(year, month, cycleEndDay = 25) {
  return payCycleRange(year, month, cycleEndDay);
}

export function countWeekdays(year, month, cycleEndDay = 25) {
  return weekdayList(year, month, cycleEndDay).length;
}

export function weekdayList(year, month, cycleEndDay = 25) {
  const { start, end } = payCycleRange(year, month, cycleEndDay);
  const days = [];
  const cursor = moment(start);
  const last = moment(end);
  while (cursor.isSameOrBefore(last, "day")) {
    if (cursor.day() !== 0 && cursor.day() !== 6) {
      days.push(cursor.format("YYYY-MM-DD"));
    }
    cursor.add(1, "day");
  }
  return days;
}

export function maskAccount(num = "") {
  const s = String(num).replace(/\s+/g, "");
  if (!s) return "";
  return s.length <= 4 ? "****" : `****${s.slice(-4)}`;
}

export function applyTaxSlabs(annualTaxable, slabs = []) {
  if (!slabs.length || annualTaxable <= 0) return 0;
  let tax = 0;
  for (const slab of slabs) {
    const from = Number(slab.from) || 0;
    const to = Number(slab.to) || from;
    const rate = Number(slab.rate) || 0;
    if (annualTaxable <= from) continue;
    const taxable = Math.min(annualTaxable, to) - from;
    if (taxable > 0) tax += (taxable * rate) / 100;
  }
  return Math.round(tax / 12);
}

export async function ensurePayrollDefaults() {
  const [typeCount, settings] = await Promise.all([
    DeductionType.countDocuments(),
    PayrollSettings.findOne({ key: "default" }),
  ]);
  if (!typeCount) await DeductionType.insertMany(DEFAULT_TYPES);
  if (!settings) {
    return PayrollSettings.create({
      key: "default",
      companyName: "Zytron World",
      payDay: 1,
      taxSlabs: DEFAULT_SLABS,
      lateLatesPerDay: 2,
      cycleEndDay: 25,
    });
  }
  let dirty = false;
  if (!settings.lateLatesPerDay) {
    settings.lateLatesPerDay = 2;
    dirty = true;
  }
  if (!settings.cycleEndDay || settings.cycleEndDay === 24) {
    settings.cycleEndDay = 25;
    dirty = true;
  }
  if (dirty) await settings.save();
  return settings;
}

export async function getDeductionMap() {
  const rows = await DeductionType.find({ isActive: true }).sort({ name: 1 }).lean();
  const map = {};
  rows.forEach((r) => {
    map[r.code] = r;
  });
  return { map, types: rows };
}

function typeAmount(type, salary) {
  if (!type) return 0;
  const n = Number(type.defaultAmount || 0);
  if (type.calcType === "percentage") {
    return Math.round((Number(salary.basicSalary || 0) * n) / 100);
  }
  return Math.round(n);
}

export async function approvedLeaveDates(employeeId, start, end) {
  const rows = await LeaveRequest.find({
    employeeId,
    status: "approved",
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select("fromDate toDate")
    .lean();
  const set = new Set();
  rows.forEach((r) => {
    const cursor = moment(r.fromDate);
    const last = moment(r.toDate);
    while (cursor.isSameOrBefore(last, "day")) {
      set.add(cursor.format("YYYY-MM-DD"));
      cursor.add(1, "day");
    }
  });
  return set;
}

/** Normalize any holiday/attendance date to YYYY-MM-DD (PK). */
export function toDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return moment(value).tz(TZ).format("YYYY-MM-DD");
  }
  const raw = String(value).trim();
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const m = moment.tz(raw, TZ);
  return m.isValid() ? m.format("YYYY-MM-DD") : "";
}

/**
 * Pay-cycle attendance stats.
 * - Absents = only explicit `absent` marks (not blank/missing days).
 *   Missing days used to inflate counts vs calendar-month attendance UI
 *   because the cycle spans prior-month weekdays (e.g. 26–31 Aug).
 * - Company/dept holidays never count as absent (even if marked absent).
 * - Days before joiningDate are ignored.
 */
export async function attendanceBreakdown(employeeId, year, month, cycleEndDay = 25, departmentId) {
  const { start, end } = monthRange(year, month, cycleEndDay);
  const weekdays = weekdayList(year, month, cycleEndDay);
  const emp = await Employee.findById(employeeId)
    .select("departmentId joiningDate")
    .lean();
  const deptId = departmentId || emp?.departmentId;
  const joinKey = emp?.joiningDate ? toDateKey(emp.joiningDate) : null;

  const [records, leaveDates, holidays] = await Promise.all([
    Attendance.find({
      employeeId,
      shiftDate: { $gte: start, $lte: end },
    })
      .select("shiftDate status")
      .lean(),
    approvedLeaveDates(employeeId, start, end),
    holidayDateSet(deptId),
  ]);

  const holidayDates = new Set(
    [...holidays].map((d) => toDateKey(d)).filter(Boolean)
  );
  const leaveKeys = new Set(
    [...leaveDates].map((d) => toDateKey(d)).filter(Boolean)
  );
  const byDate = new Map(
    records.map((r) => [toDateKey(r.shiftDate), r.status])
  );

  let absentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let holidayDays = 0;
  let missingDays = 0;

  weekdays.forEach((date) => {
    if (joinKey && date < joinKey) return;

    if (holidayDates.has(date)) {
      holidayDays += 1;
      return;
    }
    if (leaveKeys.has(date)) return;

    const status = byDate.get(date);
    if (!status) {
      // No punch / no mark — do not auto-absent (matches attendance UI counts)
      missingDays += 1;
      return;
    }
    if (status === "absent") absentDays += 1;
    else if (status === "late") lateDays += 1;
    else if (status === "half-day") halfDays += 1;
  });

  const payableDays = joinKey
    ? weekdays.filter((date) => date >= joinKey).length
    : weekdays.length;

  return {
    absentDays,
    lateDays,
    halfDays,
    holidayDays,
    missingDays,
    workingDays: weekdays.length,
    payableDays,
    joinKey: joinKey || "",
    cycleStart: start,
    cycleEnd: end,
  };
}

/** True if employee has at least one pay-cycle day on/after joining date. */
export function isEligibleForPayCycle(joiningDate, periodEnd) {
  if (!joiningDate) return true;
  const joinKey = toDateKey(joiningDate);
  if (!joinKey || !periodEnd) return true;
  return joinKey <= periodEnd;
}

/**
 * Prorate monthly salary by payable weekdays / full cycle weekdays.
 * e.g. join mid-cycle → only days from joining date onward.
 */
export function prorateSalary(salary, payableDays, totalDays) {
  const total = Math.max(0, Number(totalDays) || 0);
  const payable = Math.max(0, Number(payableDays) || 0);
  if (!total || payable >= total) {
    return {
      ...salary,
      prorated: false,
      payableDays: payable || total,
      totalDays: total,
    };
  }
  if (payable <= 0) {
    return {
      basicSalary: 0,
      allowances: (salary.allowances || []).map((a) => ({ ...a, amount: 0 })),
      allowancesTotal: 0,
      grossPay: 0,
      prorated: true,
      payableDays: 0,
      totalDays: total,
    };
  }
  const factor = payable / total;
  const basicSalary = Math.round(Number(salary.basicSalary || 0) * factor);
  const allowances = (salary.allowances || []).map((a) => ({
    ...a,
    amount: Math.round(Number(a.amount || 0) * factor),
  }));
  const allowancesTotal = allowances.reduce((s, a) => s + (a.amount || 0), 0);
  return {
    basicSalary,
    allowances,
    allowancesTotal,
    grossPay: basicSalary + allowancesTotal,
    prorated: true,
    payableDays: payable,
    totalDays: total,
  };
}

export async function snapshotSalary(employee) {
  const allowances = await EmployeeAllowance.find({
    employeeId: employee._id,
    status: "active",
  }).lean();

  const items = allowances.map((a) => ({
    name: a.allowanceType,
    amount: a.benefitMode === "company_car" ? 0 : Number(a.amount || 0),
    mode: a.benefitMode || "cash",
  }));
  const allowancesTotal = items.reduce((s, a) => s + (a.amount || 0), 0);
  const basicSalary = Number(employee.currentSalary || 0);
  return { basicSalary, allowances: items, allowancesTotal, grossPay: basicSalary + allowancesTotal };
}

export async function scopedPayrollEmployees(req, employeeId) {
  const query = {
    status: "active",
    role: { $ne: "ADMIN" },
    ...(req.roleFilter || {}),
  };
  if (employeeId) query._id = employeeId;
  return Employee.find(query)
    .select(EMP_SAFE)
    .populate("departmentId", "name")
    .lean();
}

export function computeEntryPay({
  salary,
  attendance,
  extraDeductions = [],
  deductionMap,
  deductionTypes,
  slabs,
  missingBank,
  lateLatesPerDay = 2,
  /** Full monthly gross before joining-date proration (for daily rate). */
  fullGrossPay,
}) {
  const types = (deductionTypes?.length
    ? deductionTypes
    : Object.values(deductionMap || {})
  ).filter((t) => t && t.isActive !== false);

  const findCode = (code) => types.find((t) => t.code === code);
  const taxType = findCode("tax");
  const pfType = findCode("pf");
  const absentType = findCode("absent");

  const workingDays = attendance.workingDays || 22;
  const rateGross = Number(fullGrossPay ?? salary.grossPay ?? 0);
  const daily = workingDays > 0 ? rateGross / workingDays : 0;
  const latesPerDay = Math.max(1, Number(lateLatesPerDay || 2));

  let absentDeduction = 0;
  if (absentType) {
    const absentRate = Number(absentType.defaultAmount ?? 100);
    const absentUnits = (attendance.absentDays || 0) + (attendance.halfDays || 0) * 0.5;
    absentDeduction = Math.round(absentUnits * daily * (absentRate / 100));
  }

  const lateDayUnits = Math.floor((attendance.lateDays || 0) / latesPerDay);
  const lateDeduction = Math.round(lateDayUnits * daily);
  const tax = typeAmount(taxType, salary);
  const pf = typeAmount(pfType, salary);

  const autoExtras = types
    .filter((t) => !["tax", "pf", "absent", "late"].includes(t.code))
    .map((t) => ({
      name: t.name,
      amount: typeAmount(t, salary),
      note: "from settings",
    }))
    .filter((d) => d.amount > 0);

  const manual = (extraDeductions || []).filter((d) => d.note !== "from settings");
  const mergedExtras = [...autoExtras, ...manual];
  const extra = mergedExtras.reduce((s, d) => s + Number(d.amount || 0), 0);
  const deductionsTotal = absentDeduction + lateDeduction + tax + pf + extra;
  const earnedGross = Number(salary.grossPay || 0);
  const netPay = Math.max(0, Math.round(earnedGross - deductionsTotal));

  return {
    ...attendance,
    extraDeductions: mergedExtras,
    absentDeduction,
    lateDeduction,
    tax,
    pf,
    deductionsTotal,
    grossPay: earnedGross,
    netPay,
    status: missingBank ? "review" : "draft",
  };
}

export function applyEntryTotals(entry) {
  const extra = (entry.extraDeductions || []).reduce(
    (s, d) => s + Number(d.amount || 0),
    0
  );
  entry.deductionsTotal =
    Number(entry.absentDeduction || 0) +
    Number(entry.lateDeduction || 0) +
    Number(entry.tax || 0) +
    Number(entry.pf || 0) +
    extra;
  entry.netPay = Math.max(0, Math.round(Number(entry.grossPay || 0) - entry.deductionsTotal));
  return entry;
}

export function recalcTotals(entries) {
  return {
    employees: entries.length,
    gross: entries.reduce((s, e) => s + (e.grossPay || 0), 0),
    deductions: entries.reduce((s, e) => s + (e.deductionsTotal || 0), 0),
    net: entries.reduce((s, e) => s + (e.netPay || 0), 0),
    pendingReview: entries.filter((e) => e.status === "review" || e.missingBank).length,
  };
}
