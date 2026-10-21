import mongoose, { Schema } from "mongoose";

const recruitmentRematchBatchSchema = new Schema(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["queued", "running", "done"],
      default: "queued",
      index: true,
    },
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    processing: { type: Number, default: 0 },
    notAnalyzed: { type: Number, default: 0 },
    applicationIds: [{ type: Schema.Types.ObjectId, ref: "Application" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

recruitmentRematchBatchSchema.index({ jobId: 1, createdAt: -1 });

export const RecruitmentRematchBatch = mongoose.model(
  "RecruitmentRematchBatch",
  recruitmentRematchBatchSchema
);
