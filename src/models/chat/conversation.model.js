import mongoose, { Schema } from "mongoose";

const participantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    role: {
      type: String,
      enum: ["member", "admin"],
      default: "member",
    },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: null },
    lastDeliveredAt: { type: Date, default: null },
    muted: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },
    /** Soft-delete / hide chat from this user's list */
    hidden: { type: Boolean, default: false },
    /** Messages at or before this time are hidden for this user */
    clearedAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
      index: true,
    },
    /** Sorted pair key for direct chats — enforces uniqueness.
     *  Must be OMITTED (not null) on group chats — unique sparse indexes
     *  still collide on multiple null values in MongoDB. */
    directKey: {
      type: String,
      index: true,
      sparse: true,
      unique: true,
    },
    name: { type: String, trim: true, default: "" },
    image: { type: String, default: "" },
    description: { type: String, trim: true, default: "" },
    participants: {
      type: [participantSchema],
      validate: {
        validator(v) {
          if (this.isDeleted) return Array.isArray(v);
          // Direct self-chat may have 1 participant; groups enforce >=2 in controller
          return Array.isArray(v) && v.length >= 1;
        },
        message: "Conversation needs at least 1 participant",
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    lastMessage: {
      messageId: { type: Schema.Types.ObjectId, ref: "ChatMessage" },
      body: { type: String, default: "" },
      type: { type: String, default: "text" },
      senderId: { type: Schema.Types.ObjectId, ref: "Employee" },
      createdAt: { type: Date, default: null },
      deletedForEveryone: { type: Boolean, default: false },
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationSchema.index({ "participants.userId": 1, updatedAt: -1 });
conversationSchema.index({ type: 1, "participants.userId": 1 });

// Groups must not store directKey at all (even as null)
conversationSchema.pre("save", function stripGroupDirectKey(next) {
  if (this.type === "group") {
    this.directKey = undefined;
    if (this._doc) delete this._doc.directKey;
  }
  next();
});

export const Conversation = mongoose.model("Conversation", conversationSchema);

export function makeDirectKey(userA, userB) {
  const a = userA.toString();
  const b = userB.toString();
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
