import mongoose, { Schema } from "mongoose";

/** One row per browser/device push subscription (a user can have several —
 * phone PWA, desktop Chrome, etc.). Keyed by endpoint since that's what the
 * push service (FCM/Mozilla/etc.) uses to uniquely identify a subscription. */
const pushSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model(
  "PushSubscription",
  pushSubscriptionSchema
);
