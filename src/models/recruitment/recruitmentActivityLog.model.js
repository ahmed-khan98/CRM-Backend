import mongoose, { Schema } from "mongoose";

const recruitmentActivityLogSchema = new Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: [
        "job",
        "application",
        "candidate",
        "interview",
        "offer",
        "settings",
      ],
    },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true, trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

recruitmentActivityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const RecruitmentActivityLog = mongoose.model(
  "RecruitmentActivityLog",
  recruitmentActivityLogSchema
);
