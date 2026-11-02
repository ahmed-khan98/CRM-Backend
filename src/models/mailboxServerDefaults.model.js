import mongoose, { Schema } from "mongoose";

/**
 * Per-domain IMAP/SMTP defaults for the mailbox module.
 * Collection: mailbox_server_defaults
 */
const mailboxServerDefaultsSchema = new Schema(
  {
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    imapHost: { type: String, required: true, trim: true },
    imapPort: { type: Number, required: true, default: 993 },
    imapSecure: { type: Boolean, required: true, default: true },
    smtpHost: { type: String, required: true, trim: true },
    smtpPort: { type: Number, required: true, default: 465 },
    smtpSecure: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "mailbox_server_defaults" },
);

export const MailboxServerDefaults = mongoose.model(
  "MailboxServerDefaults",
  mailboxServerDefaultsSchema,
);
