import mongoose, { Schema } from "mongoose";

const stageSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isTerminal: { type: Boolean, default: false },
    color: { type: String, default: "" },
  },
  { _id: false }
);

const namedItemSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const recruitmentSettingsSchema = new Schema(
  {
    companyName: { type: String, default: "Company", trim: true },
    careersLogoUrl: { type: String, default: "" },
    careersBannerUrl: { type: String, default: "" },
    careersHeadline: { type: String, default: "Join our team", trim: true },
    careersSubheadline: { type: String, default: "", trim: true },
    /** Days until joining-details magic link expires (default 7) */
    joiningLinkExpiryDays: { type: Number, default: 7, min: 1, max: 90 },
    /** Public frontend origin for offer/joining links, e.g. https://crm.example.com */
    careersPublicBaseUrl: { type: String, default: "", trim: true },
    pipelineStages: { type: [stageSchema], default: [] },
    rejectionReasons: { type: [namedItemSchema], default: [] },
    applicationSources: { type: [namedItemSchema], default: [] },
    /** Match scoring weights (percent). UI editing in Phase 4. */
    matchWeights: {
      mustHaveSkills: { type: Number, default: 40 },
      experience: { type: Number, default: 25 },
      roleRelevance: { type: Number, default: 15 },
      education: { type: Number, default: 10 },
      niceToHaveSkills: { type: Number, default: 10 },
    },
    /**
     * Legacy hard floor when missing-share ≥ b3. Kept in sync with
     * mustHaveCapTiers.c3 for older clients / migrations.
     */
    mustHaveCap: { type: Number, default: 60, min: 0, max: 100 },
    /**
     * Graduated must-have caps by missing-share %:
     * share < b1 → none; [b1,b2) → c1; [b2,b3) → c2; ≥ b3 → c3.
     */
    mustHaveCapTiers: {
      b1: { type: Number, default: 10, min: 0, max: 100 },
      b2: { type: Number, default: 25, min: 0, max: 100 },
      b3: { type: Number, default: 50, min: 0, max: 100 },
      c1: { type: Number, default: 85, min: 0, max: 100 },
      c2: { type: Number, default: 75, min: 0, max: 100 },
      c3: { type: Number, default: 60, min: 0, max: 100 },
    },
    /**
     * Soft toggle for AI matching path. Env AI_ENABLED remains the master switch —
     * when env is off, AI is always unavailable regardless of this flag.
     */
    aiMatchingEnabled: { type: Boolean, default: true },
    /** Default minimum match % filter on applicants list (0 = no filter). */
    defaultMinMatchScore: { type: Number, default: 0, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

export const RecruitmentSettings = mongoose.model(
  "RecruitmentSettings",
  recruitmentSettingsSchema
);
