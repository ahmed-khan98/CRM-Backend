import { EmployeeDesignationHistory } from "../models/employeeDesignationHistory.model.js";
import { Employee } from "../models/employee.model.js";
import { payCycleRange } from "./payrollHelpers.js";

/**
 * Designation effective on/before asOfDate (latest match).
 */
export async function resolveDesignationAsOf(
  employeeId,
  asOfDate,
  fallback = ""
) {
  if (!employeeId || !asOfDate) return fallback || "";
  const row = await EmployeeDesignationHistory.findOne({
    employeeId,
    effectiveDate: { $lte: new Date(asOfDate) },
  })
    .sort({ effectiveDate: -1, createdAt: -1 })
    .select("designation")
    .lean();
  if (row?.designation) return row.designation;

  if (fallback) return fallback;
  const emp = await Employee.findById(employeeId).select("designation").lean();
  return emp?.designation || "";
}

/** End of payroll cycle for that month — designation as-of this date. */
export function payrollPeriodEndDate(year, month, cycleEndDay = 25) {
  const { end } = payCycleRange(year, month, cycleEndDay);
  return end;
}

export async function resolveDesignationForPayrollMonth(
  employeeId,
  year,
  month,
  cycleEndDay = 25,
  fallback = ""
) {
  const asOf = payrollPeriodEndDate(year, month, cycleEndDay);
  return resolveDesignationAsOf(employeeId, asOf, fallback);
}

export async function recordDesignationChange({
  employeeId,
  previousDesignation = "",
  designation,
  effectiveDate = new Date(),
  reason = "",
  actorId,
}) {
  if (!employeeId || !designation) return null;
  const prev = String(previousDesignation || "").trim();
  const next = String(designation || "").trim();
  if (!next || prev.toLowerCase() === next.toLowerCase()) return null;

  return EmployeeDesignationHistory.create({
    employeeId,
    previousDesignation: prev,
    designation: next,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    reason: reason || "",
    updatedBy: actorId || undefined,
    createdBy: actorId || undefined,
  });
}

/** Seed first history row (create employee / backfill). */
export async function ensureInitialDesignationHistory(
  employee,
  actorId
) {
  if (!employee?._id || !employee.designation) return null;
  const count = await EmployeeDesignationHistory.countDocuments({
    employeeId: employee._id,
  });
  if (count > 0) return null;
  return EmployeeDesignationHistory.create({
    employeeId: employee._id,
    previousDesignation: "",
    designation: employee.designation,
    effectiveDate: employee.joiningDate
      ? new Date(employee.joiningDate)
      : new Date(),
    reason: "Initial designation",
    updatedBy: actorId || undefined,
    createdBy: actorId || undefined,
  });
}
