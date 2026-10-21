import mongoose, { Schema } from "mongoose";

const offerTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    subject: { type: String, default: "Job Offer — {{job_title}}", trim: true },
    bodyHtml: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true }
);

export const OfferTemplate = mongoose.model("OfferTemplate", offerTemplateSchema);
