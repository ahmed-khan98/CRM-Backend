import mongoose, { Schema } from "mongoose";

const attendanceSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    shiftDate: {
      type: String,
      required: true,
    },
    timeIn: { type: Date, required: true },
    timeOut: { type: Date, default: null },
    status: {
      type: String,
      enum: ["present", "late", "half-day", "absent"],
      default: "absent",
    },
    totalBreakMinutes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

attendanceSchema.index({ employeeId: 1, shiftDate: 1 }, { unique: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
