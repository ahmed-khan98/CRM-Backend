import mongoose, { Schema } from "mongoose";

export const ALLOWANCE_TYPES = [
  "Car Allowance",
  "Fuel Allowance",
  "Medical Allowance",
  "Mobile Allowance",
  "Internet Allowance",
  "House Rent",
  "Meal Allowance",
  "Other",
];

/** For Car Allowance: take cash amount OR a company vehicle */
export const BENEFIT_MODES = ["cash", "company_car"];

const employeeAllowanceSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    allowanceType: {
      type: String,
      enum: ALLOWANCE_TYPES,
      required: true,
    },
    /** cash = monthly amount; company_car = assigned fleet vehicle */
    benefitMode: {
      type: String,
      enum: BENEFIT_MODES,
      default: "cash",
    },
    amount: { type: Number, required: true, min: 0, default: 0 },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    effectiveDate: { type: Date, required: true },
    notes: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    /** Audit trail for activate / deactivate (and create) */
    statusHistory: [
      {
        fromStatus: { type: String, default: "" },
        toStatus: { type: String, required: true },
        note: { type: String, default: "" },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

employeeAllowanceSchema.index({ employeeId: 1, effectiveDate: -1 });
employeeAllowanceSchema.index({ vehicleId: 1, status: 1 });

export const EmployeeAllowance = mongoose.model(
  "EmployeeAllowance",
  employeeAllowanceSchema
);
