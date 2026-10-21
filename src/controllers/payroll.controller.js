import { PayrollRun } from "../models/payrollRun.model.js";
import { PayrollEntry } from "../models/payrollEntry.model.js";
import { DeductionType } from "../models/deductionType.model.js";
import { PayrollSettings } from "../models/payrollSettings.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendEmail } from "../utils/email.js";
import {
  ensurePayrollDefaults,
  getDeductionMap,
  scopedPayrollEmployees,
  snapshotSalary,
  attendanceBreakdown,
  computeEntryPay,
  applyEntryTotals,
  recalcTotals,
  maskAccount,
  payCycleRange,
  isEligibleForPayCycle,
  prorateSalary,
} from "../utils/payrollHelpers.js";
import { resolveDesignationForPayrollMonth } from "../utils/designationHistory.js";

const MANAGE_ROLES = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

/** Attach month-accurate designation from history (for viewing past payslips). */
async function withPeriodDesignation(entry) {
  if (!entry) return entry;
  const plain = typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
  const run = plain.payrollRunId;
  const month = Number(run?.month);
  const year = Number(run?.year);
  const empId = plain.employeeId?._id || plain.employeeId;
  if (!empId || !month || !year) return plain;
  const designation = await resolveDesignationForPayrollMonth(
    empId,
    year,
    month,
    run?.cycleEndDay || 25,
    plain.designation || plain.employeeId?.designation || ""
  );
  return { ...plain, designation };
}

async function withPeriodDesignations(entries) {
  return Promise.all((entries || []).map((e) => withPeriodDesignation(e)));
}

const canManageRole = (role) => MANAGE_ROLES.includes(role);

const canManage = async (req) => {
  if (canManageRole(req.user?.role)) return true;
  const { userHasHrAdminAccess } = await import("../utils/hrAccess.js");
  return userHasHrAdminAccess(req.user);
};

const assertManage = async (req) => {
  if (!(await canManage(req))) {
    throw new ApiError(403, "You are not authorized for this action");
  }
};

const assertEntryScope = async (req, entry) => {
  if ((await canManage(req)) || req.user?.role === "FINANCE_ADMIN") return;
  if (req.user?.role === "DEP_ADMIN") {
    const emp = entry.employeeId;
    const dept = emp?.departmentId?._id || emp?.departmentId;
    if (String(dept) !== String(req.user.departmentId)) {
      throw new ApiError(403, "You can only view your department payroll");
    }
    return;
  }
  if (String(entry.employeeId?._id || entry.employeeId) !== String(req.user._id)) {
    throw new ApiError(403, "You can only view your own payslip");
  }
};

const populateEntry = (q) =>
  q.populate({
    path: "employeeId",
    select: "fullName designation departmentId email image",
    populate: { path: "departmentId", select: "name" },
  });

const getSettings = asyncHandler(async (req, res) => {
  const settings = await ensurePayrollDefaults();
  const types = await DeductionType.find().sort({ name: 1 }).lean();
  return res
    .status(200)
    .json(new ApiResponse(200, { settings, types }, "Payroll settings fetched"));
});

const updateSettings = asyncHandler(async (req, res) => {
  await assertManage(req);
  const settings = await ensurePayrollDefaults();
  if (req.body.companyName !== undefined) settings.companyName = req.body.companyName;
  if (req.body.payDay !== undefined) settings.payDay = Number(req.body.payDay) || 1;
  if (req.body.defaultBankName !== undefined) settings.defaultBankName = req.body.defaultBankName;
  if (Array.isArray(req.body.taxSlabs)) settings.taxSlabs = req.body.taxSlabs;
  if (req.body.lateLatesPerDay !== undefined) {
    settings.lateLatesPerDay = Math.max(1, Number(req.body.lateLatesPerDay) || 2);
  }
  if (req.body.cycleEndDay !== undefined) {
    settings.cycleEndDay = Math.min(28, Math.max(1, Number(req.body.cycleEndDay) || 25));
  }
  await settings.save();
  return res.status(200).json(new ApiResponse(200, settings, "Payroll settings updated"));
});

