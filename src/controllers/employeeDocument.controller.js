import {
  EmployeeDocument,
  DOCUMENT_TYPES,
} from "../models/employeeDocument.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAttachmentOnCloudinary } from "../utils/cloudinary.js";
import { parsePagination, paginatedResponse } from "../utils/hrmsHelpers.js";

const getAllDocuments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.query.documentType) filter.documentType = req.query.documentType;

  const [items, total] = await Promise.all([
    EmployeeDocument.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("uploadedBy", "fullName")
      .lean(),
    EmployeeDocument.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(items, total, page, limit),
        "Documents fetched"
      )
    );
});

const getDocumentById = asyncHandler(async (req, res) => {
  const doc = await EmployeeDocument.findById(req.params.id)
    .populate("uploadedBy", "fullName")
    .lean();
  if (!doc) throw new ApiError(404, "Document not found");
  return res.status(200).json(new ApiResponse(200, doc, "Document found"));
});

const createDocument = asyncHandler(async (req, res) => {
  const { employeeId, documentType, notes } = req.body;
  if (!employeeId) throw new ApiError(400, "employeeId is required");
  if (!documentType || !DOCUMENT_TYPES.includes(documentType)) {
    throw new ApiError(400, "Valid documentType is required");
  }
  if (!req.file) throw new ApiError(400, "File is required");

  const uploaded = await uploadAttachmentOnCloudinary(req.file);
  if (!uploaded?.url && !uploaded?.secure_url) {
    throw new ApiError(400, "File upload failed");
  }

  const doc = await EmployeeDocument.create({
    employeeId,
    documentType,
    fileUrl: uploaded.secure_url || uploaded.url,
    fileName: req.file.originalname || "",
    mimeType: req.file.mimetype || "",
    publicId: uploaded.public_id || "",
    notes: notes || "",
    uploadedBy: req.user?._id,
    createdBy: req.user?._id,
    updatedBy: req.user?._id,
  });

  return res.status(201).json(new ApiResponse(201, doc, "Document uploaded"));
});

const updateDocument = asyncHandler(async (req, res) => {
  const existing = await EmployeeDocument.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Document not found");

  if (req.body.documentType) {
    if (!DOCUMENT_TYPES.includes(req.body.documentType)) {
      throw new ApiError(400, "Invalid documentType");
    }
    existing.documentType = req.body.documentType;
  }
  if (req.body.notes !== undefined) existing.notes = req.body.notes;

  if (req.file) {
    const uploaded = await uploadAttachmentOnCloudinary(req.file);
    if (!uploaded?.url && !uploaded?.secure_url) {
      throw new ApiError(400, "File upload failed");
    }
    existing.fileUrl = uploaded.secure_url || uploaded.url;
    existing.fileName = req.file.originalname || existing.fileName;
    existing.mimeType = req.file.mimetype || existing.mimeType;
    existing.publicId = uploaded.public_id || existing.publicId;
    existing.uploadDate = new Date();
  }

  existing.updatedBy = req.user?._id;
  await existing.save();

  return res.status(200).json(new ApiResponse(200, existing, "Document updated"));
});

const deleteDocument = asyncHandler(async (req, res) => {
  const doc = await EmployeeDocument.findByIdAndDelete(req.params.id);
  if (!doc) throw new ApiError(404, "Document not found");
  return res.status(200).json(new ApiResponse(200, doc, "Document deleted"));
});

export {
  getAllDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
};
