import mongoose, { Schema } from "mongoose";

const historySchema = new Schema(
  {
    action: {
      type: String,
      enum: ["submitted", "approved", "rejected", "updated"],
      required: true,
    },
    by: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const leaveRequestSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    leaveTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    days: { type: Number, required: true, min: 0 },
    halfDay: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    documentUrl: { type: String, default: "" },
    documentName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    decisionNote: { type: String, default: "" },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employeeId: 1, fromDate: 1, toDate: 1 });
leaveRequestSchema.index({ status: 1, fromDate: 1, toDate: 1 });

export const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);
