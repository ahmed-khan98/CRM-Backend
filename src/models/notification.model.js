import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "TASK_ASSIGNED",
        "TASK_STATUS",
        "TASK_COMMENT",
        "GENERAL",
        "CHAT_MESSAGE",
        "CHAT_MENTION",
        "CHAT_GROUP",
        "MISSED_CALL",
        "INCOMING_CALL",
        "LEAD_SCHEDULE",
      ],
      default: "GENERAL",
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
    },
    callLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CallLog",
      default: null,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** How many events (e.g. chat messages) got collapsed into this single
     * notification row instead of creating a new one for each. */
    count: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
