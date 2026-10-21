import mongoose, { Schema } from "mongoose";

const RECOMMENDATIONS = ["hire", "no_hire", "hold"];

const interviewFeedbackSchema = new Schema(
  {
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: "Interview",
      required: true,
      index: true,
    },
    by: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    comments: { type: String, default: "" },
    recommendation: {
      type: String,
      enum: RECOMMENDATIONS,
      default: "hold",
    },
    scorecard: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

interviewFeedbackSchema.index({ interviewId: 1, by: 1 }, { unique: true });

export const InterviewFeedback = mongoose.model(
  "InterviewFeedback",
  interviewFeedbackSchema
);
export { RECOMMENDATIONS };
