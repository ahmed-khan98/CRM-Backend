import { EmployeeCarHistory } from "../models/employeeCarHistory.model.js";
import { ApiError } from "../utils/ApiError.js";
import { createEmployeeScopedCrud } from "../utils/createEmployeeScopedCrud.js";

const crud = createEmployeeScopedCrud({
  Model: EmployeeCarHistory,
  resourceName: "Car history",
  allowHardDelete: false,
  searchFields: ["carName", "registrationNumber"],
  populate: [
    { path: "employeeId", select: "fullName" },
    { path: "createdBy", select: "fullName" },
  ],
  buildCreatePayload: async (req) => {
    const {
      employeeId,
      carName,
      registrationNumber,
      assignedDate,
      returnedDate,
      status,
      notes,
    } = req.body;
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    if (!carName?.trim()) throw new ApiError(400, "carName is required");
    if (!assignedDate) throw new ApiError(400, "assignedDate is required");

    return {
      employeeId,
      carName,
      registrationNumber: registrationNumber || "",
      assignedDate,
      returnedDate: returnedDate || undefined,
      status: status || "assigned",
      notes: notes || "",
    };
  },
  buildUpdatePayload: async (req) => {
    const payload = {};
    [
      "carName",
      "registrationNumber",
      "assignedDate",
      "returnedDate",
      "status",
      "notes",
    ].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });
    return payload;
  },
});

export const getAllCarHistory = crud.getAll;
export const getCarHistoryById = crud.getOne;
export const createCarHistory = crud.create;
export const updateCarHistory = crud.update;
export const deleteCarHistory = crud.remove;
