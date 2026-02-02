import mongoose, { Schema } from "mongoose";

const breakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    attendanceId: { type: Schema.Types.ObjectId, ref: "Attendance", required: true },
    status: {
      type: String,
      enum: ["break-in", "break-out"],
      required: true,
    },
    breakIn: { type: Date, required: true },
    breakOut: { type: Date, default: null },
    duration: { type: Number, default: 0 },

    // timestamp: {
    //   type: Date,
    //   default: Date.now,
    // },
  },
  { timestamps: true }
);

export const Break = mongoose.model("Break", breakSchema);
