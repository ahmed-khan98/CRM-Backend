import mongoose, { Schema } from "mongoose";

const applicationAnswerSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "JobQuestion",
      required: true,
    },
    value: { type: Schema.Types.Mixed, default: "" },
  },
  { timestamps: true }
);

applicationAnswerSchema.index({ applicationId: 1, questionId: 1 }, { unique: true });

export const ApplicationAnswer = mongoose.model(
  "ApplicationAnswer",
  applicationAnswerSchema
);
