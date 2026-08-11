import mongoose, { Schema } from "mongoose";

const employeePreviousEmploymentSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    companyName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    lastSalary: { type: Number, min: 0 },
    reasonForLeaving: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeePreviousEmploymentSchema.index({ employeeId: 1, startDate: -1 });

export const EmployeePreviousEmployment = mongoose.model(
  "EmployeePreviousEmployment",
  employeePreviousEmploymentSchema
);
