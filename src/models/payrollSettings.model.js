import mongoose, { Schema } from "mongoose";

const payrollSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    companyName: { type: String, default: "Zytron World" },
    payDay: { type: Number, default: 1, min: 1, max: 28 },
    taxSlabs: {
      type: [{ from: Number, to: Number, rate: Number }],
      default: [],
    },
    defaultBankName: { type: String, default: "" },
    /** Every N late marks = 1 day salary deduction. Default 2. */
    lateLatesPerDay: { type: Number, default: 2, min: 1 },
    /** Period ends on this day of the selected month. Start is next day of previous month. Default 25 → 26th–25th. */
    cycleEndDay: { type: Number, default: 25, min: 1, max: 28 },
  },
  { timestamps: true }
);

export const PayrollSettings = mongoose.model(
  "PayrollSettings",
  payrollSettingsSchema
);
