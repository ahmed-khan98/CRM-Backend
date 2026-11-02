import mongoose, { Schema } from "mongoose";

/**
 * Metadata for messages sent via the mailbox module.
 * Collection: mailbox_sent
 */
const mailboxSentSchema = new Schema(
  {
    mailboxId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxAccount",
      required: true,
      index: true,
    },
    sentByUserId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    to: [{ type: String }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String, default: "" },
    messageId: { type: String, default: null, index: true },
    imapAppended: { type: Boolean, default: false },
    inReplyTo: { type: String, default: null },
    references: { type: String, default: null },
  },
  { timestamps: true, collection: "mailbox_sent" },
);

export const MailboxSent = mongoose.model("MailboxSent", mailboxSentSchema);
