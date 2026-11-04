import mongoose, { Schema } from "mongoose";

/**
 * Mailbox credentials + address. Password is write-only (select: false).
 * Collection: mailbox_accounts
 *
 * kind:
 * - brand — client-facing, linked to Brand (+ optional Brand Email)
 * - personal — internal company mail, 1 per user, no brand/dept link
 */
const mailboxAccountSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["brand", "personal"],
      default: "brand",
      index: true,
    },
    /** Owner for personal mailboxes (exactly one personal per user) */
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: "Brand",
      required: function requiredBrand() {
        return this.kind !== "personal";
      },
      default: null,
      index: true,
    },
    /** Optional reference to existing Brand Email (Domain) row — read-only link */
    brandEmailId: {
      type: Schema.Types.ObjectId,
      ref: "Domain",
      default: null,
    },
    emailAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /** cPanel login; often same as emailAddress but may differ (.com vs .org) */
    loginUsername: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
    serverDefaultsId: {
      type: Schema.Types.ObjectId,
      ref: "MailboxServerDefaults",
      required: true,
    },
    /** Optional per-mailbox host/port overrides (null = use defaults) */
    imapHost: { type: String, trim: true, default: null },
    imapPort: { type: Number, default: null },
    imapSecure: { type: Boolean, default: null },
    smtpHost: { type: String, trim: true, default: null },
    smtpPort: { type: Number, default: null },
    smtpSecure: { type: Boolean, default: null },
    encryptedPassword: {
      type: String,
      required: true,
      select: false,
    },
    isActive: { type: Boolean, default: true, index: true },
    lastError: { type: String, default: null },
    lastConnectedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "mailbox_accounts" },
);

mailboxAccountSchema.index(
  { brandId: 1, emailAddress: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "brand", brandId: { $type: "objectId" } },
  },
);

mailboxAccountSchema.index(
  { ownerUserId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: "personal",
      ownerUserId: { $type: "objectId" },
    },
  },
);

export const MailboxAccount = mongoose.model(
  "MailboxAccount",
  mailboxAccountSchema,
);
