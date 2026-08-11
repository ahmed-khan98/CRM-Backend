import mongoose, { Schema } from "mongoose";

/** User-level chat block or admin disable */
const chatBlockSchema = new Schema(
  {
    blockerId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    blockedId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    reason: { type: String, default: "" },
    /** admin_disable = CRM admin disabled chat for a user */
    kind: {
      type: String,
      enum: ["user_block", "admin_disable"],
      default: "user_block",
    },
  },
  { timestamps: true }
);

chatBlockSchema.index({ blockerId: 1, blockedId: 1, kind: 1 }, { unique: true });

export const ChatBlock = mongoose.model("ChatBlock", chatBlockSchema);
