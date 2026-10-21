import mongoose, { Schema } from "mongoose";

const applicationSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },
    stage: { type: String, required: true, default: "applied", trim: true },
    source: { type: String, default: "careers", trim: true },
    matchPercent: { type: Number, default: null, min: 0, max: 100 },
    /** pending | processing | done | failed | not_analyzed — set by CV parse / match jobs */
    matchStatus: {
      type: String,
      default: "pending",
      trim: true,
      enum: ["pending", "processing", "done", "failed", "not_analyzed"],
    },
    matchStatusReason: { type: String, default: "", trim: true },
    confidence: {
      type: String,
      enum: ["high", "medium", "low", ""],
      default: "",
    },
    matchedSkills: [{ type: String, trim: true }],
    /** Partial credit via relatedSkills.json — not green "matched" */
    relatedSkills: [
      {
        skill: { type: String, trim: true },
        basedOn: { type: String, trim: true },
        credit: { type: Number, min: 0, max: 1 },
      },
    ],
    missingSkills: [{ type: String, trim: true }],
    strengths: [{ type: String, trim: true }],
    concerns: [{ type: String, trim: true }],
    evidence: [{ type: String, trim: true }],
    summary: { type: String, default: "" },
    flags: [{ type: String, trim: true }],
    matchNote: { type: String, default: "" },
    /** UI breakdown: criteria scores/weights, cap, cv/form years — no CV text */
    scoreBreakdown: { type: Schema.Types.Mixed, default: null },
    jobVersion: { type: Number, default: 1, min: 1 },
    scoredAt: { type: Date, default: null },
    coverLetter: { type: String, default: "" },
    rejectionReasonId: { type: Schema.Types.ObjectId, default: null },
    rejectionNote: { type: String, default: "" },
    seenByHrAt: { type: Date, default: null },
    hiredAt: { type: Date, default: null },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ stage: 1, createdAt: -1 });
applicationSchema.index({ createdAt: -1 });

export const Application = mongoose.model("Application", applicationSchema);
