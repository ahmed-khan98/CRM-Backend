import mongoose, { Schema } from "mongoose";

const leaveTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    annualDays: { type: Number, required: true, default: 0, min: 0 },
    carryForward: { type: Boolean, default: false },
    requiresDocument: { type: Boolean, default: false },
    isPaid: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leaveTypeSchema.index({ name: 1 }, { unique: true });

export const LeaveType = mongoose.model("LeaveType", leaveTypeSchema);
