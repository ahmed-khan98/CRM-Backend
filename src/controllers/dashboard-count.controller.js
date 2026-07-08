import { Sale } from "../models/sale.model.js";
import { PaymentLink } from "../models/paymentLink.model.js";
import { Lead } from "../models/lead.model.js";
import { Client } from "../models/client.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import moment from "moment-timezone";

const getDashboardCount = asyncHandler(async (req, res) => {
 const now = moment().tz("Asia/Karachi");

  const effectiveDate = now.hour() < 10 
    ? now.clone().subtract(1, "day") 
    : now;

  const startLocal = effectiveDate.clone().hour(10).minute(0).second(0);
  const endLocal = startLocal.clone().add(1, "day");

   const startUTC = startLocal.clone().utc();
  const endUTC = endLocal.clone().utc();
  const saleDateStartUTC = moment.utc(effectiveDate.format("YYYY-MM-DD"));
  const saleDateEndUTC = saleDateStartUTC.clone().add(1, "day");

  const dateFilter = {
    createdAt: {
      $gte: startUTC.toDate(),
      $lt: endUTC.toDate(),
    },
  };

  const saleDateFilter = {
    saleDate: {
      $gte: saleDateStartUTC.toDate(),
      $lt: saleDateEndUTC.toDate(),
    },
  };

  const paymentLinkCount = await PaymentLink.countDocuments({
    paymentStatus: "pending",
    ...dateFilter,
    ...req.roleFilter
  });

  const leadCount = await Lead.countDocuments({
    ...dateFilter,
    ...req.roleFilter
  });
  const clientCount = await Client.countDocuments({
    ...dateFilter,
    ...req.roleFilter
  });

  const sales = await Sale.aggregate([
    { $match: { ...saleDateFilter, ...req.roleFilter } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);

  const saleAmount = sales[0]?.totalAmount || 0;
  
  return res.status(200).json(
    new ApiResponse(
      200,
      { paymentLinkCount, leadCount, clientCount, saleAmount },
      "Today's Dashboard Count"
    )
  );
});

export {getDashboardCount}
