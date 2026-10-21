import mongoose, { Schema } from "mongoose";

const INTERVIEW_TYPES = ["phone", "video", "onsite"];
const INTERVIEW_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "rescheduled",
];

const interviewSchema = new Schema(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    round: { type: String, default: "Round 1", trim: true },
    type: { type: String, enum: INTERVIEW_TYPES, default: "video" },
    startsAt: { type: Date, required: true },
    durationMin: { type: Number, default: 60, min: 15 },
    interviewerIds: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    meetingLink: { type: String, default: "" },
    location: { type: String, default: "" },
    status: { type: String, enum: INTERVIEW_STATUSES, default: "scheduled" },
    reminderSent: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

interviewSchema.index({ startsAt: 1, status: 1 });
interviewSchema.index({ interviewerIds: 1, startsAt: 1 });

export const Interview = mongoose.model("Interview", interviewSchema);
export { INTERVIEW_TYPES, INTERVIEW_STATUSES };
