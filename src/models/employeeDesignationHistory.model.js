import mongoose, { Schema } from "mongoose";

const employeeDesignationHistorySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    previousDesignation: { type: String, trim: true, default: "" },
    designation: { type: String, required: true, trim: true },
    effectiveDate: { type: Date, required: true },
    reason: { type: String, trim: true, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeDesignationHistorySchema.index({ employeeId: 1, effectiveDate: -1 });

export const EmployeeDesignationHistory = mongoose.model(
  "EmployeeDesignationHistory",
  employeeDesignationHistorySchema
);
