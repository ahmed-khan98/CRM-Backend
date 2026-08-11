import { EmployeeInsuranceHistory } from "../models/employeeInsuranceHistory.model.js";
import { ApiError } from "../utils/ApiError.js";
import { createEmployeeScopedCrud } from "../utils/createEmployeeScopedCrud.js";

const crud = createEmployeeScopedCrud({
  Model: EmployeeInsuranceHistory,
  resourceName: "Insurance history",
  allowHardDelete: false,
  searchFields: ["provider", "policyNumber"],
  populate: [
    { path: "employeeId", select: "fullName" },
    { path: "updatedBy", select: "fullName" },
  ],
  buildCreatePayload: async (req) => {
    const {
      employeeId,
      provider,
      policyNumber,
      coverage,
      effectiveDate,
      expiryDate,
    } = req.body;
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    if (!provider?.trim()) throw new ApiError(400, "provider is required");
    if (!effectiveDate) throw new ApiError(400, "effectiveDate is required");

    return {
      employeeId,
      provider,
      policyNumber: policyNumber || "",
      coverage: coverage || "",
      effectiveDate,
      expiryDate: expiryDate || undefined,
      updatedBy: req.user?._id,
    };
  },
  buildUpdatePayload: async (req) => {
    const payload = {};
    [
      "provider",
      "policyNumber",
      "coverage",
      "effectiveDate",
      "expiryDate",
    ].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });
    return payload;
  },
});

export const getAllInsuranceHistory = crud.getAll;
export const getInsuranceHistoryById = crud.getOne;
export const createInsuranceHistory = crud.create;
export const updateInsuranceHistory = crud.update;
export const deleteInsuranceHistory = crud.remove;
