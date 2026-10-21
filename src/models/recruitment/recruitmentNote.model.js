import mongoose, { Schema } from "mongoose";

const recruitmentNoteSchema = new Schema(
  {
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
      index: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      default: null,
      index: true,
    },
    body: { type: String, required: true, trim: true },
    authorId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const RecruitmentNote = mongoose.model(
  "RecruitmentNote",
  recruitmentNoteSchema
);
