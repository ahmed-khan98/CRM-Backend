import { Sale } from "../models/sale.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createSale = asyncHandler(async (req, res) => {

  const {
    name,
    email,
    phoneNo,
    brandName,
    brandMark,
    serialNo,
    currency,
    amount,
    departmentId,
    agent,
    fronter,
    type,
  } = req.body;

  if (
    [name, email, phoneNo, amount, departmentId, agent,type].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const sale = await Sale.create({
    name,
    email,
    phoneNo,
    brandName,
    brandMark,
    serialNo,
    currency,
    amount,
    departmentId,
    agent,
    fronter,
    type,
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
    name,
    email,
    phoneNo,
    brandName,
    brandMark,
    serialNo,
    currency,
    amount,
    departmentId,
    agent,
    fronter,
    type,
  } = req.body;

  const existSale = await Sale.findById(id);

  if (!existSale) {
    throw new ApiError(409, "Sale not found");
  }

  const SaleData = {
    name,
    email,
    phoneNo,
    brandName,
    brandMark,
    serialNo,
    currency,
    amount,
    departmentId,
    agent,
    fronter,
    type,
  };

  const sale = await Sale.findByIdAndUpdate(
    id,
    {
      $set: SaleData,
    },
    { new: true }
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
  const Sales = await Sale.find()
    .populate("departmentId", "name")
    // .populate("clientId", "name")
    .populate("agent", "fullName")
    .populate("fronter", "fullName");

  if (!Sales) {
    throw new ApiError("404", "Sale not found");
  }

  return res.status(200).json(new ApiResponse(200, Sales, "All Sales found"));
});

const getSaleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findById(id);
  if (!sale) {
    throw new ApiError(404, "Sale not found");
    // return res.status(404).json({ error: 'Sale not found' });
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

const getSaleByDepartId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.find({ departmentId: id });
  if (!sale) {
    throw new ApiError(404, "Sale not found for this department");
    // return res.status(404).json({ error: 'Sale not found' });
  }
  return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
});

// const getSaleByClientId = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   const sale = await Sale.find({ clientId: id });
//   if (!sale) {
//     throw new ApiError(404, "Sale not found for this client");
//     // return res.status(404).json({ error: 'Sale not found' });
//   }
//   return res.status(200).json(new ApiResponse(200, sale, "Sale Found"));
// });

const getSaleByAgentId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.find({ agent: id });
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
  // getSaleByClientId,
  getSaleByAgentId,
};
