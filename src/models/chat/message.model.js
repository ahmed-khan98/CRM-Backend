import mongoose, { Schema } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    resourceType: { type: String, default: "raw" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    thumbnailUrl: { type: String, default: "" },
  },
  { _id: false }
);

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const receiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    deliveredAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "audio",
        "file",
        "voice",
        "system",
        "call",
      ],
      default: "text",
    },
    body: { type: String, trim: true, default: "" },
    attachments: [attachmentSchema],
    replyTo: { type: Schema.Types.ObjectId, ref: "ChatMessage", default: null },
    forwardedFrom: {
      messageId: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
      conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
      senderId: { type: Schema.Types.ObjectId, ref: "Employee" },
    },
    mentions: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    reactions: [reactionSchema],
    starredBy: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    receipts: [receiptSchema],
    editedAt: { type: Date, default: null },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
    deletedForEveryone: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    callMeta: {
      callLogId: { type: Schema.Types.ObjectId, ref: "CallLog" },
      callType: { type: String, enum: ["voice", "video", ""] },
      status: { type: String, default: "" },
      duration: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, type: 1, createdAt: -1 });
messageSchema.index({ body: "text" });
messageSchema.index({ "attachments.mimeType": 1 });

export const ChatMessage = mongoose.model("ChatMessage", messageSchema);
