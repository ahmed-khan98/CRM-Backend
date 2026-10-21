import mongoose, { Schema } from "mongoose";

const QUEUE_STATUSES = ["pending", "processing", "done", "failed"];

const recruitmentMatchQueueSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: QUEUE_STATUSES,
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    lastError: { type: String, default: "" },
    lockedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    force: { type: Boolean, default: false },
  },
  { timestamps: true }
);

recruitmentMatchQueueSchema.index({ status: 1, createdAt: 1 });
recruitmentMatchQueueSchema.index({ status: 1, lockedAt: 1 });

export const RecruitmentMatchQueue = mongoose.model(
  "RecruitmentMatchQueue",
  recruitmentMatchQueueSchema
);
export { QUEUE_STATUSES };
