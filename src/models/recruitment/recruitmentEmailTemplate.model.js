import mongoose, { Schema } from "mongoose";

const TEMPLATE_KEYS = [
  "application_received",
  "shortlisted",
  "interview_invite",
  "rejection",
  "offer",
  "joining_invite",
  "joining_submitted_hr",
  "joining_changes_requested",
];

const recruitmentEmailTemplateSchema = new Schema(
  {
    key: { type: String, enum: TEMPLATE_KEYS, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    bodyHtml: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

export const RecruitmentEmailTemplate = mongoose.model(
  "RecruitmentEmailTemplate",
  recruitmentEmailTemplateSchema
);
export { TEMPLATE_KEYS };
