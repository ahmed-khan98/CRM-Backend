import mongoose, { Schema } from "mongoose";

const attendanceSchema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  shiftDate: { type: String, required: true }, // Format: "YYYY-MM-DD"
  timeIn: { type: Date, required: true },
  timeOut: { type: Date, default: null },
  status: { type: String, enum: ["present", "late", "half-day",'absent'], default: "absent" },
  totalBreakMinutes: { type: Number, default: 0 },
//   lastActivity: { type: Date, default: Date.now }, // Extension isay update karegi
}, { timestamps: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);