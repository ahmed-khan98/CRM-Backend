import mongoose, { Schema } from "mongoose";

const breakSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    shiftDate: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["break-in", "break-out"],
      required: true,
    },
    breakIn: { type: Date, required: true },
    breakOut: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    type: {
      type: String,
      trim: true,
      enum: [
        "MEAL",
        "REST ROOM",
        "OFFICIAL",
        "TEA",
        "PRAYER",
        "SMOKING",
        "SYSTEM IDLE",
      ],
      default: "SYSTEM IDLE",
    },
    reason: { type: String },
  },
  { timestamps: true },
);

export const Break = mongoose.model("Break", breakSchema);
