import mongoose from "mongoose";

const monthSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,

    monthCode: {
      type: String,
      unique: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
      createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
  },
      updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
  },
  },
  { timestamps: true },
);
export const Month = mongoose.model("Month", monthSchema);
