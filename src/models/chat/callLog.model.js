import mongoose, { Schema } from "mongoose";

const callLogSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    callerId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    calleeIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Employee",
      },
    ],
    callType: {
      type: String,
      enum: ["voice", "video"],
      required: true,
    },
    isGroupCall: {
      type: Boolean,
      default: false,
      index: true,
    },
    direction: {
      type: String,
      enum: ["outgoing", "incoming"],
      default: "outgoing",
    },
    status: {
      type: String,
      enum: ["ringing", "accepted", "rejected", "missed", "ended", "failed"],
      default: "ringing",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callLogSchema.index({ callerId: 1, createdAt: -1 });
callLogSchema.index({ calleeIds: 1, createdAt: -1 });

export const CallLog = mongoose.model("CallLog", callLogSchema);
