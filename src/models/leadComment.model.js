import mongoose, { Schema } from "mongoose";

const leadComment = new Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    // required: true,
  },
  lastAction: {
    type: String,
    enum: [
      "no action",
      "no answer",
      "interested",
      "not interested",
      "in loop",
      "invalid",
      "schedule",
      "general",
    ],
    default: "no action",
  },
  scheduleDate: { type: Date },
  loopFromDate: { type: Date },
  loopToDate: { type: Date },
  lastComment: { type: String,required: true,trim: true, },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const LeadComment = mongoose.model("LeadComment", leadComment);
