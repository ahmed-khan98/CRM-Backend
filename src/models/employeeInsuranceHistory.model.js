import mongoose, { Schema } from "mongoose";

const employeeInsuranceHistorySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    provider: { type: String, required: true, trim: true },
    policyNumber: { type: String, trim: true, default: "" },
    coverage: { type: String, trim: true, default: "" },
    effectiveDate: { type: Date, required: true },
    expiryDate: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeInsuranceHistorySchema.index({ employeeId: 1, effectiveDate: -1 });

export const EmployeeInsuranceHistory = mongoose.model(
  "EmployeeInsuranceHistory",
  employeeInsuranceHistorySchema
);