const createDeductionType = asyncHandler(async (req, res) => {
  await assertManage(req);
  const { name, code, calcType, defaultAmount } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Name is required");
  const doc = await DeductionType.create({
    name: name.trim(),
    code: code || "other",
    calcType: calcType || "fixed",
    defaultAmount: Number(defaultAmount) || 0,
    isActive: req.body.isActive !== false && req.body.isActive !== "false",
  });
  return res.status(201).json(new ApiResponse(201, doc, "Deduction type created"));
});

const updateDeductionType = asyncHandler(async (req, res) => {
  await assertManage(req);
  const doc = await DeductionType.findById(req.params.id);
  if (!doc) throw new ApiError(404, "Deduction type not found");
  ["name", "code", "calcType", "defaultAmount", "isActive"].forEach((k) => {
    if (req.body[k] === undefined) return;
    if (k === "defaultAmount") doc[k] = Number(req.body[k]) || 0;
    else if (k === "isActive") doc[k] = req.body[k] === true || req.body[k] === "true";
    else doc[k] = req.body[k];
  });
  await doc.save();
  return res.status(200).json(new ApiResponse(200, doc, "Deduction type updated"));
});

const deleteDeductionType = asyncHandler(async (req, res) => {
  await assertManage(req);
  const doc = await DeductionType.findByIdAndDelete(req.params.id);
  if (!doc) throw new ApiError(404, "Deduction type not found");
  return res.status(200).json(new ApiResponse(200, doc, "Deduction type deleted"));
});

const getRun = asyncHandler(async (req, res) => {
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();
  const run = await PayrollRun.findOne({ month, year }).lean();
  if (!run) {
    return res.status(200).json(
      new ApiResponse(200, { run: null, entries: [], stats: {} }, "No payroll run for this month")
    );
  }

  const filter = { payrollRunId: run._id };
  if (req.user?.role === "DEP_ADMIN") {
    const employees = await scopedPayrollEmployees(req);
    filter.employeeId = { $in: employees.map((e) => e._id) };
  }

  const entries = await populateEntry(PayrollEntry.find(filter).sort({ employeeName: 1 }));
  const enriched = await withPeriodDesignations(
    (entries || []).map((e) => {
      const plain = typeof e.toObject === "function" ? e.toObject() : e;
      return { ...plain, payrollRunId: run };
    })
  );
  return res.status(200).json(
    new ApiResponse(200, { run, entries: enriched, stats: run.totals }, "Payroll run fetched")
  );
});

const generatePayroll = asyncHandler(async (req, res) => {
  await assertManage(req);
  const month = Number(req.body.month);
  const year = Number(req.body.year);
  if (!month || !year) throw new ApiError(400, "Month and year are required");

  let run = await PayrollRun.findOne({ month, year });
  if (run && ["finalized", "paid"].includes(run.status)) {
    throw new ApiError(400, "This payroll is locked. Create a new month to generate again.");
  }

  const settings = await ensurePayrollDefaults();
  const { map: deductionMap, types: deductionTypes } = await getDeductionMap();
  const employees = await scopedPayrollEmployees({ roleFilter: {} });
  const cycleEndDay = settings.cycleEndDay || 25;
  const period = payCycleRange(year, month, cycleEndDay);

  if (!run) {
    run = await PayrollRun.create({
      month,
      year,
      status: "processing",
      generatedBy: req.user._id,
      periodStart: period.start,
      periodEnd: period.end,
      cycleEndDay,
    });
  } else {
    run.status = "processing";
    run.periodStart = period.start;
    run.periodEnd = period.end;
    run.cycleEndDay = cycleEndDay;
    await run.save();
    await PayrollEntry.deleteMany({ payrollRunId: run._id });
  }

  const created = [];
  for (const emp of employees) {
    // Joined after this pay cycle ends → no salary this month
    if (!isEligibleForPayCycle(emp.joiningDate, period.end)) continue;

    const fullSalary = await snapshotSalary(emp);
    if (!fullSalary.basicSalary && !fullSalary.allowancesTotal) continue;

    const attendance = await attendanceBreakdown(
      emp._id,
      year,
      month,
      cycleEndDay,
      emp.departmentId?._id || emp.departmentId
    );
    // No payable weekdays on/after joining date within the cycle
    if ((attendance.payableDays ?? 0) <= 0) continue;

    const salary = prorateSalary(
      fullSalary,
      attendance.payableDays,
      attendance.workingDays
    );
    const missingBank = !emp.accountNumber;
    const pay = computeEntryPay({
      salary,
      attendance,
      extraDeductions: [],
      deductionMap,
      deductionTypes,
      slabs: settings.taxSlabs,
      missingBank,
      lateLatesPerDay: settings.lateLatesPerDay || 2,
      fullGrossPay: fullSalary.grossPay,
    });

    const periodDesignation = await resolveDesignationForPayrollMonth(
      emp._id,
      year,
      month,
      cycleEndDay,
      emp.designation || ""
    );

    created.push({
      payrollRunId: run._id,
      employeeId: emp._id,
      employeeName: emp.fullName,
      designation: periodDesignation,
      departmentName: emp.departmentId?.name || "",
      email: emp.email || "",
      basicSalary: salary.basicSalary,
      allowances: salary.allowances,
      allowancesTotal: salary.allowancesTotal,
      extraDeductions: pay.extraDeductions || [],
      missingBank,
      bankMasked: maskAccount(emp.accountNumber),
      bankName: emp.bankName || settings.defaultBankName || "",
      ...pay,
    });
  }

  if (created.length) await PayrollEntry.insertMany(created);
  run.totals = recalcTotals(created);
  run.status = "draft";
  run.generatedAt = new Date();
  run.generatedBy = req.user._id;
  await run.save();

  const entries = await populateEntry(PayrollEntry.find({ payrollRunId: run._id }).sort({ employeeName: 1 }));
  return res
    .status(200)
    .json(new ApiResponse(200, { run, entries, stats: run.totals }, "Payroll generated"));
});

