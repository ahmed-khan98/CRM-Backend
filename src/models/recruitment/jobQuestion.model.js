import mongoose, { Schema } from "mongoose";

const QUESTION_TYPES = ["text", "textarea", "number", "yes_no", "mcq"];

const jobQuestionSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    type: { type: String, enum: QUESTION_TYPES, default: "text" },
    label: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }],
    required: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const JobQuestion = mongoose.model("JobQuestion", jobQuestionSchema);
export { QUESTION_TYPES };
