import mongoose from "mongoose";
import { Vehicle } from "../models/vehicle.model.js";
import { Vendor } from "../models/vendor.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const toMedia = (uploaded, originalName) => {
  const url = uploaded?.url || uploaded?.secure_url;
  if (!url) return null;
  return {
    url,
    publicId: uploaded.public_id || "",
    originalName: originalName || "",
  };
};

const uploadFiles = async (files = []) => {
  const results = [];
  for (const file of files) {
    const uploaded = await uploadOnCloudinary(file);
    const media = toMedia(uploaded, file.originalname);
    if (media) results.push(media);
  }
  return results;
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const populateVehicle = (query) =>
  query
    .populate("vendor", "companyName vendorName email phone status profilePicture")
    .populate("createdBy", "fullName email image")
    .populate("assignedTo", "fullName email image designation")
    .populate("mileageHistory.createdBy", "fullName")
    .populate("maintenanceHistory.createdBy", "fullName");

const buildVehicleQuery = (query) => {
  const filter = {};
  if (query.status && ["available", "rented", "maintenance", "inactive"].includes(query.status)) {
    filter.status = query.status;
  }
  if (query.vendor && mongoose.Types.ObjectId.isValid(query.vendor)) {
    filter.vendor = query.vendor;
  }
  const search = query.search?.trim();
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { vehicleName: re },
      { make: re },
      { model: re },
      { registrationNumber: re },
      { chassisNumber: re },
      { engineNumber: re },
      { color: re },
    ];
  }
  return filter;
};

const getAllVehicles = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildVehicleQuery(req.query);
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    populateVehicle(
      Vehicle.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
    ).lean(),
    Vehicle.countDocuments(filter),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        items,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Vehicles fetched"
    )
  );
});

/** Unassigned fleet cars for HR car-allowance assignment */
const getAvailableVehicles = asyncHandler(async (_req, res) => {
  const items = await populateVehicle(
    Vehicle.find({
      status: "available",
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
    }).sort({ vehicleName: 1 })
  ).lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { items }, "Available vehicles fetched"));
});

const getVehicleById = asyncHandler(async (req, res) => {
  const vehicle = await populateVehicle(Vehicle.findById(req.params.id)).lean();
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  return res.status(200).json(new ApiResponse(200, vehicle, "Vehicle fetched"));
});

const createVehicle = asyncHandler(async (req, res) => {
  const {
    vendor,
    vehicleName,
    make,
    model,
    year,
    rentAmount,
    registrationNumber,
    chassisNumber,
    engineNumber,
    color,
    fuelType,
    transmission,
    seatingCapacity,
    mileage,
    status,
    notes,
  } = req.body;

  if (!vendor || !mongoose.Types.ObjectId.isValid(vendor)) {
    throw new ApiError(400, "Valid vendor is required");
  }
  if (!vehicleName?.trim()) throw new ApiError(400, "Vehicle name is required");
  if (!registrationNumber?.trim()) {
    throw new ApiError(400, "Registration number is required");
  }

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw new ApiError(404, "Vendor not found");

  const reg = registrationNumber.trim().toUpperCase();
  const existing = await Vehicle.findOne({ registrationNumber: reg });
  if (existing) throw new ApiError(409, "Registration number already exists");

  const imageFiles = req.files?.images || [];
  const videoFiles = req.files?.videos || [];
  const [images, videos] = await Promise.all([
    uploadFiles(imageFiles),
    uploadFiles(videoFiles),
  ]);

  const initialMileage = Number(mileage) || 0;
  const vehicle = await Vehicle.create({
    vendor,
    vehicleName: vehicleName.trim(),
    make: make?.trim() || "",
    model: model?.trim() || "",
    year: year ? Number(year) : undefined,
    rentAmount: rentAmount !== undefined ? Number(rentAmount) : 0,
    registrationNumber: reg,
    chassisNumber: chassisNumber?.trim() || "",
    engineNumber: engineNumber?.trim() || "",
    color: color?.trim() || "",
    fuelType: fuelType || "",
    transmission: transmission || "",
    seatingCapacity: seatingCapacity ? Number(seatingCapacity) : undefined,
    mileage: initialMileage,
    images,
    videos,
    status: status || "available",
    notes: notes?.trim() || "",
    createdBy: req.user?._id,
    mileageHistory:
      initialMileage > 0
        ? [
            {
              date: new Date(),
              mileage: initialMileage,
              notes: "Initial mileage",
              createdBy: req.user?._id,
            },
          ]
        : [],
  });

  const populated = await populateVehicle(Vehicle.findById(vehicle._id));
  return res.status(201).json(new ApiResponse(201, populated, "Vehicle created"));
});

const updateVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");

  if (req.body.vendor !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(req.body.vendor)) {
      throw new ApiError(400, "Invalid vendor id");
    }
    const vendorDoc = await Vendor.findById(req.body.vendor);
    if (!vendorDoc) throw new ApiError(404, "Vendor not found");
    vehicle.vendor = req.body.vendor;
  }

  if (req.body.registrationNumber !== undefined) {
    const reg = req.body.registrationNumber.trim().toUpperCase();
    const clash = await Vehicle.findOne({
      registrationNumber: reg,
      _id: { $ne: vehicle._id },
    });
    if (clash) throw new ApiError(409, "Registration number already exists");
    vehicle.registrationNumber = reg;
  }

  const stringFields = [
    "vehicleName",
    "make",
    "model",
    "chassisNumber",
    "engineNumber",
    "color",
    "fuelType",
    "transmission",
    "status",
    "notes",
  ];
  stringFields.forEach((key) => {
    if (req.body[key] !== undefined) {
      vehicle[key] =
        typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
    }
  });

  if (req.body.year !== undefined) vehicle.year = Number(req.body.year) || undefined;
  if (req.body.rentAmount !== undefined) vehicle.rentAmount = Number(req.body.rentAmount) || 0;
  if (req.body.seatingCapacity !== undefined) {
    vehicle.seatingCapacity = Number(req.body.seatingCapacity) || undefined;
  }
  if (req.body.mileage !== undefined && !req.body.skipMileageBump) {
    // Direct mileage field update without history — prefer /mileage endpoint
    const next = Number(req.body.mileage);
    if (!Number.isNaN(next)) vehicle.mileage = next;
  }

  const imageFiles = req.files?.images || [];
  const videoFiles = req.files?.videos || [];
  if (imageFiles.length) {
    const images = await uploadFiles(imageFiles);
    vehicle.images = [...(vehicle.images || []), ...images];
  }
  if (videoFiles.length) {
    const videos = await uploadFiles(videoFiles);
    vehicle.videos = [...(vehicle.videos || []), ...videos];
  }

  await vehicle.save();
  const populated = await populateVehicle(Vehicle.findById(vehicle._id));
  return res.status(200).json(new ApiResponse(200, populated, "Vehicle updated"));
});

const deleteVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  return res.status(200).json(new ApiResponse(200, {}, "Vehicle deleted"));
});

const addMileage = asyncHandler(async (req, res) => {
  const { date, mileage, notes } = req.body;
  if (mileage === undefined || mileage === "") {
    throw new ApiError(400, "Mileage is required");
  }
  const value = Number(mileage);
  if (Number.isNaN(value) || value < 0) {
    throw new ApiError(400, "Invalid mileage value");
  }

  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");

  if (value < (vehicle.mileage || 0)) {
    throw new ApiError(
      400,
      `Mileage cannot be less than current reading (${vehicle.mileage})`
    );
  }

  vehicle.mileageHistory.push({
    date: date ? new Date(date) : new Date(),
    mileage: value,
    notes: notes?.trim() || "",
    createdBy: req.user?._id,
  });
  vehicle.mileage = value;
  await vehicle.save();

  const populated = await populateVehicle(Vehicle.findById(vehicle._id));
  return res.status(201).json(new ApiResponse(201, populated, "Mileage logged"));
});

const addMaintenance = asyncHandler(async (req, res) => {
  const { date, mileage, notes, setStatus } = req.body;
  if (!date) throw new ApiError(400, "Maintenance date is required");
  if (mileage === undefined || mileage === "") {
    throw new ApiError(400, "Mileage at maintenance is required");
  }
  const value = Number(mileage);
  if (Number.isNaN(value) || value < 0) {
    throw new ApiError(400, "Invalid mileage value");
  }

  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new ApiError(404, "Vehicle not found");

  vehicle.maintenanceHistory.push({
    date: new Date(date),
    mileage: value,
    notes: notes?.trim() || "",
    createdBy: req.user?._id,
  });

  if (setStatus === true || setStatus === "true") {
    vehicle.status = "maintenance";
  }
  if (value > (vehicle.mileage || 0)) {
    vehicle.mileage = value;
  }

  await vehicle.save();
  const populated = await populateVehicle(Vehicle.findById(vehicle._id));
  return res
    .status(201)
    .json(new ApiResponse(201, populated, "Maintenance logged"));
});

export {
  getAllVehicles,
  getAvailableVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  addMileage,
  addMaintenance,
};
