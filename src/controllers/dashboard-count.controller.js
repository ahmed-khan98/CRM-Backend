import { Sale } from "../models/sale.model.js";
import { PaymentLink } from "../models/paymentLink.model.js";
import { Lead } from "../models/lead.model.js";
import { Client } from "../models/client.model.js";
import { Attendance } from "../models/attendence.model.js";
import { Employee } from "../models/employee.model.js";
import { Month } from "../models/month.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  ensurePayrollDefaults,
  payCycleRange,
} from "../utils/payrollHelpers.js";
import moment from "moment-timezone";

const TZ = "Asia/Karachi";
const SUPER_ROLES = ["ADMIN", "SUBADMIN", "HR_ADMIN", "FINANCE_ADMIN"];

const getTodayShiftDate = () => {
  const now = moment().tz(TZ);
  return now.hour() < 8
    ? now.clone().subtract(1, "days").format("YYYY-MM-DD")
    : now.format("YYYY-MM-DD");
};

/** Attendance / pay cycle containing `now`: 26 → 25 (cycleEndDay). */
const currentAttendanceCycle = (now, cycleEndDay = 25) => {
  const endDay = Math.min(28, Math.max(1, Number(cycleEndDay) || 25));
  let endYear = now.year();
  let endMonth = now.month() + 1;
  if (now.date() > endDay) {
    const next = now.clone().add(1, "month");
    endYear = next.year();
    endMonth = next.month() + 1;
  }
  return payCycleRange(endYear, endMonth, endDay);
};

const summarizeTeamDailyAttendance = async (req) => {
  const shiftDate = getTodayShiftDate();
  const employees = await Employee.find({
    status: "active",
    role: { $ne: "ADMIN" },
    ...req.roleFilter,
  }).select("_id");

  const records = await Attendance.find({
    employeeId: { $in: employees.map((emp) => emp._id) },
    shiftDate,
  });

  const recordByEmployee = new Map(
    records.map((record) => [record.employeeId.toString(), record]),
  );

  let present = 0;
  let absent = 0;
  let late = 0;

  for (const employee of employees) {
    const record = recordByEmployee.get(employee._id.toString());
    if (!record) {
      absent += 1;
      continue;
    }
    if (record.status === "late") late += 1;
    else if (record.status === "absent") absent += 1;
    else present += 1;
  }

  return {
    mode: "team_daily",
    unit: "employees",
    shiftDate,
    startDate: shiftDate,
    endDate: shiftDate,
    total: employees.length,
    present,
    absent,
    late,
  };
};

const summarizeSelfCycleAttendance = async (req) => {
  const settings = await ensurePayrollDefaults();
  const cycleEndDay = settings?.cycleEndDay || 25;
  const now = moment().tz(TZ);
  const { start, end } = currentAttendanceCycle(now, cycleEndDay);
  const today = getTodayShiftDate();
  const effectiveEnd = today < end ? today : end;

  const records = await Attendance.find({
    employeeId: req.user._id,
    shiftDate: { $gte: start, $lte: effectiveEnd },
  })
    .select("shiftDate status")
    .lean();

  const byDate = new Map(records.map((r) => [r.shiftDate, r.status]));
  let present = 0;
  let absent = 0;
  let late = 0;

  const cursor = moment.tz(start, "YYYY-MM-DD", TZ);
  const last = moment.tz(effectiveEnd, "YYYY-MM-DD", TZ);
  while (cursor.isSameOrBefore(last, "day")) {
    // Weekends are not counted in the attendance month pie
    if (cursor.day() !== 0 && cursor.day() !== 6) {
      const status = byDate.get(cursor.format("YYYY-MM-DD"));
      if (!status || status === "absent") absent += 1;
      else if (status === "late") late += 1;
      else present += 1; // present / half-day / etc.
    }
    cursor.add(1, "day");
  }

  return {
    mode: "self_cycle",
    unit: "days",
    shiftDate: null,
    startDate: start,
    endDate: effectiveEnd,
    cycleEndDay,
    monthLabel: `${moment.tz(start, "YYYY-MM-DD", TZ).format("D MMM")} – ${moment
      .tz(end, "YYYY-MM-DD", TZ)
      .format("D MMM YYYY")}`,
    total: present + absent + late,
    present,
    absent,
    late,
  };
};

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

const getDashboardAttendanceSummary = asyncHandler(async (req, res) => {
  const role = req.user?.role;
  // USER → own attendance for current 26→25 cycle
  // ADMIN / SUBADMIN / DEP_ADMIN / others → today's team attendance (scoped by roleFilter)
  const summary =
    role === "USER"
      ? await summarizeSelfCycleAttendance(req)
      : await summarizeTeamDailyAttendance(req);

  return res.status(200).json(
    new ApiResponse(200, summary, "Dashboard attendance summary"),
  );
});

const getDashboardMonthlySales = asyncHandler(async (req, res) => {
  const now = moment().tz(TZ);
  const role = req.user?.role;
  const openMonth = await Month.findOne({ status: "OPEN" }).lean();

  if (!openMonth) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          month: null,
          monthLabel: null,
          startDate: null,
          endDate: null,
          scope: null,
          daily: [],
        },
        "No open month found",
      ),
    );
  }

  const rangeStart = moment(openMonth.startDate).tz(TZ).startOf("day");
  const rangeEnd = now.clone().endOf("day");
  const effectiveEnd = rangeEnd.isBefore(rangeStart)
    ? rangeStart.clone().endOf("day")
    : rangeEnd;

  // ADMIN/SUBADMIN → all departments; DEP_ADMIN → department; USER → own seller sales
  let saleScope = "company";
  let saleMatch = { monthId: openMonth._id };

  if (role === "USER") {
    saleScope = "self";
    saleMatch.seller = req.user._id;
  } else if (role === "DEP_ADMIN") {
    saleScope = "department";
    saleMatch = { ...saleMatch, ...req.roleFilter };
  } else if (!SUPER_ROLES.includes(role)) {
    saleMatch = { ...saleMatch, ...req.roleFilter };
    saleScope = "department";
  }

  const daily = await Sale.aggregate([
    { $match: saleMatch },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$saleDate",
            timezone: TZ,
          },
        },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const startKey = rangeStart.format("YYYY-MM-DD");
  const endKey = effectiveEnd.format("YYYY-MM-DD");
  const filteredDaily = daily
    .filter((row) => row._id >= startKey && row._id <= endKey)
    .map((row) => ({
      date: row._id,
      amount: row.amount,
    }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        monthId: openMonth._id,
        month: rangeStart.format("YYYY-MM"),
        monthLabel: openMonth.name || rangeStart.format("MMMM YYYY"),
        startDate: startKey,
        endDate: endKey,
        scope: saleScope,
        daily: filteredDaily,
      },
      "Open month daily sales",
    ),
  );
});

export {
  getDashboardCount,
  getDashboardAttendanceSummary,
  getDashboardMonthlySales,
};
