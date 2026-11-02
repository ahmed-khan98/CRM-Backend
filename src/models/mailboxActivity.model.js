import mongoose, { Schema } from "mongoose";

/**
 * Non-invasive CRM link log for mailbox messages.
 * Collection: mailbox_activity
 */
const mailboxActivitySchema = new Schema(
  {
    mailboxId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxAccount",
      required: true,
      index: true,
    },
    messageId: { type: String, default: null, index: true },
    subject: { type: String, default: "" },
    date: { type: Date, default: null },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    counterpartyEmail: { type: String, lowercase: true, trim: true, index: true },
    linkedClientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    linkedLeadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
    openedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  { timestamps: true, collection: "mailbox_activity" },
);

mailboxActivitySchema.index({ mailboxId: 1, messageId: 1 });

export const MailboxActivity = mongoose.model(
  "MailboxActivity",
  mailboxActivitySchema,
);
