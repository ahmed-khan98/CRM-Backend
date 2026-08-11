import {
  EmployeeAllowance,
  ALLOWANCE_TYPES,
  BENEFIT_MODES,
} from "../models/employeeAllowance.model.js";
import { Vehicle } from "../models/vehicle.model.js";
import { EmployeeCarHistory } from "../models/employeeCarHistory.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  parsePagination,
  paginatedResponse,
  toNumber,
} from "../utils/hrmsHelpers.js";

const releaseVehicle = async (vehicleId) => {
  if (!vehicleId) return;
  await Vehicle.findByIdAndUpdate(vehicleId, {
    $set: { assignedTo: null, status: "available" },
  });
};

const assignVehicleToEmployee = async (vehicleId, employeeId) => {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  if (vehicle.status !== "available" || vehicle.assignedTo) {
    throw new ApiError(409, "Vehicle is not available for assignment");
  }
  vehicle.assignedTo = employeeId;
  vehicle.status = "rented";
  await vehicle.save();
  return vehicle;
};

const populateAllowance = (q) =>
  q
    .populate("employeeId", "fullName email")
    .populate(
      "vehicleId",
      "vehicleName registrationNumber make model status assignedTo"
    )
    .populate("createdBy", "fullName");

const getAllAllowances = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.query.status) filter.status = req.query.status;

  const search = req.query.search?.trim();
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ allowanceType: re }, { notes: re }];
  }

  const [items, total] = await Promise.all([
    populateAllowance(
      EmployeeAllowance.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
    ).lean(),
    EmployeeAllowance.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(items, total, page, limit),
        "Allowance fetched"
      )
    );
});

const getAllowanceById = asyncHandler(async (req, res) => {
  const doc = await populateAllowance(
    EmployeeAllowance.findById(req.params.id)
  ).lean();
  if (!doc) throw new ApiError(404, "Allowance not found");
  return res.status(200).json(new ApiResponse(200, doc, "Allowance found"));
});

