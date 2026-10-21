import mongoose, { Schema } from "mongoose";

const deductionTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      enum: ["tax", "pf", "loan", "late", "absent", "other"],
      default: "other",
    },
    calcType: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
    defaultAmount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const DeductionType = mongoose.model("DeductionType", deductionTypeSchema);
