import mongoose, { Schema } from "mongoose";

const employeeSalaryHistorySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    previousSalary: { type: Number, min: 0, default: 0 },
    newSalary: { type: Number, required: true, min: 0 },
    effectiveDate: { type: Date, required: true },
    reason: { type: String, trim: true, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeSalaryHistorySchema.index({ employeeId: 1, effectiveDate: -1 });

export const EmployeeSalaryHistory = mongoose.model(
  "EmployeeSalaryHistory",
  employeeSalaryHistorySchema
);
