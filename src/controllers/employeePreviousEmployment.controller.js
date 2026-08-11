import { EmployeePreviousEmployment } from "../models/employeePreviousEmployment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { createEmployeeScopedCrud } from "../utils/createEmployeeScopedCrud.js";
import { toNumber } from "../utils/hrmsHelpers.js";

const crud = createEmployeeScopedCrud({
  Model: EmployeePreviousEmployment,
  resourceName: "Previous employment",
  allowHardDelete: true,
  searchFields: ["companyName", "designation"],
  populate: [{ path: "employeeId", select: "fullName" }],
  buildCreatePayload: async (req) => {
    const {
      employeeId,
      companyName,
      designation,
      startDate,
      endDate,
      lastSalary,
      reasonForLeaving,
    } = req.body;
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    if (!companyName?.trim()) throw new ApiError(400, "companyName is required");
    if (!designation?.trim()) throw new ApiError(400, "designation is required");
    if (!startDate) throw new ApiError(400, "startDate is required");
    return {
      employeeId,
      companyName,
      designation,
      startDate,
      endDate: endDate || undefined,
      lastSalary: toNumber(lastSalary),
      reasonForLeaving: reasonForLeaving || "",
    };
  },
  buildUpdatePayload: async (req) => {
    const payload = {};
    [
      "companyName",
      "designation",
      "startDate",
      "endDate",
      "reasonForLeaving",
    ].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });
    if (req.body.lastSalary !== undefined)
      payload.lastSalary = toNumber(req.body.lastSalary);
    return payload;
  },
});

export const getAllPreviousEmployment = crud.getAll;
export const getPreviousEmploymentById = crud.getOne;
export const createPreviousEmployment = crud.create;
export const updatePreviousEmployment = crud.update;
export const deletePreviousEmployment = crud.remove;
