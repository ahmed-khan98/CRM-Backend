import { EmployeeFamily } from "../models/employeeFamily.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parsePagination, paginatedResponse, parseMaybeJson } from "../utils/hrmsHelpers.js";

const getAllFamilies = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;

  const [items, total] = await Promise.all([
    EmployeeFamily.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employeeId", "fullName")
      .lean(),
    EmployeeFamily.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(items, total, page, limit),
        "Family records fetched"
      )
    );
});

const getFamilyById = asyncHandler(async (req, res) => {
  const doc = await EmployeeFamily.findById(req.params.id)
    .populate("employeeId", "fullName")
    .lean();
  if (!doc) throw new ApiError(404, "Family record not found");
  return res.status(200).json(new ApiResponse(200, doc, "Family record found"));
});

const getFamilyByEmployee = asyncHandler(async (req, res) => {
  const doc = await EmployeeFamily.findOne({
    employeeId: req.params.employeeId,
  }).lean();
  return res
    .status(200)
    .json(new ApiResponse(200, doc, "Family record fetched"));
});

const upsertFamily = asyncHandler(async (req, res) => {
  let employeeId = req.body.employeeId || req.params.employeeId;

  if (!employeeId && req.params.id) {
    const existing = await EmployeeFamily.findById(req.params.id);
    if (!existing) throw new ApiError(404, "Family record not found");
    employeeId = existing.employeeId;
  }

  if (!employeeId) throw new ApiError(400, "employeeId is required");

  const spouse = parseMaybeJson(req.body.spouse, req.body.spouse || {});
  const children = parseMaybeJson(req.body.children, req.body.children || []);

  const payload = {
    spouse: spouse || {},
    children: Array.isArray(children) ? children : [],
    fatherName: req.body.fatherName ?? "",
    motherName: req.body.motherName ?? "",
    updatedBy: req.user?._id,
  };

  if (req.body.fatherName === undefined) delete payload.fatherName;
  if (req.body.motherName === undefined) delete payload.motherName;
  if (req.body.spouse === undefined && !req.body.spouse) {
    // keep existing spouse if not sent — only set when provided
  }

  const setPayload = { updatedBy: req.user?._id };
  if (req.body.spouse !== undefined) setPayload.spouse = spouse || {};
  if (req.body.children !== undefined)
    setPayload.children = Array.isArray(children) ? children : [];
  if (req.body.fatherName !== undefined)
    setPayload.fatherName = req.body.fatherName || "";
  if (req.body.motherName !== undefined)
    setPayload.motherName = req.body.motherName || "";

  // Full replace on add/put
  if (req.method === "POST" || req.method === "PUT") {
    Object.assign(setPayload, {
      spouse: spouse || {},
      children: Array.isArray(children) ? children : [],
      fatherName: req.body.fatherName || "",
      motherName: req.body.motherName || "",
    });
  }

  const doc = await EmployeeFamily.findOneAndUpdate(
    { employeeId },
    {
      $set: setPayload,
      $setOnInsert: { employeeId, createdBy: req.user?._id },
    },
    { new: true, upsert: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, doc, "Family record saved"));
});

const deleteFamily = asyncHandler(async (req, res) => {
  const doc = await EmployeeFamily.findByIdAndDelete(req.params.id);
  if (!doc) throw new ApiError(404, "Family record not found");
  return res.status(200).json(new ApiResponse(200, doc, "Family record deleted"));
});

export {
  getAllFamilies,
  getFamilyById,
  getFamilyByEmployee,
  upsertFamily,
  deleteFamily,
};