const refreshRunTotals = async (runId) => {
  const entries = await PayrollEntry.find({ payrollRunId: runId }).lean();
  const totals = recalcTotals(entries);
  await PayrollRun.findByIdAndUpdate(runId, { totals });
  return totals;
};

const finalizeRun = asyncHandler(async (req, res) => {
  await assertManage(req);
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw new ApiError(404, "Payroll run not found");
  if (run.status === "paid") throw new ApiError(400, "Payroll is already paid");
  const ids = req.body.entryIds;
  const filter = { payrollRunId: run._id };
  if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };

  await PayrollEntry.updateMany(filter, { status: "finalized" });
  const remaining = await PayrollEntry.countDocuments({
    payrollRunId: run._id,
    status: { $in: ["draft", "review"] },
  });
  if (!remaining) {
    run.status = "finalized";
    run.finalizedAt = new Date();
    await run.save();
  }
  await refreshRunTotals(run._id);
  const fresh = await PayrollRun.findById(run._id).lean();
  const entries = await populateEntry(PayrollEntry.find({ payrollRunId: run._id }).sort({ employeeName: 1 }));
  return res.status(200).json(new ApiResponse(200, { run: fresh, entries }, "Payroll finalized"));
});

const markPaid = asyncHandler(async (req, res) => {
  await assertManage(req);
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw new ApiError(404, "Payroll run not found");
  if (run.status !== "finalized") throw new ApiError(400, "Finalize payroll before marking paid");
  run.status = "paid";
  run.paidAt = new Date();
  await run.save();
  await PayrollEntry.updateMany({ payrollRunId: run._id }, { status: "paid" });
  const entries = await populateEntry(PayrollEntry.find({ payrollRunId: run._id }).sort({ employeeName: 1 }));
  return res.status(200).json(new ApiResponse(200, { run, entries }, "Payroll marked as paid"));
});

/** ADMIN only — unlock finalized payroll (not allowed once paid). */
const unlockRun = asyncHandler(async (req, res) => {
  if (req.user?.role !== "ADMIN") {
    throw new ApiError(403, "Only ADMIN can unlock payroll");
  }
  const run = await PayrollRun.findById(req.params.id);
  if (!run) throw new ApiError(404, "Payroll run not found");
  if (run.status === "paid") {
    throw new ApiError(400, "Paid payroll cannot be unlocked");
  }
  if (run.status !== "finalized") {
    throw new ApiError(400, "Only finalized payroll can be unlocked");
  }

  run.status = "draft";
  run.finalizedAt = null;
  await run.save();

  const entries = await PayrollEntry.find({ payrollRunId: run._id });
  for (const entry of entries) {
    if (entry.status === "finalized") {
      entry.status = entry.missingBank ? "review" : "draft";
      await entry.save();
    }
  }

  await refreshRunTotals(run._id);
  const fresh = await PayrollRun.findById(run._id).lean();
  const populated = await populateEntry(
    PayrollEntry.find({ payrollRunId: run._id }).sort({ employeeName: 1 })
  );
  return res
    .status(200)
    .json(new ApiResponse(200, { run: fresh, entries: populated }, "Payroll unlocked"));
});

