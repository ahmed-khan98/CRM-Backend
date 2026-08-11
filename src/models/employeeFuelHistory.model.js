import mongoose, { Schema } from "mongoose";

const employeeFuelHistorySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    fuelAllowance: { type: Number, required: true, min: 0 },
    fuelCardNumber: { type: String, trim: true, default: "" },
    effectiveDate: { type: Date, required: true },
    endDate: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeFuelHistorySchema.index({ employeeId: 1, effectiveDate: -1 });

export const EmployeeFuelHistory = mongoose.model(
  "EmployeeFuelHistory",
  employeeFuelHistorySchema
);
