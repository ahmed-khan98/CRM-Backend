import mongoose, { Schema } from "mongoose";

const applicationStageHistorySchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    fromStage: { type: String, default: null },
    toStage: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ApplicationStageHistory = mongoose.model(
  "ApplicationStageHistory",
  applicationStageHistorySchema
);