const addEntryDeduction = asyncHandler(async (req, res) => {
  await assertManage(req);
  const entry = await PayrollEntry.findById(req.params.id);
  if (!entry) throw new ApiError(404, "Payroll entry not found");
  const run = await PayrollRun.findById(entry.payrollRunId);
  if (!run || ["finalized", "paid"].includes(run.status)) {
    throw new ApiError(400, "Locked payroll cannot be edited");
  }
  const { name, amount, note } = req.body;
  if (!name?.trim() || !amount) throw new ApiError(400, "Name and amount are required");
  entry.extraDeductions.push({
    name: name.trim(),
    amount: Number(amount) || 0,
    note: note || "",
  });

  applyEntryTotals(entry);
  await entry.save();
  await refreshRunTotals(entry.payrollRunId);
  return res.status(200).json(new ApiResponse(200, entry, "Deduction added"));
});

const updateEntryAmounts = asyncHandler(async (req, res) => {
  await assertManage(req);
  const entry = await PayrollEntry.findById(req.params.id);
  if (!entry) throw new ApiError(404, "Payroll entry not found");
  const run = await PayrollRun.findById(entry.payrollRunId);
  if (!run || ["finalized", "paid"].includes(run.status)) {
    throw new ApiError(400, "Locked payroll cannot be edited");
  }

  if (req.body.lateDeduction !== undefined) {
    entry.lateDeduction = Math.max(0, Number(req.body.lateDeduction) || 0);
  }
  if (req.body.absentDeduction !== undefined) {
    entry.absentDeduction = Math.max(0, Number(req.body.absentDeduction) || 0);
  }
  if (req.body.tax !== undefined) {
    entry.tax = Math.max(0, Number(req.body.tax) || 0);
  }
  if (req.body.pf !== undefined) {
    entry.pf = Math.max(0, Number(req.body.pf) || 0);
  }
  if (Array.isArray(req.body.extraDeductions)) {
    entry.extraDeductions = req.body.extraDeductions.map((d) => ({
      name: String(d.name || "Deduction").trim(),
      amount: Math.max(0, Number(d.amount) || 0),
      note: d.note || "",
    }));
  }

  applyEntryTotals(entry);
  await entry.save();
  await refreshRunTotals(entry.payrollRunId);
  return res.status(200).json(new ApiResponse(200, entry, "Deduction amounts updated"));
});

const getEntry = asyncHandler(async (req, res) => {
  const entry = await populateEntry(
    PayrollEntry.findById(req.params.id).populate(
      "payrollRunId",
      "month year status paidAt finalizedAt periodStart periodEnd cycleEndDay"
    )
  );
  if (!entry) throw new ApiError(404, "Payroll entry not found");
  await assertEntryScope(req, entry);
  const settings = await ensurePayrollDefaults();
  const enriched = await withPeriodDesignation(entry);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { entry: enriched, companyName: settings.companyName },
        "Payslip fetched"
      )
    );
});

const myPayslips = asyncHandler(async (req, res) => {
  const entries = await PayrollEntry.find({
    employeeId: req.user._id,
    status: { $in: ["finalized", "paid"] },
  })
    .populate("payrollRunId", "month year status paidAt finalizedAt periodStart periodEnd cycleEndDay")
    .sort({ createdAt: -1 })
    .lean();
  const enriched = await withPeriodDesignations(entries);
  return res.status(200).json(new ApiResponse(200, enriched, "Payslips fetched"));
});

