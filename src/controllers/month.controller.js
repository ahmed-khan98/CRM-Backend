import { Month } from "../models/month.model.js";
import { Sale } from "../models/sale.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateMonthCodeFromName } from "../utils/month/index.js";

const createMonth = asyncHandler(async (req, res) => {
  const { name, startDate, endDate } = req.body;

  if (!name || !startDate) {
    throw new ApiError(400, "Name and startDate required");
  }

  let monthCode;

  try {
    monthCode = generateMonthCodeFromName(name);
  } catch (err) {
    throw new ApiError(400, err.message);
  }

  const exist = await Month.findOne({ monthCode });
  if (exist) {
    throw new ApiError(400, "Month already exists");
  }

  const existing = await Month.findOne({ status: "OPEN" });

  if (existing) {
    throw new ApiError(400, "Another month is already open");
  }

  const month = await Month.create({
    name,
    startDate,
    endDate,
    monthCode,
    createdBy: req.user._id,
  });

  res.status(200).json(new ApiResponse(200, month, "Month created"));
});

const closeMonth = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const month = await Month.findById(id);

  if (!month) throw new ApiError(404, "Month not found");

  if (month.status === "CLOSED") {
    throw new ApiError(400, "Month already closed");
  }

  month.status = "CLOSED";
  month.updatedBy = req.user._id;
  month.endDate = new Date();

  await month.save();

  res.status(200).json(new ApiResponse(200, month, "Month closed"));
});

const getAllMonths = asyncHandler(async (req, res) => {
  const months = await Month.find().populate("createdBy", "fullName").populate("updatedBy", "fullName").sort({ createdAt: -1 }).lean();

  const result = await Promise.all(
    months.map(async (month) => {
      const sales = await Sale.aggregate([
        {
          $match: {
            monthId: month._id,
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            totalSales: { $sum: 1 },
          },
        },
      ]);

      return {
        ...month,
        totalAmount: sales[0]?.totalAmount || 0,
        totalSales: sales[0]?.totalSales || 0,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(200, result, "Months fetched successfully")
  );
});

const deleteMonth = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existMonth = await Month.findById(id);

  if (!existMonth) {
    throw new ApiError(409, "Month not found");
  }

  const month = await Month.findByIdAndDelete(id);

  if (!month) {
    throw new ApiError("500", "internal server error");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, month, "Month deleted Successfully"),
    );
});


export {
    createMonth,
    closeMonth,
    getAllMonths,
    deleteMonth
}