import mongoose, { Schema } from "mongoose";

const chatPresenceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["online", "offline", "away", "in_call", "busy", "recording"],
      default: "offline",
    },
    lastSeen: { type: Date, default: Date.now },
    typingIn: { type: Schema.Types.ObjectId, ref: "Conversation", default: null },
  },
  { timestamps: true }
);

export const ChatPresence = mongoose.model("ChatPresence", chatPresenceSchema);

/** In-memory socket connection counts (multi-tab) */
const onlineSockets = new Map(); // userId -> Set(socketId)

export const presenceMemory = {
  add(userId, socketId) {
    const id = userId.toString();
    if (!onlineSockets.has(id)) onlineSockets.set(id, new Set());
    onlineSockets.get(id).add(socketId);
    return onlineSockets.get(id).size;
  },
  remove(userId, socketId) {
    const id = userId.toString();
    const set = onlineSockets.get(id);
    if (!set) return 0;
    set.delete(socketId);
    if (set.size === 0) onlineSockets.delete(id);
    return set.size;
  },
  isOnline(userId) {
    return onlineSockets.has(userId?.toString());
  },
  count(userId) {
    return onlineSockets.get(userId?.toString())?.size || 0;
  },
  /** All currently connected user ids */
  listOnline() {
    return [...onlineSockets.keys()];
  },
};
