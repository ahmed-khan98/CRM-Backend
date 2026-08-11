import { ApiError } from "./ApiError.js";
import { ApiResponse } from "./ApiResponse.js";
import { asyncHandler } from "./asyncHandler.js";
import { parsePagination, paginatedResponse } from "./hrmsHelpers.js";

/**
 * Build standard employee-scoped CRUD handlers for a Mongoose model.
 * History models: set allowHardDelete=false to soft-reject deletes.
 */
export function createEmployeeScopedCrud({
  Model,
  resourceName,
  buildCreatePayload,
  buildUpdatePayload,
  searchFields = [],
  allowHardDelete = true,
  populate = [],
}) {
  const getAll = asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.status) filter.status = req.query.status;

    const search = req.query.search?.trim();
    if (search && searchFields.length) {
      const re = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      filter.$or = searchFields.map((f) => ({ [f]: re }));
    }

    let query = Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    for (const p of populate) {
      query = query.populate(p);
    }

    const [items, total] = await Promise.all([
      query.lean(),
      Model.countDocuments(filter),
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          paginatedResponse(items, total, page, limit),
          `${resourceName} fetched`
        )
      );
  });

  const getOne = asyncHandler(async (req, res) => {
    let query = Model.findById(req.params.id);
    for (const p of populate) {
      query = query.populate(p);
    }
    const doc = await query.lean();
    if (!doc) throw new ApiError(404, `${resourceName} not found`);
    return res
      .status(200)
      .json(new ApiResponse(200, doc, `${resourceName} found`));
  });

  const create = asyncHandler(async (req, res) => {
    const payload = await buildCreatePayload(req);
    const doc = await Model.create({
      ...payload,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    return res
      .status(201)
      .json(new ApiResponse(201, doc, `${resourceName} created`));
  });

  const update = asyncHandler(async (req, res) => {
    const existing = await Model.findById(req.params.id);
    if (!existing) throw new ApiError(404, `${resourceName} not found`);
    const payload = await buildUpdatePayload(req, existing);
    Object.assign(existing, payload, { updatedBy: req.user?._id });
    await existing.save();
    return res
      .status(200)
      .json(new ApiResponse(200, existing, `${resourceName} updated`));
  });

  const remove = asyncHandler(async (req, res) => {
    if (!allowHardDelete) {
      throw new ApiError(
        403,
        `${resourceName} history records cannot be deleted`
      );
    }
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) throw new ApiError(404, `${resourceName} not found`);
    return res
      .status(200)
      .json(new ApiResponse(200, doc, `${resourceName} deleted`));
  });

  return { getAll, getOne, create, update, remove };
}
