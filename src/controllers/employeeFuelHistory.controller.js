import { EmployeeFuelHistory } from "../models/employeeFuelHistory.model.js";
import { ApiError } from "../utils/ApiError.js";
import { createEmployeeScopedCrud } from "../utils/createEmployeeScopedCrud.js";
import { toNumber } from "../utils/hrmsHelpers.js";

const crud = createEmployeeScopedCrud({
  Model: EmployeeFuelHistory,
  resourceName: "Fuel history",
  allowHardDelete: false,
  populate: [
    { path: "employeeId", select: "fullName" },
    { path: "updatedBy", select: "fullName" },
  ],
  buildCreatePayload: async (req) => {
    const {
      employeeId,
      fuelAllowance,
      fuelCardNumber,
      effectiveDate,
      endDate,
    } = req.body;
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    const amount = toNumber(fuelAllowance);
    if (amount === undefined)
      throw new ApiError(400, "fuelAllowance is required");
    if (!effectiveDate) throw new ApiError(400, "effectiveDate is required");

    return {
      employeeId,
      fuelAllowance: amount,
      fuelCardNumber: fuelCardNumber || "",
      effectiveDate,
      endDate: endDate || undefined,
      updatedBy: req.user?._id,
    };
  },
  buildUpdatePayload: async (req) => {
    const payload = {};
    if (req.body.fuelAllowance !== undefined) {
      const amount = toNumber(req.body.fuelAllowance);
      if (amount === undefined) throw new ApiError(400, "Invalid fuelAllowance");
      payload.fuelAllowance = amount;
    }
    if (req.body.fuelCardNumber !== undefined)
      payload.fuelCardNumber = req.body.fuelCardNumber;
    if (req.body.effectiveDate !== undefined)
      payload.effectiveDate = req.body.effectiveDate;
    if (req.body.endDate !== undefined) payload.endDate = req.body.endDate;
    return payload;
  },
});

export const getAllFuelHistory = crud.getAll;
export const getFuelHistoryById = crud.getOne;
export const createFuelHistory = crud.create;
export const updateFuelHistory = crud.update;
export const deleteFuelHistory = crud.remove;
