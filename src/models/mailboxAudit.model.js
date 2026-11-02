import mongoose, { Schema } from "mongoose";

/**
 * Audit trail for mailbox module actions.
 * Collection: mailbox_audit
 */
const mailboxAuditSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    actorRole: { type: String, required: true },
    mailboxId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxAccount",
      default: null,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "mailbox_audit" },
);

export const MailboxAudit = mongoose.model("MailboxAudit", mailboxAuditSchema);
