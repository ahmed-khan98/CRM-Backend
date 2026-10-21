import mongoose, { Schema } from "mongoose";

const AI_USAGE_STATUSES = ["success", "error", "invalid_json", "skipped"];

const aiUsageLogSchema = new Schema(
  {
    feature: { type: String, required: true, trim: true },
    provider: { type: String, default: "", trim: true },
    model: { type: String, default: "", trim: true },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    durationMs: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: AI_USAGE_STATUSES, required: true },
    /** HTTP status or internal code. Never a prompt, CV, or API key. */
    errorCode: { type: String, default: "", trim: true },
    applicationId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

aiUsageLogSchema.index({ createdAt: 1, status: 1 });

export const AiUsageLog = mongoose.model("AiUsageLog", aiUsageLogSchema);
export { AI_USAGE_STATUSES };
