import mongoose, { Schema } from "mongoose";

const OFFER_STATUSES = ["draft", "sent", "accepted", "declined", "expired"];

const offerSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      default: null,
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "OfferTemplate",
      default: null,
    },
    candidateName: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    salary: { type: Number, default: null },
    salaryCurrency: { type: String, default: "PKR" },
    joiningDate: { type: Date, default: null },
    companyName: { type: String, default: "" },
    bodyHtml: { type: String, default: "" },
    subject: { type: String, default: "" },
    status: { type: String, enum: OFFER_STATUSES, default: "draft" },
    pdfUrl: { type: String, default: "" },
    pdfPublicId: { type: String, default: "" },
    respondTokenHash: { type: String, default: "", index: true },
    respondTokenExpiresAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

offerSchema.index({ status: 1, createdAt: -1 });

export const Offer = mongoose.model("Offer", offerSchema);
export { OFFER_STATUSES };
