import mongoose, { Schema } from "mongoose";

const payrollRunSchema = new Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "processing", "finalized", "paid"],
      default: "draft",
    },
    generatedAt: { type: Date, default: Date.now },
    finalizedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    generatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    periodStart: { type: String, default: "" },
    periodEnd: { type: String, default: "" },
    cycleEndDay: { type: Number, default: 25 },
    totals: {
      employees: { type: Number, default: 0 },
      gross: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
      pendingReview: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

payrollRunSchema.index({ year: 1, month: 1 }, { unique: true });

export const PayrollRun = mongoose.model("PayrollRun", payrollRunSchema);
