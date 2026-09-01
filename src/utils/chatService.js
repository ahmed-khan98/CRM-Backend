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

/** If the deleted message is the sidebar snapshot, rewrite that preview. */
export async function syncLastMessageAfterDelete(conv, msg) {
  const lastId = conv?.lastMessage?.messageId?.toString();
  if (!lastId || lastId !== msg._id.toString()) return false;
  await updateConversationLastMessage(conv._id, msg);
  return true;
}

export function recipientIds(conv, excludeUserId) {
  return conv.participants
    .map((p) => p.userId.toString())
    .filter((id) => id !== excludeUserId.toString());
}

export const chatService = {
  populateMessage,
  updateConversationLastMessage,
  syncLastMessageAfterDelete,
  recipientIds,
  previewFromMessage,
};
