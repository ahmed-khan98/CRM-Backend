import mongoose, { Schema } from "mongoose";

const payrollEntrySchema = new Schema(
  {
    payrollRunId: {
      type: Schema.Types.ObjectId,
      ref: "PayrollRun",
      required: true,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    employeeName: { type: String, default: "" },
    designation: { type: String, default: "" },
    departmentName: { type: String, default: "" },
    email: { type: String, default: "" },
    basicSalary: { type: Number, default: 0 },
    allowances: {
      type: [{ name: String, amount: Number, mode: String }],
      default: [],
    },
    extraDeductions: {
      type: [{ name: String, amount: Number, note: String }],
      default: [],
    },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    absentDeduction: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    deductionsTotal: { type: Number, default: 0 },
    allowancesTotal: { type: Number, default: 0 },
    grossPay: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "review", "finalized", "paid"],
      default: "draft",
    },
    missingBank: { type: Boolean, default: false },
    bankMasked: { type: String, default: "" },
    bankName: { type: String, default: "" },
  },
  { timestamps: true }
);

payrollEntrySchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });

export const PayrollEntry = mongoose.model("PayrollEntry", payrollEntrySchema);
