import { ChatMessage } from "../models/chat/message.model.js";
import { Conversation } from "../models/chat/conversation.model.js";
import { USER_PUBLIC_SELECT, previewFromMessage } from "./chatHelpers.js";

export const MESSAGE_POPULATE = [
  { path: "senderId", select: USER_PUBLIC_SELECT },
  {
    path: "replyTo",
    select: "body type senderId attachments deletedForEveryone",
    populate: { path: "senderId", select: "fullName image" },
  },
  { path: "mentions", select: "fullName image" },
];

export async function populateMessage(id) {
  let q = ChatMessage.findById(id);
  for (const p of MESSAGE_POPULATE) q = q.populate(p);
  return q.lean();
}

export async function updateConversationLastMessage(conversationId, msg) {
  const preview = previewFromMessage(msg);
  await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      lastMessage: {
        messageId: msg._id,
        body: preview.body,
        type: preview.type,
        senderId: msg.senderId,
        createdAt: msg.createdAt || new Date(),
        deletedForEveryone: Boolean(msg.deletedForEveryone),
      },
    },
    updatedAt: new Date(),
  });
}

/** Rebuild sidebar preview from the newest message (ignores stale messageId). */
export async function refreshConversationLastMessage(conversationId) {
  const latest = await ChatMessage.findOne({ conversationId }).sort({
    createdAt: -1,
    _id: -1,
  });
  if (!latest) {
    await Conversation.findByIdAndUpdate(conversationId, {
      $unset: { lastMessage: 1 },
    });
    return null;
  }
  await updateConversationLastMessage(conversationId, latest);
  return latest;
}

export async function latestMessageByConversationIds(conversationIds = []) {
  const ids = conversationIds.filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await ChatMessage.aggregate([
    { $match: { conversationId: { $in: ids } } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$conversationId",
        messageId: { $first: "$_id" },
        body: { $first: "$body" },
        type: { $first: "$type" },
        senderId: { $first: "$senderId" },
        createdAt: { $first: "$createdAt" },
        deletedForEveryone: { $first: "$deletedForEveryone" },
        deletedFor: { $first: "$deletedFor" },
        attachments: { $first: "$attachments" },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

export function recipientIds(conv, excludeUserId) {
  return conv.participants
    .map((p) => p.userId.toString())
    .filter((id) => id !== excludeUserId.toString());
}

export const chatService = {
  populateMessage,
  updateConversationLastMessage,
  refreshConversationLastMessage,
  latestMessageByConversationIds,
  recipientIds,
  previewFromMessage,
};
