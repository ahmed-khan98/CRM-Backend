import { EmployeeSalaryHistory } from "../models/employeeSalaryHistory.model.js";
import { Employee } from "../models/employee.model.js";
import { ApiError } from "../utils/ApiError.js";
import { createEmployeeScopedCrud } from "../utils/createEmployeeScopedCrud.js";
import { toNumber } from "../utils/hrmsHelpers.js";

const crud = createEmployeeScopedCrud({
  Model: EmployeeSalaryHistory,
  resourceName: "Salary history",
  allowHardDelete: false,
  populate: [
    { path: "employeeId", select: "fullName" },
    { path: "updatedBy", select: "fullName" },
  ],
  buildCreatePayload: async (req) => {
    const { employeeId, newSalary, effectiveDate, reason } = req.body;
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    const next = toNumber(newSalary);
    if (next === undefined) throw new ApiError(400, "newSalary is required");
    if (!effectiveDate) throw new ApiError(400, "effectiveDate is required");

    const emp = await Employee.findById(employeeId);
    if (!emp) throw new ApiError(404, "Employee not found");

    const previousSalary = emp.currentSalary || 0;
    if (Number(previousSalary) === Number(next)) {
      throw new ApiError(
        400,
        "New salary is the same as current salary — no revision recorded"
      );
    }
    emp.currentSalary = next;
    await emp.save();

    return {
      employeeId,
      previousSalary,
      newSalary: next,
      effectiveDate,
      reason: reason || "",
      updatedBy: req.user?._id,
    };
  },
  buildUpdatePayload: async (req) => {
    // Allow correcting reason / effectiveDate only — never rewrite salary amounts in history
    const payload = {};
    if (req.body.reason !== undefined) payload.reason = req.body.reason;
    if (req.body.effectiveDate !== undefined)
      payload.effectiveDate = req.body.effectiveDate;
    return payload;
  },
});

export const getAllSalaryHistory = crud.getAll;
export const getSalaryHistoryById = crud.getOne;
export const createSalaryHistory = crud.create;
export const updateSalaryHistory = crud.update;
export const deleteSalaryHistory = crud.remove;
