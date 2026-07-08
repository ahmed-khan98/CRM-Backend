import { Month } from "../models/month.model.js";
import { Sale } from "../models/sale.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";

const toObjectId = (id, fieldName) => {
  if (!id) return null;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(id);
};

const buildSaleQuery = (req, baseQuery = {}) => {
  const {
    monthId,
    departmentId,
    seller,
    agent,
    employeeId,
    status,
    type,
    merchantType,
    startDate,
    endDate,
  } = req.query;

  const query = { ...baseQuery };
  const andFilters = [];

  if (req.roleFilter?.departmentId) {
    if (
      query.departmentId &&
      query.departmentId.toString() !== req.roleFilter.departmentId.toString()
    ) {
      query._id = null;
    }

    query.departmentId = req.roleFilter.departmentId;
  } else if (req.roleFilter) {
    const { $or, ...restRoleFilter } = req.roleFilter;
    Object.assign(query, restRoleFilter);
  }

  if (req.roleFilter?.$or) {
    andFilters.push({ $or: req.roleFilter.$or });
  }

  if (req.user?.role === "USER") {
    andFilters.push({
      $or: [{ seller: req.user._id }, { agent: req.user._id }],
    });
  }

  if (monthId) query.monthId = toObjectId(monthId, "monthId");

  if (departmentId && !req.roleFilter?.departmentId) {
    query.departmentId = toObjectId(departmentId, "departmentId");
  }

  if (seller) query.seller = toObjectId(seller, "seller");
  if (agent) query.agent = toObjectId(agent, "agent");

  if (employeeId) {
    const employeeObjectId = toObjectId(employeeId, "employeeId");
    andFilters.push({
      $or: [{ seller: employeeObjectId }, { agent: employeeObjectId }],
    });
  }

  if (status) query.status = status;
  if (type) query.type = type;
  if (merchantType) query.merchantType = merchantType;

  if (startDate || endDate) {
    query.saleDate = {};
    if (startDate) query.saleDate.$gte = new Date(startDate);
    if (endDate) query.saleDate.$lte = new Date(endDate);
  }

  if (andFilters.length) {
    query.$and = [...(query.$and || []), ...andFilters];
  }

  return query;
};

const populateSale = (query) =>
  query
    .populate("departmentId", "name")
    .populate("brandId", "name")
    .populate("clientId", "name email companyName")
    .populate("monthId", "monthCode name status startDate endDate")
    .populate("agent", "fullName departmentId")
    .populate("seller", "fullName departmentId");

const createSale = asyncHandler(async (req, res) => {
  const {
    currency,
    amount,
    departmentId,
    clientId,
    brandId,
    merchantType,
    agent,
    seller,
    type,
    saleDate,
    description,
  } = req.body;
  const saleDepartmentId =
    req.user?.role === "DEP_ADMIN" ? req.user.departmentId : departmentId;

  if (
    [amount, saleDepartmentId, seller, type, saleDate, clientId, merchantType].some(
      (field) => field === undefined || field === "",
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existingMonth = await Month.findOne({ status: "OPEN" });
  if (!existingMonth) {
    throw new ApiError(
      400,
      "No open month found. Please open a month before creating a sale.",
    );
  }

  const sale = await Sale.create({
    currency,
    amount,
    departmentId: saleDepartmentId,
    clientId,
    brandId,
    seller,
    type,
    saleDate,
    merchantType,
    description,
    monthId: existingMonth._id,
    createdBy:res?.user?._id,
    ...(agent && { agent }),
  });

  if (!sale) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, sale, "Sale Created Successfully"));
});

const updateSale = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const {
    currency,
    amount,
    departmentId,
    clientId,
    brandId,
    agent,
    seller,
    merchantType,
    type,
    saleDate,
    description,
  } = req.body;

  const existSale = await Sale.findOne({
    _id: toObjectId(id, "saleId"),
    ...req.roleFilter,
  });

  if (!existSale) {
    throw new ApiError(409, "Sale not found");
  }

  const SaleData = {
    currency,
    amount,
    departmentId:
      req.user?.role === "DEP_ADMIN" ? req.user.departmentId : departmentId,
    clientId,
    brandId,
    seller,
    type,
    saleDate,
    merchantType,
    updatedBy:res?.user?._id,
    ...(agent && { agent }),
    ...(description && { description }),
  };

  const sale = await Sale.findByIdAndUpdate(
    id,
    {
      $set: SaleData,
    },
    { new: true },
  );

  if (!sale) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, sale, "Sale updated Successfully"));
});

const deleteSale = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existSale = await Sale.findById(id);

  if (!existSale) {
    throw new ApiError(409, "Sale not found");
  }
  const sale = await Sale.findByIdAndDelete(id);

  if (!sale) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, sale, "Sale deleted Successfully"));
});

const getAllSales = asyncHandler(async (req, res) => {
  const Sales = await populateSale(Sale.find(buildSaleQuery(req))).sort({
    saleDate: -1,
  });

  if (!Sales) {
    throw new ApiError("404", "Sale not found");
  }

  return res.status(200).json(new ApiResponse(200, Sales, "All Sales found"));
});

const getSaleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await populateSale(
    Sale.findOne({
      _id: toObjectId(id, "saleId"),
      ...req.roleFilter,
    }),
  );
  if (!sale) {
    throw new ApiError(404, "Sale not found");
    // return res.status(404).json({ error: 'Sale not found' });
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

const getSaleByDepartId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await populateSale(
    Sale.find(
      buildSaleQuery(req, {
        departmentId: toObjectId(id, "departmentId"),
      }),
    ),
  ).sort({ createdAt: -1 });
  if (!sale) {
    throw new ApiError(404, "Sale not found for this department");
    // return res.status(404).json({ error: 'Sale not found' });
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

const getSaleByMonthId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await populateSale(
    Sale.find(
      buildSaleQuery(req, {
        monthId: toObjectId(id, "monthId"),
      }),
    ),
  ).sort({ createdAt: -1 });

  if (!sale) {
    throw new ApiError(404, "Sale not found for this month");
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

const getSaleBySellerId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeeObjectId = toObjectId(id, "employeeId");
  const sale = await populateSale(
    Sale.find(
      buildSaleQuery(req, {
        $or: [{ seller: employeeObjectId }, { agent: employeeObjectId }],
      }),
    ),
  ).sort({ createdAt: -1 });
  if (!sale) {
    throw new ApiError(404, "Sale not found for this agent");
    // return res.status(404).json({ error: 'Sale not found' });
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

export {
  createSale,
  getAllSales,
  updateSale,
  deleteSale,
  getSaleById,
  getSaleByDepartId,
  getSaleByMonthId,
  getSaleBySellerId,
};
