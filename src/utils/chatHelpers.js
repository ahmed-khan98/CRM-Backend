import { ApiError } from "./ApiError.js";
import { Conversation } from "../models/chat/conversation.model.js";
import { ChatBlock } from "../models/chat/chatBlock.model.js";
import { Employee } from "../models/employee.model.js";

export const USER_PUBLIC_SELECT =
  "fullName email image phoneNo role departmentId designation status";

export function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function assertActiveEmployee(userId) {
  const emp = await Employee.findById(userId).select("status fullName");
  if (!emp) throw new ApiError(404, "Employee not found");
  if (emp.status === "block" || emp.status === "de active") {
    throw new ApiError(403, "Account is not active");
  }
  return emp;
}

export async function isChatDisabled(userId) {
  const block = await ChatBlock.findOne({
    blockedId: userId,
    kind: "admin_disable",
  }).lean();
  return Boolean(block);
}

export async function assertCanUseChat(userId) {
  await assertActiveEmployee(userId);
  if (await isChatDisabled(userId)) {
    throw new ApiError(403, "Chat access has been disabled by admin");
  }
}

export async function areUsersBlocked(userA, userB) {
  const block = await ChatBlock.findOne({
    kind: "user_block",
    $or: [
      { blockerId: userA, blockedId: userB },
      { blockerId: userB, blockedId: userA },
    ],
  }).lean();
  return Boolean(block);
}

export async function getConversationForUser(conversationId, userId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    isDeleted: false,
    "participants.userId": userId,
  });
  if (!conv) throw new ApiError(404, "Conversation not found");
  return conv;
}

export function getParticipant(conv, userId) {
  return conv.participants.find(
    (p) => p.userId.toString() === userId.toString()
  );
}

export function isGroupAdmin(conv, userId) {
  const p = getParticipant(conv, userId);
  return p?.role === "admin";
}

export function sanitizeMessageForUser(msg, userId) {
  if (!msg) return null;
  const deletedForEveryone = msg.deletedForEveryone;
  const deletedForMe = (msg.deletedFor || []).some(
    (id) => id.toString() === userId.toString()
  );
  if (deletedForMe) {
    return {
      ...msg,
      body: "You deleted this message",
      attachments: [],
      type: "system",
      deletedForMe: true,
    };
  }
  if (deletedForEveryone) {
    const placeholder =
      (msg.body && String(msg.body).trim()) ||
      "This message was deleted";
    return {
      ...msg,
      body: placeholder,
      attachments: [],
      type: "system",
      deletedForEveryone: true,
    };
  }
  return msg;
}

export function previewFromMessage(msg) {
  if (!msg) return { body: "", type: "text" };
  if (msg.deletedForEveryone) {
    return {
      body: (msg.body && String(msg.body).trim()) || "Message deleted",
      type: "system",
    };
  }
  switch (msg.type) {
    case "image":
      return { body: "📷 Photo", type: msg.type };
    case "video":
      return { body: "🎥 Video", type: msg.type };
    case "audio":
    case "voice":
      return { body: "🎤 Voice message", type: msg.type };
    case "file":
      return {
        body: `📎 ${msg.attachments?.[0]?.fileName || "File"}`,
        type: msg.type,
      };
    case "call":
      return { body: "📞 Call", type: msg.type };
    case "system":
      return { body: msg.body || "Update", type: msg.type };
    default:
      return { body: (msg.body || "").slice(0, 200), type: msg.type || "text" };
  }
}

export async function populateConversation(convDoc) {
  return Conversation.findById(convDoc._id || convDoc)
    .populate("participants.userId", USER_PUBLIC_SELECT)
    .populate("createdBy", USER_PUBLIC_SELECT)
    .populate("lastMessage.senderId", "fullName image")
    .lean();
}