const createAllowance = asyncHandler(async (req, res) => {
  const {
    employeeId,
    allowanceType,
    amount,
    effectiveDate,
    notes,
    status,
    benefitMode,
    vehicleId,
  } = req.body;

  if (!employeeId) throw new ApiError(400, "employeeId is required");
  if (!allowanceType || !ALLOWANCE_TYPES.includes(allowanceType)) {
    throw new ApiError(400, "Valid allowanceType is required");
  }
  if (!effectiveDate) throw new ApiError(400, "effectiveDate is required");

  const isCar = allowanceType === "Car Allowance";
  const mode = isCar
    ? BENEFIT_MODES.includes(benefitMode)
      ? benefitMode
      : "cash"
    : "cash";

  let amt = toNumber(amount);
  let assignedVehicle = null;

  if (mode === "company_car") {
    if (!vehicleId) {
      throw new ApiError(400, "Please select an available company car");
    }
    if (amt === undefined) amt = 0;
    assignedVehicle = await assignVehicleToEmployee(vehicleId, employeeId);
  } else if (amt === undefined) {
    throw new ApiError(400, "amount is required");
  }

  try {
    const initialStatus = status === "inactive" ? "inactive" : "active";
    const doc = await EmployeeAllowance.create({
      employeeId,
      allowanceType,
      benefitMode: mode,
      amount: amt,
      vehicleId: mode === "company_car" ? assignedVehicle._id : null,
      effectiveDate,
      notes: notes || "",
      status: initialStatus,
      statusHistory: [
        {
          fromStatus: "",
          toStatus: initialStatus,
          note: "Allowance added",
          changedAt: new Date(),
          changedBy: req.user?._id,
        },
      ],
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    if (mode === "company_car" && assignedVehicle) {
      await EmployeeCarHistory.create({
        employeeId,
        vehicleId: assignedVehicle._id,
        carName: assignedVehicle.vehicleName,
        registrationNumber: assignedVehicle.registrationNumber || "",
        assignedDate: effectiveDate || new Date(),
        status: "assigned",
        notes: notes || "Assigned via Car Allowance (company car)",
        createdBy: req.user?._id,
        updatedBy: req.user?._id,
      });
    }

    const populated = await populateAllowance(
      EmployeeAllowance.findById(doc._id)
    );
    return res
      .status(201)
      .json(new ApiResponse(201, populated, "Allowance created"));
  } catch (err) {
    if (assignedVehicle) await releaseVehicle(assignedVehicle._id);
    throw err;
  }
});

const updateAllowance = asyncHandler(async (req, res) => {
  const existing = await EmployeeAllowance.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Allowance not found");

  if (req.body.allowanceType !== undefined) {
    if (!ALLOWANCE_TYPES.includes(req.body.allowanceType)) {
      throw new ApiError(400, "Invalid allowanceType");
    }
    existing.allowanceType = req.body.allowanceType;
  }
  if (req.body.amount !== undefined) {
    const amt = toNumber(req.body.amount);
    if (amt === undefined) throw new ApiError(400, "Invalid amount");
    existing.amount = amt;
  }
  if (req.body.effectiveDate !== undefined)
    existing.effectiveDate = req.body.effectiveDate;
  if (req.body.notes !== undefined) existing.notes = req.body.notes;

  if (req.body.status !== undefined) {
    const prevStatus = existing.status;
    const nextStatus = req.body.status;
    if (prevStatus !== nextStatus) {
      existing.status = nextStatus;
      existing.statusHistory = existing.statusHistory || [];
      if (existing.statusHistory.length === 0) {
        existing.statusHistory.push({
          fromStatus: "",
          toStatus: prevStatus,
          note: "Allowance added",
          changedAt: existing.createdAt || new Date(),
          changedBy: existing.createdBy || req.user?._id,
        });
      }
      existing.statusHistory.push({
        fromStatus: prevStatus,
        toStatus: nextStatus,
        note:
          nextStatus === "inactive"
            ? "Allowance deactivated"
            : "Allowance activated",
        changedAt: new Date(),
        changedBy: req.user?._id,
      });
    } else {
      existing.status = nextStatus;
    }

    if (
      nextStatus === "inactive" &&
      existing.benefitMode === "company_car" &&
      existing.vehicleId
    ) {
      await releaseVehicle(existing.vehicleId);
      await EmployeeCarHistory.findOneAndUpdate(
        {
          employeeId: existing.employeeId,
          vehicleId: existing.vehicleId,
          status: "assigned",
        },
        {
          $set: {
            status: "returned",
            returnedDate: new Date(),
            updatedBy: req.user?._id,
          },
        },
        { sort: { createdAt: -1 } }
      );
      existing.vehicleId = null;
    }
  }

  existing.updatedBy = req.user?._id;
  await existing.save();

  const populated = await populateAllowance(
    EmployeeAllowance.findById(existing._id)
  );
  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Allowance updated"));
});

const deleteAllowance = asyncHandler(async (req, res) => {
  const doc = await EmployeeAllowance.findById(req.params.id);
  if (!doc) throw new ApiError(404, "Allowance not found");

  if (doc.benefitMode === "company_car" && doc.vehicleId) {
    await releaseVehicle(doc.vehicleId);
    await EmployeeCarHistory.findOneAndUpdate(
      {
        employeeId: doc.employeeId,
        vehicleId: doc.vehicleId,
        status: "assigned",
      },
      {
        $set: {
          status: "returned",
          returnedDate: new Date(),
          updatedBy: req.user?._id,
        },
      },
      { sort: { createdAt: -1 } }
    );
  }

  await doc.deleteOne();
  return res.status(200).json(new ApiResponse(200, doc, "Allowance deleted"));
});

export {
  getAllAllowances,
  getAllowanceById,
  createAllowance,
  updateAllowance,
  deleteAllowance,
};
