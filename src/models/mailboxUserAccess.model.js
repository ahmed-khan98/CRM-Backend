import mongoose, { Schema } from "mongoose";

/**
 * User ↔ mailbox assignment with permission level.
 * Collection: mailbox_user_access
 */
const mailboxUserAccessSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    mailboxId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxAccount",
      required: true,
      index: true,
    },
    permission: {
      type: String,
      enum: ["read", "read_send", "manage"],
      required: true,
      default: "read",
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
  },
  { timestamps: true, collection: "mailbox_user_access" },
);

mailboxUserAccessSchema.index({ userId: 1, mailboxId: 1 }, { unique: true });

export const MailboxUserAccess = mongoose.model(
  "MailboxUserAccess",
  mailboxUserAccessSchema,
);