const teamPayslips = asyncHandler(async (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const run = month && year ? await PayrollRun.findOne({ month, year }).lean() : null;
  if (!run) return res.status(200).json(new ApiResponse(200, [], "No payslips for this period"));

  const filter = {
    payrollRunId: run._id,
    status: { $in: ["finalized", "paid"] },
  };
  if (req.user?.role === "DEP_ADMIN") {
    const employees = await scopedPayrollEmployees(req);
    filter.employeeId = { $in: employees.map((e) => e._id) };
  } else if (!(await canManage(req)) && req.user?.role !== "FINANCE_ADMIN") {
    filter.employeeId = req.user._id;
  }
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;

  const entries = await populateEntry(
    PayrollEntry.find(filter)
      .populate(
        "payrollRunId",
        "month year status paidAt finalizedAt periodStart periodEnd cycleEndDay"
      )
      .sort({ employeeName: 1 })
  );
  const enriched = await withPeriodDesignations(entries);
  return res.status(200).json(new ApiResponse(200, enriched, "Payslips fetched"));
});

const downloadPayslipPdf = asyncHandler(async (req, res) => {
  const entry = await populateEntry(
    PayrollEntry.findById(req.params.id).populate(
      "payrollRunId",
      "month year status paidAt finalizedAt periodStart periodEnd cycleEndDay"
    )
  );
  if (!entry) throw new ApiError(404, "Payroll entry not found");
  await assertEntryScope(req, entry);

  const settings = await ensurePayrollDefaults();
  const enriched = await withPeriodDesignation(entry);
  const run =
    (enriched.payrollRunId &&
      (typeof enriched.payrollRunId.toObject === "function"
        ? enriched.payrollRunId.toObject()
        : enriched.payrollRunId)) ||
    {};

  const {
    buildPayslipPdfBuffer,
    payslipPdfFilename,
  } = await import("../utils/payslipPdf.js");

  const pdf = buildPayslipPdfBuffer({
    entry: enriched,
    companyName: settings.companyName || "Zytron World",
    run,
  });
  const filename = payslipPdfFilename(enriched, run);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/"/g, "")}"`
  );
  res.setHeader("Content-Length", pdf.length);
  return res.status(200).send(pdf);
});

const emailPayslips = asyncHandler(async (req, res) => {
  await assertManage(req);
  const ids = req.body.entryIds || [];
  if (!ids.length) throw new ApiError(400, "Select payslips to email");
  const entries = await populateEntry(
    PayrollEntry.find({ _id: { $in: ids } }).populate(
      "payrollRunId",
      "month year cycleEndDay periodStart periodEnd"
    )
  );
  const settings = await ensurePayrollDefaults();
  const from =
    process.env.PAYROLL_FROM_EMAIL || "info@zytronworld.com";
  const {
    buildPayslipPdfBuffer,
    payslipPdfFilename,
    payrollMonthLabel,
    payrollShortPeriod,
  } = await import("../utils/payslipPdf.js");

  let sent = 0;
  for (const entry of entries) {
    if (!entry.email) continue;
    const run = entry.payrollRunId || {};
    const monthLabel = payrollMonthLabel(run.month, run.year);
    const shortPeriod = payrollShortPeriod(run.month, run.year);
    const employeeName =
      entry.employeeName || entry.employeeId?.fullName || "Employee";
    const company = settings.companyName || "Zytron World";
    const subject = `Your payslip of ${shortPeriod}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#18181b;line-height:1.5">
        <p style="margin:0 0 8px">Dear ${employeeName},</p>
        <p style="margin:0">Please find attached your payslip for ${monthLabel}.</p>
      </div>
    `;
    const enrichedEntry = await withPeriodDesignation({
      ...(typeof entry.toObject === "function" ? entry.toObject() : entry),
      payrollRunId: run,
    });
    const pdf = buildPayslipPdfBuffer({
      entry: enrichedEntry,
      companyName: company,
      run,
    });
    try {
      await sendEmail(from, entry.email, subject, html, [
        {
          filename: payslipPdfFilename(entry, run),
          content: pdf,
          contentType: "application/pdf",
        },
      ]);
      sent += 1;
    } catch {
      /* continue */
    }
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { sent }, `${sent} payslips emailed`));
});

export {
  getSettings,
  updateSettings,
  createDeductionType,
  updateDeductionType,
  deleteDeductionType,
  getRun,
  generatePayroll,
  finalizeRun,
  markPaid,
  unlockRun,
  addEntryDeduction,
  updateEntryAmounts,
  getEntry,
  myPayslips,
  teamPayslips,
  downloadPayslipPdf,
  emailPayslips,
};
