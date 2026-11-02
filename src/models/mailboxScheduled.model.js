import mongoose, { Schema } from "mongoose";

/**
 * Scheduled outbound messages (Phase 4 send path; cron claims atomically).
 * Collection: mailbox_scheduled
 *
 * Idempotency: smtpMessageId is chosen BEFORE SMTP; smtpSentAt is set
 * immediately after SMTP success so stale recovery never double-sends.
 */
const scheduledAttachmentSchema = new Schema(
  {
    filename: { type: String, required: true },
    contentType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    /** Omitted from queries by default — load with +attachments.contentBase64 */
    contentBase64: { type: String, select: false },
  },
  { _id: false },
);

const mailboxScheduledSchema = new Schema(
  {
    mailboxId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxAccount",
      required: true,
      index: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    to: [{ type: String, required: true }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String, default: "" },
    bodyHtml: { type: String, default: "" },
    attachments: { type: [scheduledAttachmentSchema], default: [] },
    sendAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    sendingStartedAt: { type: Date, default: null },
    /** Pre-generated Message-ID used for SMTP (idempotency key) */
    smtpMessageId: { type: String, default: null },
    /** Set immediately after SMTP accepts the message — never SMTP again */
    smtpSentAt: { type: Date, default: null },
    completionWarning: { type: String, default: null },
  },
  { timestamps: true, collection: "mailbox_scheduled" },
);

mailboxScheduledSchema.index({ status: 1, sendAt: 1 });

export const MailboxScheduled = mongoose.model(
  "MailboxScheduled",
  mailboxScheduledSchema,
);
