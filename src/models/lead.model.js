import mongoose, { Schema } from "mongoose";

const leadSchema = new Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      //   required: true,
    },
    // agent: { type: Schema.Types.ObjectId, ref: "Employee" },
    name: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      required: true,
    },

    email: {
      type: String,
      //   required: true,
      unique: true,
      lowecase: true,
      trim: true,
    },

    phoneNo: { type: String, required: true },
    brandMark: { type: String, required: true },
    serialNo: { type: String, required: true },
    lastAction: {
      type: String,
      enum: [
        "no action",
        "no answer",
        "interested",
        "non interested",
        "in loop",
        "invalid",
        "schedule",
        "general",
      ],
      default: "no action",
    },

    // lastActionDate: { type: Date },
    // scheduleDate: { type: Date },
    // loopFromDate: { type: Date },
    // loopToDate: { type: Date },
    // lastComment: { type: String },

    signupDate: { type: Date, default: Date.now },
    paidStatus: {
      type: String,
      enum: ["pending", "paid", "partial", "failed", "refunded"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const Lead = mongoose.model("Lead", leadSchema);
