import mongoose, { Schema } from "mongoose";

const employeeCarHistorySchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    carName: { type: String, required: true, trim: true },
    registrationNumber: { type: String, trim: true, default: "" },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
      index: true,
    },
    assignedDate: { type: Date, required: true },
    returnedDate: { type: Date },
    status: {
      type: String,
      enum: ["assigned", "returned", "inactive"],
      default: "assigned",
    },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeCarHistorySchema.index({ employeeId: 1, assignedDate: -1 });

export const EmployeeCarHistory = mongoose.model(
  "EmployeeCarHistory",
  employeeCarHistorySchema
);
