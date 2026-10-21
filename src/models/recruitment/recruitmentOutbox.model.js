import mongoose, { Schema } from "mongoose";

const OUTBOX_STATUSES = ["pending", "sent", "failed"];

const recruitmentOutboxSchema = new Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    templateKey: { type: String, default: "" },
    relatedType: { type: String, default: "" },
    relatedId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: OUTBOX_STATUSES, default: "pending" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

recruitmentOutboxSchema.index({ status: 1, createdAt: 1 });

export const RecruitmentOutbox = mongoose.model(
  "RecruitmentOutbox",
  recruitmentOutboxSchema
);
export { OUTBOX_STATUSES };
