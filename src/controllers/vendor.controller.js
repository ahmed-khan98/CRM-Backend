import { Vendor } from "../models/vendor.model.js";
import { Vehicle } from "../models/vehicle.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d+\-\s()]{7,20}$/;

const toMedia = (uploaded, originalName) => {
  const url = (uploaded?.secure_url || uploaded?.url || "").replace(
    /^http:\/\//i,
    "https://"
  ) || null;
  if (!url) return null;
  return {
    url,
    publicId: uploaded.public_id || "",
    originalName: originalName || "",
  };
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const buildVendorQuery = (query) => {
  const filter = {};
  if (query.status && ["active", "inactive"].includes(query.status)) {
    filter.status = query.status;
  }
  const search = query.search?.trim();
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { companyName: re },
      { vendorName: re },
      { email: re },
      { phone: re },
      { city: re },
      { registrationNumber: re },
    ];
  }
  return filter;
};

const validateVendorPayload = (body, { isUpdate = false } = {}) => {
  const {
    companyName,
    vendorName,
    email,
    phone,
    emergencyPhone,
    status,
  } = body;

  if (!isUpdate) {
    if (!companyName?.trim()) throw new ApiError(400, "Company name is required");
    if (!vendorName?.trim()) throw new ApiError(400, "Vendor name is required");
    if (!email?.trim()) throw new ApiError(400, "Email is required");
    if (!phone?.trim()) throw new ApiError(400, "Phone is required");
  }

  if (email !== undefined && email !== "") {
    if (!EMAIL_RE.test(String(email).trim())) {
      throw new ApiError(400, "Invalid email format");
    }
  }
  if (phone !== undefined && phone !== "") {
    if (!PHONE_RE.test(String(phone).trim())) {
      throw new ApiError(400, "Invalid phone number");
    }
  }
  if (emergencyPhone !== undefined && emergencyPhone !== "") {
    if (!PHONE_RE.test(String(emergencyPhone).trim())) {
      throw new ApiError(400, "Invalid emergency phone number");
    }
  }
  if (status !== undefined && status !== "" && !["active", "inactive"].includes(status)) {
    throw new ApiError(400, "Status must be active or inactive");
  }
};

const getAllVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildVendorQuery(req.query);
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    Vendor.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "fullName email image")
      .lean(),
    Vendor.countDocuments(filter),
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
      "Vendors fetched"
    )
  );
});

const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id)
    .populate("createdBy", "fullName email image")
    .lean();
  if (!vendor) throw new ApiError(404, "Vendor not found");

  const vehicleCount = await Vehicle.countDocuments({ vendor: vendor._id });

  return res.status(200).json(
    new ApiResponse(200, { ...vendor, vehicleCount }, "Vendor fetched")
  );
});

const createVendor = asyncHandler(async (req, res) => {
  validateVendorPayload(req.body);

  const email = req.body.email.trim().toLowerCase();
  const existing = await Vendor.findOne({ email });
  if (existing) throw new ApiError(409, "Email already registered");

  let profilePicture = null;
  if (req.file) {
    const uploaded = await uploadOnCloudinary(req.file);
    profilePicture = toMedia(uploaded, req.file.originalname);
  }

  const vendor = await Vendor.create({
    companyName: req.body.companyName.trim(),
    vendorName: req.body.vendorName.trim(),
    email,
    phone: req.body.phone.trim(),
    emergencyPhone: req.body.emergencyPhone?.trim() || "",
    address: req.body.address?.trim() || "",
    city: req.body.city?.trim() || "",
    state: req.body.state?.trim() || "",
    country: req.body.country?.trim() || "",
    postalCode: req.body.postalCode?.trim() || "",
    taxNumber: req.body.taxNumber?.trim() || "",
    registrationNumber: req.body.registrationNumber?.trim() || "",
    status: req.body.status || "active",
    notes: req.body.notes?.trim() || "",
    profilePicture,
    createdBy: req.user?._id,
  });

  return res.status(201).json(new ApiResponse(201, vendor, "Vendor created"));
});

const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, "Vendor not found");

  validateVendorPayload(req.body, { isUpdate: true });

  if (req.body.email !== undefined) {
    const email = req.body.email.trim().toLowerCase();
    const clash = await Vendor.findOne({ email, _id: { $ne: vendor._id } });
    if (clash) throw new ApiError(409, "Email already registered");
    vendor.email = email;
  }

  const fields = [
    "companyName",
    "vendorName",
    "phone",
    "emergencyPhone",
    "address",
    "city",
    "state",
    "country",
    "postalCode",
    "taxNumber",
    "registrationNumber",
    "status",
    "notes",
  ];
  fields.forEach((key) => {
    if (req.body[key] !== undefined) {
      vendor[key] =
        typeof req.body[key] === "string" ? req.body[key].trim() : req.body[key];
    }
  });

  if (req.file) {
    const uploaded = await uploadOnCloudinary(req.file);
    const media = toMedia(uploaded, req.file.originalname);
    if (media) vendor.profilePicture = media;
  }

  await vendor.save();
  return res.status(200).json(new ApiResponse(200, vendor, "Vendor updated"));
});

const deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findByIdAndDelete(req.params.id);
  if (!vendor) throw new ApiError(404, "Vendor not found");
  return res.status(200).json(new ApiResponse(200, {}, "Vendor deleted"));
});

export {
  getAllVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
};
