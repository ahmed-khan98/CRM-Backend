import mongoose from "mongoose";
import {
  Conversation,
  makeDirectKey,
} from "../models/chat/conversation.model.js";
import { ChatMessage } from "../models/chat/message.model.js";
import { CallLog } from "../models/chat/callLog.model.js";
import { ChatBlock } from "../models/chat/chatBlock.model.js";
import {
  ChatPresence,
  presenceMemory,
} from "../models/chat/chatPresence.model.js";
import { Employee } from "../models/employee.model.js";
import { PushSubscription } from "../models/pushSubscription.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadAttachmentOnCloudinary } from "../utils/cloudinary.js";
import {
  getArchiveLimitError,
  isArchiveFile,
  saveChatFileLocally,
} from "../utils/localFileStore.js";
import { emitToUser, emitToUsers, getIO } from "../utils/socket.js";
import { getVapidPublicKey } from "../utils/webPush.js";
import { chatService, MESSAGE_POPULATE } from "../utils/chatService.js";
import { sanitizeChatText } from "../utils/sanitizeChat.js";
import {
  USER_PUBLIC_SELECT,
  assertCanUseChat,
  areUsersBlocked,
  getConversationForUser,
  getParticipant,
  isGroupAdmin,
  sanitizeMessageForUser,
  previewFromMessage,
  populateConversation,
  escapeRegex,
} from "../utils/chatHelpers.js";

const ADMIN_ROLES = ["ADMIN", "SUBADMIN"];

const isCrmAdmin = (user) => ADMIN_ROLES.includes(user?.role);

async function populateMessage(id) {
  return chatService.populateMessage(id);
}

async function updateConversationLastMessage(conversationId, msg) {
  return chatService.updateConversationLastMessage(conversationId, msg);
}

function recipientIds(conv, excludeUserId) {
  return chatService.recipientIds(conv, excludeUserId);
}

// ─── Users search / presence ───────────────────────────────────────────────

export const searchChatUsers = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const q = (req.query.q || req.query.search || "").trim();
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const filter = {
    _id: { $ne: req.user._id },
    status: { $nin: ["block", "de active"] },
  };
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ fullName: re }, { email: re }, { phoneNo: re }];
  }
  const users = await Employee.find(filter)
    .select(USER_PUBLIC_SELECT)
    .limit(limit)
    .lean();

  const withPresence = users.map((u) => ({
    ...u,
    isOnline: presenceMemory.isOnline(u._id),
  }));

  // WhatsApp-style "Me" / Message yourself — show when search is empty
  // or matches me / myself / note / own name / email
  const me = await Employee.findById(req.user._id)
    .select(USER_PUBLIC_SELECT)
    .lean();
  if (me) {
    const qLower = q.toLowerCase();
    const showMe =
      !q ||
      ["me", "myself", "note", "notes"].includes(qLower) ||
      (me.fullName || "").toLowerCase().includes(qLower) ||
      (me.email || "").toLowerCase().includes(qLower);
    if (showMe) {
      withPresence.unshift({
        ...me,
        isOnline: true,
        isMe: true,
      });
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, withPresence, "Users fetched"));
});

export const getUserPresence = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const ids = String(req.query.userIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    return res.status(200).json(new ApiResponse(200, [], "Presence"));
  }
  const docs = await ChatPresence.find({ userId: { $in: ids } }).lean();
  const map = Object.fromEntries(docs.map((d) => [d.userId.toString(), d]));
  const result = ids.map((id) => {
    const online = presenceMemory.isOnline(id);
    const d = map[id];
    return {
      userId: id,
      status: online
        ? d?.status && d.status !== "offline"
          ? d.status
          : "online"
        : "offline",
      lastSeen: d?.lastSeen || null,
      isOnline: online,
    };
  });
  return res.status(200).json(new ApiResponse(200, result, "Presence"));
});

export const getMyChatProfile = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const emp = await Employee.findById(req.user._id)
    .select(USER_PUBLIC_SELECT)
    .populate("departmentId", "name")
    .lean();
  const presence = await ChatPresence.findOne({ userId: req.user._id }).lean();
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...emp,
        presence,
        isOnline: true,
      },
      "Profile"
    )
  );
});

// ─── Conversations ─────────────────────────────────────────────────────────

export const listConversations = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const userId = req.user._id;
  const archived = req.query.archived === "true";
  const filterPinned = req.query.pinned === "true";

  const convs = await Conversation.find({
    isDeleted: false,
    participants: {
      $elemMatch: {
        userId,
        archived,
        hidden: { $ne: true },
        ...(filterPinned ? { pinned: true } : {}),
      },
    },
  })
    .sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
    .populate("participants.userId", USER_PUBLIC_SELECT)
    .populate("createdBy", USER_PUBLIC_SELECT)
    .populate("lastMessage.senderId", "fullName image")
    .lean();

  const latestByConv = await chatService.latestMessageByConversationIds(
    convs.map((c) => c._id)
  );

  const enriched = await Promise.all(
    convs.map(async (c) => {
      const latest = latestByConv.get(String(c._id));
      if (latest) {
        const deletedForMe = (latest.deletedFor || []).some(
          (id) => String(id) === String(userId)
        );
        const preview = deletedForMe
          ? { body: "You deleted this message", type: "system" }
          : previewFromMessage(latest);
        c = {
          ...c,
          lastMessage: {
            ...(c.lastMessage || {}),
            messageId: latest.messageId,
            body: preview.body,
            type: preview.type,
            senderId: c.lastMessage?.senderId || latest.senderId,
            createdAt: latest.createdAt,
            deletedForEveryone: Boolean(latest.deletedForEveryone),
            deletedForMe,
          },
        };
      }
      const me = c.participants.find(
        (p) => p.userId?._id?.toString() === userId.toString()
      );
      const lastRead = me?.lastReadAt || new Date(0);
      const unread = await ChatMessage.countDocuments({
        conversationId: c._id,
        createdAt: { $gt: lastRead },
        senderId: { $ne: userId },
        deletedForEveryone: false,
        deletedFor: { $nin: [userId] },
      });
      return {
        ...c,
        unreadCount: unread,
        myMeta: me
          ? {
              pinned: me.pinned,
              archived: me.archived,
              muted: me.muted,
              role: me.role,
              lastReadAt: me.lastReadAt,
            }
          : null,
      };
    })
  );

  enriched.sort((a, b) => {
    const ap = a.myMeta?.pinned ? 1 : 0;
    const bp = b.myMeta?.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
    const bt = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
    return bt - at;
  });

  return res
    .status(200)
    .json(new ApiResponse(200, enriched, "Conversations fetched"));
});

export const getConversationById = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const populated = await populateConversation(conv);
  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Conversation found"));
});

export const createDirectConversation = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const { userId } = req.body;
  if (!userId) throw new ApiError(400, "userId is required");

  const isSelf = userId.toString() === req.user._id.toString();

  if (!isSelf) {
    await assertCanUseChat(userId);
    if (await areUsersBlocked(req.user._id, userId)) {
      throw new ApiError(403, "Unable to start chat with this user");
    }
  }

  const directKey = makeDirectKey(req.user._id, userId);
  let conv = await Conversation.findOne({ directKey, isDeleted: false });
  if (!conv) {
    try {
      conv = await Conversation.create({
        type: "direct",
        directKey,
        // Self-chat ("Message yourself"): single participant — like WhatsApp Notes
        participants: isSelf
          ? [{ userId: req.user._id, role: "member" }]
          : [
              { userId: req.user._id, role: "member" },
              { userId, role: "member" },
            ],
        createdBy: req.user._id,
      });
    } catch (err) {
      // Race: another request created the same directKey
      if (err?.code === 11000) {
        conv = await Conversation.findOne({ directKey, isDeleted: false });
      }
      if (!conv) {
        if (err?.name === "ValidationError") {
          throw new ApiError(400, err.message || "Invalid conversation");
        }
        throw err;
      }
    }
  }

  // Re-opening a chat that was deleted-for-me
  const me = getParticipant(conv, req.user._id);
  if (me?.hidden) {
    me.hidden = false;
    await conv.save();
  }

  const populated = await populateConversation(conv);
  return res
    .status(201)
    .json(new ApiResponse(201, populated, "Direct conversation ready"));
});

export const createGroupConversation = asyncHandler(async (req, res) => {
  // Open to every employee with chat access (USER, SUBADMIN, DEP_ADMIN, HR_ADMIN, FINANCE_ADMIN, ADMIN) — not CRM-admin-only
  await assertCanUseChat(req.user._id);
  const { name, description, memberIds = [], image } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Group name is required");
  const uniqueMembers = [
    ...new Set(
      [req.user._id.toString(), ...memberIds.map((id) => id.toString())].filter(
        Boolean
      )
    ),
  ];
  if (uniqueMembers.length < 2) {
    throw new ApiError(400, "Add at least one other member");
  }

  for (const mid of uniqueMembers) {
    if (mid !== req.user._id.toString()) {
      await assertCanUseChat(mid);
      if (await areUsersBlocked(req.user._id, mid)) {
        throw new ApiError(403, "One or more members cannot be added");
      }
    }
  }

  const participants = uniqueMembers.map((id) => ({
    userId: id,
    role: id === req.user._id.toString() ? "admin" : "member",
  }));

  // Unique sparse index on directKey collides if multiple docs store null
  await Conversation.updateMany(
    { directKey: null },
    { $unset: { directKey: 1 } }
  );

  let conv;
  try {
    conv = await Conversation.create({
      type: "group",
      name: name.trim(),
      description: description || "",
      image: image || "",
      participants,
      createdBy: req.user._id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      await Conversation.updateMany(
        { directKey: null },
        { $unset: { directKey: 1 } }
      );
      conv = await Conversation.create({
        type: "group",
        name: name.trim(),
        description: description || "",
        image: image || "",
        participants,
        createdBy: req.user._id,
      });
    } else {
      throw err;
    }
  }

  const systemMsg = await ChatMessage.create({
    conversationId: conv._id,
    senderId: req.user._id,
    type: "system",
    body: `${req.user.fullName || "Someone"} created the group`,
  });
  await updateConversationLastMessage(conv._id, systemMsg);

  const populated = await populateConversation(conv);
  emitToUsers(
    uniqueMembers.filter((id) => id !== req.user._id.toString()),
    "chat:conversation:new",
    populated
  );

  return res
    .status(201)
    .json(new ApiResponse(201, populated, "Group created"));
});

export const updateConversationMeta = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const me = getParticipant(conv, req.user._id);

  if (req.body.pinned !== undefined) {
    me.pinned = Boolean(req.body.pinned);
    me.pinnedAt = me.pinned ? new Date() : null;
  }
  if (req.body.archived !== undefined) {
    me.archived = Boolean(req.body.archived);
  }
  if (req.body.muted !== undefined) {
    me.muted = Boolean(req.body.muted);
  }

  if (conv.type === "group" && isGroupAdmin(conv, req.user._id)) {
    if (req.body.name !== undefined) conv.name = String(req.body.name).trim();
    if (req.body.description !== undefined)
      conv.description = String(req.body.description);
    if (req.body.image !== undefined) conv.image = req.body.image || "";
  }

  await conv.save();
  const populated = await populateConversation(conv);
  emitToUsers(recipientIds(conv, "none"), "chat:conversation:updated", populated);
  return res
    .status(200)
    .json(new ApiResponse(200, populated, "Conversation updated"));
});

// ─── Group members ─────────────────────────────────────────────────────────

export const addGroupMembers = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  if (conv.type !== "group") throw new ApiError(400, "Not a group");
  if (!isGroupAdmin(conv, req.user._id) && !isCrmAdmin(req.user)) {
    throw new ApiError(403, "Only admins can add members");
  }
  const { memberIds = [] } = req.body;
  const joinedAt = new Date();
  const addedIds = [];
  for (const mid of memberIds) {
    if (getParticipant(conv, mid)) continue;
    await assertCanUseChat(mid);
    // joinedAt gates history — new members only see messages from join time onward
    conv.participants.push({ userId: mid, role: "member", joinedAt });
    addedIds.push(mid.toString());
  }
  if (!addedIds.length) {
    return res.status(200).json(
      new ApiResponse(200, await populateConversation(conv), "No new members")
    );
  }
  await conv.save();

  const addedPeople = await Employee.find({ _id: { $in: addedIds } })
    .select("fullName")
    .lean();
  const names = addedPeople.map((p) => p.fullName || "Someone");
  let whoAdded;
  if (names.length === 1) whoAdded = names[0];
  else if (names.length === 2) whoAdded = `${names[0]} and ${names[1]}`;
  else
    whoAdded = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const by = req.user.fullName || "admin";
  const systemBody =
    names.length === 1
      ? `${whoAdded} was added by ${by}`
      : `${whoAdded} were added by ${by}`;

  const systemMsg = await ChatMessage.create({
    conversationId: conv._id,
    senderId: req.user._id,
    type: "system",
    body: systemBody,
  });
  await updateConversationLastMessage(conv._id, systemMsg);
  const populatedMsg = await populateMessage(systemMsg._id);
  const io = getIO();
  if (io) {
    io.to(`conv:${conv._id}`).emit("chat:message:new", populatedMsg);
  }

  const populated = await populateConversation(conv);
  emitToUsers(
    conv.participants.map((p) => p.userId),
    "chat:conversation:updated",
    populated
  );
  // Newly added members also need the conversation list entry
  emitToUsers(addedIds, "chat:conversation:new", populated);
  return res.status(200).json(new ApiResponse(200, populated, "Members added"));
});

export const removeGroupMember = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  if (conv.type !== "group") throw new ApiError(400, "Not a group");
  const targetId = req.params.userId;
  const isSelf = targetId === req.user._id.toString();
  if (!isSelf && !isGroupAdmin(conv, req.user._id) && !isCrmAdmin(req.user)) {
    throw new ApiError(403, "Only admins can remove members");
  }

  const target = getParticipant(conv, targetId);
  if (!target) throw new ApiError(404, "Member not found");

  conv.participants = conv.participants.filter(
    (p) => p.userId.toString() !== targetId
  );

  if (conv.participants.length < 2) {
    conv.isDeleted = true;
  } else if (!conv.participants.some((p) => p.role === "admin")) {
    // Keep a group admin if the last admin left / was removed
    conv.participants[0].role = "admin";
  }

  await conv.save();

  let removedName = "a member";
  try {
    const removed = await Employee.findById(targetId).select("fullName").lean();
    if (removed?.fullName) removedName = removed.fullName;
  } catch {
    /* ignore */
  }

  const systemMsg = await ChatMessage.create({
    conversationId: conv._id,
    senderId: req.user._id,
    type: "system",
    body: isSelf
      ? `${req.user.fullName || "Someone"} left the group`
      : `${req.user.fullName || "Admin"} removed ${removedName}`,
  });
  await updateConversationLastMessage(conv._id, systemMsg);

  const populated = await populateConversation(conv);
  emitToUser(targetId, "chat:conversation:removed", {
    conversationId: conv._id,
  });
  emitToUsers(
    conv.participants.map((p) => p.userId),
    "chat:conversation:updated",
    populated
  );
  return res
    .status(200)
    .json(new ApiResponse(200, populated, isSelf ? "Left group" : "Member removed"));
});

/** Soft-delete / clear entire chat for the current user only */
export const deleteChatForMe = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const me = getParticipant(conv, req.user._id);
  if (!me) throw new ApiError(404, "Conversation not found");

  const clearedAt = new Date();
  me.hidden = true;
  me.clearedAt = clearedAt;
  me.archived = false;
  await conv.save();

  await ChatMessage.updateMany(
    {
      conversationId: conv._id,
      createdAt: { $lte: clearedAt },
      deletedFor: { $ne: req.user._id },
    },
    { $addToSet: { deletedFor: req.user._id } }
  );

  emitToUser(req.user._id, "chat:conversation:removed", {
    conversationId: conv._id,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { conversationId: conv._id }, "Chat deleted"));
});

export const setMemberRole = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  if (conv.type !== "group") throw new ApiError(400, "Not a group");
  if (!isGroupAdmin(conv, req.user._id) && !isCrmAdmin(req.user)) {
    throw new ApiError(403, "Only admins can change roles");
  }
  const { role } = req.body;
  if (!["admin", "member"].includes(role)) {
    throw new ApiError(400, "Invalid role");
  }
  const target = getParticipant(conv, req.params.userId);
  if (!target) throw new ApiError(404, "Member not found");
  target.role = role;
  await conv.save();
  const populated = await populateConversation(conv);
  emitToUsers(
    conv.participants.map((p) => p.userId),
    "chat:conversation:updated",
    populated
  );
  return res.status(200).json(new ApiResponse(200, populated, "Role updated"));
});

export const deleteGroup = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  if (conv.type !== "group") throw new ApiError(400, "Not a group");
  if (!isGroupAdmin(conv, req.user._id) && !isCrmAdmin(req.user)) {
    throw new ApiError(403, "Only admins can delete the group");
  }
  const memberIds = conv.participants.map((p) => p.userId);
  conv.isDeleted = true;
  await conv.save();
  emitToUsers(memberIds, "chat:conversation:removed", {
    conversationId: conv._id,
  });
  return res.status(200).json(new ApiResponse(200, null, "Group deleted"));
});

// ─── Messages ──────────────────────────────────────────────────────────────

export const listMessages = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const me = getParticipant(conv, req.user._id);
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const before = req.query.before;
  const after = req.query.after;

  const filter = {
    conversationId: conv._id,
  };

  // Hide history before join (new group members) and/or after clear-chat
  const lowerBounds = [];
  if (me?.joinedAt) lowerBounds.push(new Date(me.joinedAt).getTime());
  if (me?.clearedAt) lowerBounds.push(new Date(me.clearedAt).getTime());
  if (lowerBounds.length) {
    filter.createdAt = { $gte: new Date(Math.max(...lowerBounds)) };
  }

  if (before && mongoose.isValidObjectId(before)) {
    const ref = await ChatMessage.findById(before).select("createdAt").lean();
    if (ref) filter.createdAt = { ...(filter.createdAt || {}), $lt: ref.createdAt };
  }
  if (after && mongoose.isValidObjectId(after)) {
    const ref = await ChatMessage.findById(after).select("createdAt").lean();
    if (ref) filter.createdAt = { ...(filter.createdAt || {}), $gt: ref.createdAt };
  }

  let q = ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit);
  for (const p of MESSAGE_POPULATE) q = q.populate(p);
  const items = await q.lean();
  const sanitized = items
    .map((m) => sanitizeMessageForUser(m, req.user._id))
    .filter(Boolean)
    .reverse();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        items: sanitized,
        hasMore: items.length === limit,
      },
      "Messages fetched"
    )
  );
});

export const sendMessageHttp = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const {
    body = "",
    type = "text",
    replyTo,
    mentions = [],
    attachments = [],
    clientId,
  } = req.body;

  if (
    !body.trim() &&
    (!attachments || attachments.length === 0) &&
    type === "text"
  ) {
    throw new ApiError(400, "Message cannot be empty");
  }

  // Block check for direct
  if (conv.type === "direct") {
    const other = conv.participants.find(
      (p) => p.userId.toString() !== req.user._id.toString()
    );
    if (other && (await areUsersBlocked(req.user._id, other.userId))) {
      throw new ApiError(403, "You cannot message this user");
    }
  }

  const receipts = recipientIds(conv, req.user._id).map((uid) => ({
    userId: uid,
    deliveredAt: presenceMemory.isOnline(uid) ? new Date() : null,
    seenAt: null,
  }));

  const msg = await ChatMessage.create({
    conversationId: conv._id,
    senderId: req.user._id,
    type,
    body: sanitizeChatText(body || ""),
    replyTo: replyTo || null,
    mentions,
    attachments,
    receipts,
  });

  await updateConversationLastMessage(conv._id, msg);

  // Unhide for participants who deleted-for-me (new activity brings chat back)
  let dirty = false;
  for (const p of conv.participants) {
    if (p.hidden) {
      p.hidden = false;
      dirty = true;
    }
  }

  // bump sender lastRead
  const me = getParticipant(conv, req.user._id);
  if (me) {
    me.lastReadAt = new Date();
    me.lastDeliveredAt = new Date();
    dirty = true;
  }
  if (dirty) await conv.save();

  const populated = await populateMessage(msg._id);
  const payload = { ...populated, clientId };

  const io = getIO();
  if (io) {
    io.to(`conv:${conv._id}`).emit("chat:message:new", payload);
  }
  emitToUsers(recipientIds(conv, req.user._id), "chat:message:new", payload);
  emitToUsers(recipientIds(conv, req.user._id), "chat:conversation:bump", {
    conversationId: conv._id,
    lastMessage: previewFromMessage(msg),
    senderId: req.user._id,
  });

  return res.status(201).json(new ApiResponse(201, payload, "Message sent"));
});

export const editMessage = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const msg = await ChatMessage.findById(req.params.messageId);
  if (!msg) throw new ApiError(404, "Message not found");
  await getConversationForUser(msg.conversationId, req.user._id);
  if (msg.senderId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only edit your messages");
  }
  if (msg.deletedForEveryone) throw new ApiError(400, "Message was deleted");
  if (!["text"].includes(msg.type)) {
    throw new ApiError(400, "Only text messages can be edited");
  }
  msg.body = sanitizeChatText(req.body.body || "");
  msg.editedAt = new Date();
  await msg.save();
  const populated = await populateMessage(msg._id);
  const io = getIO();
  if (io) io.to(`conv:${msg.conversationId}`).emit("chat:message:updated", populated);
  emitToUsers(
    (await Conversation.findById(msg.conversationId)).participants.map(
      (p) => p.userId
    ),
    "chat:message:updated",
    populated
  );
  return res.status(200).json(new ApiResponse(200, populated, "Message edited"));
});

export const deleteMessage = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const msg = await ChatMessage.findById(req.params.messageId);
  if (!msg) throw new ApiError(404, "Message not found");
  const conv = await getConversationForUser(msg.conversationId, req.user._id);
  const forEveryone = req.body?.forEveryone === true || req.query.forEveryone === "true";

  if (forEveryone) {
    const can =
      msg.senderId.toString() === req.user._id.toString() ||
      isCrmAdmin(req.user) ||
      (conv.type === "group" && isGroupAdmin(conv, req.user._id));
    if (!can) throw new ApiError(403, "Not allowed to delete for everyone");
    const deleterName = req.user.fullName || "Someone";
    msg.deletedForEveryone = true;
    msg.deletedAt = new Date();
    msg.deletedBy = req.user._id;
    msg.body = `${deleterName} deleted this message`;
    msg.attachments = [];
  } else {
    if (!msg.deletedFor.some((id) => id.toString() === req.user._id.toString())) {
      msg.deletedFor.push(req.user._id);
    }
  }
  await msg.save();
  if (forEveryone) {
    await chatService.refreshConversationLastMessage(conv._id);
  }
  const populated = await populateMessage(msg._id);
  const io = getIO();
  const deletedPayload = {
    messageId: msg._id,
    conversationId: msg.conversationId,
    forEveryone,
    message: sanitizeMessageForUser(populated, req.user._id),
  };
  if (forEveryone) {
    if (io) io.to(`conv:${msg.conversationId}`).emit("chat:message:deleted", deletedPayload);
    emitToUsers(recipientIds(conv, "none"), "chat:conversation:updated", {
      _id: conv._id,
    });
  } else {
    emitToUser(req.user._id, "chat:message:deleted", deletedPayload);
  }
  return res.status(200).json(new ApiResponse(200, populated, "Message deleted"));
});

export const reactToMessage = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const { emoji } = req.body;
  if (!emoji) throw new ApiError(400, "emoji is required");
  const msg = await ChatMessage.findById(req.params.messageId);
  if (!msg) throw new ApiError(404, "Message not found");
  await getConversationForUser(msg.conversationId, req.user._id);

  const existing = msg.reactions.findIndex(
    (r) =>
      r.userId.toString() === req.user._id.toString() && r.emoji === emoji
  );
  if (existing >= 0) {
    msg.reactions.splice(existing, 1);
  } else {
    msg.reactions = msg.reactions.filter(
      (r) => r.userId.toString() !== req.user._id.toString()
    );
    msg.reactions.push({ emoji, userId: req.user._id });
  }
  await msg.save();
  const populated = await populateMessage(msg._id);
  const io = getIO();
  if (io) io.to(`conv:${msg.conversationId}`).emit("chat:message:updated", populated);
  return res.status(200).json(new ApiResponse(200, populated, "Reaction updated"));
});

export const starMessage = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const msg = await ChatMessage.findById(req.params.messageId);
  if (!msg) throw new ApiError(404, "Message not found");
  await getConversationForUser(msg.conversationId, req.user._id);
  const idx = msg.starredBy.findIndex(
    (id) => id.toString() === req.user._id.toString()
  );
  if (idx >= 0) msg.starredBy.splice(idx, 1);
  else msg.starredBy.push(req.user._id);
  await msg.save();
  const populated = await populateMessage(msg._id);
  return res.status(200).json(new ApiResponse(200, populated, "Star toggled"));
});

export const forwardMessage = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const { targetConversationIds = [] } = req.body;
  const src = await ChatMessage.findById(req.params.messageId);
  if (!src) throw new ApiError(404, "Message not found");
  await getConversationForUser(src.conversationId, req.user._id);

  const created = [];
  for (const cid of targetConversationIds) {
    const conv = await getConversationForUser(cid, req.user._id);
    const receipts = recipientIds(conv, req.user._id).map((uid) => ({
      userId: uid,
      deliveredAt: presenceMemory.isOnline(uid) ? new Date() : null,
    }));
    const msg = await ChatMessage.create({
      conversationId: conv._id,
      senderId: req.user._id,
      type: src.type,
      body: src.body,
      attachments: src.attachments,
      forwardedFrom: {
        messageId: src._id,
        conversationId: src.conversationId,
        senderId: src.senderId,
      },
      receipts,
    });
    await updateConversationLastMessage(conv._id, msg);
    const populated = await populateMessage(msg._id);
    created.push(populated);
    emitToUsers(recipientIds(conv, req.user._id), "chat:message:new", populated);
    const io = getIO();
    if (io) io.to(`conv:${conv._id}`).emit("chat:message:new", populated);
  }
  return res
    .status(201)
    .json(new ApiResponse(201, created, "Message forwarded"));
});

export const markConversationRead = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const me = getParticipant(conv, req.user._id);
  const now = new Date();
  me.lastReadAt = now;
  me.lastDeliveredAt = now;
  await conv.save();

  await ChatMessage.updateMany(
    {
      conversationId: conv._id,
      senderId: { $ne: req.user._id },
      "receipts.userId": req.user._id,
      "receipts.seenAt": null,
    },
    { $set: { "receipts.$[r].seenAt": now, "receipts.$[r].deliveredAt": now } },
    { arrayFilters: [{ "r.userId": req.user._id }] }
  );

  emitToUsers(recipientIds(conv, req.user._id), "chat:message:seen", {
    conversationId: conv._id,
    userId: req.user._id,
    seenAt: now,
  });

  return res.status(200).json(new ApiResponse(200, { seenAt: now }, "Marked read"));
});

export const searchMessages = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const q = (req.query.q || "").trim();
  const conversationId = req.query.conversationId;
  const senderId = req.query.senderId;
  const fileType = req.query.fileType;
  const from = req.query.from;
  const to = req.query.to;
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const myConvs = await Conversation.find({
    isDeleted: false,
    "participants.userId": req.user._id,
    ...(conversationId ? { _id: conversationId } : {}),
  })
    .select("_id")
    .lean();
  const convIds = myConvs.map((c) => c._id);
  if (!convIds.length) {
    return res.status(200).json(new ApiResponse(200, [], "No results"));
  }

  const filter = {
    conversationId: { $in: convIds },
    deletedForEveryone: false,
    deletedFor: { $nin: [req.user._id] },
  };
  if (q) filter.$text = { $search: q };
  if (senderId) filter.senderId = senderId;
  if (fileType) {
    if (["image", "video", "audio", "voice", "file"].includes(fileType)) {
      filter.type = fileType;
    }
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  let query = ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit);
  for (const p of MESSAGE_POPULATE) query = query.populate(p);
  const items = await query.lean();
  return res.status(200).json(new ApiResponse(200, items, "Search results"));
});

export const getSharedMedia = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const conv = await getConversationForUser(req.params.id, req.user._id);
  const me = getParticipant(conv, req.user._id);
  const kind = req.query.kind || "media";
  const limit = Math.min(Number(req.query.limit) || 40, 100);

  const baseFilter = {
    conversationId: conv._id,
    deletedForEveryone: false,
    deletedFor: { $nin: [req.user._id] },
  };
  const lowerBounds = [];
  if (me?.joinedAt) lowerBounds.push(new Date(me.joinedAt).getTime());
  if (me?.clearedAt) lowerBounds.push(new Date(me.clearedAt).getTime());
  if (lowerBounds.length) {
    baseFilter.createdAt = { $gte: new Date(Math.max(...lowerBounds)) };
  }

  let typeFilter;
  if (kind === "photos" || kind === "media") typeFilter = null; // handled below
  else if (kind === "videos") typeFilter = ["video"];
  else if (kind === "docs" || kind === "files") typeFilter = ["file"];
  else if (kind === "voice") typeFilter = ["voice", "audio"];
  else if (kind === "links") {
    const msgs = await ChatMessage.find({
      ...baseFilter,
      type: "text",
      body: { $regex: /https?:\/\//i },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "fullName image")
      .lean();
    return res.status(200).json(new ApiResponse(200, msgs, "Links"));
  } else {
    typeFilter = ["image", "video", "file", "voice", "audio"];
  }

  if (kind === "media" || kind === "photos") {
    // media = images + videos (WhatsApp "Media" tab)
    typeFilter = kind === "photos" ? ["image"] : ["image", "video"];
  }

  const items = await ChatMessage.find({
    ...baseFilter,
    type: { $in: typeFilter },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "fullName image")
    .lean();

  return res.status(200).json(new ApiResponse(200, items, "Shared media"));
});

export const uploadChatAttachment = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  if (!req.file) throw new ApiError(400, "File is required");

  const archiveError = getArchiveLimitError(req.file);
  if (archiveError) throw new ApiError(413, archiveError);

  // Cloudinary free plan blocks or poorly handles zip/rar. Keep those on the VPS.
  let uploaded;
  if (isArchiveFile(req.file.originalname, req.file.mimetype)) {
    uploaded = saveChatFileLocally(req.file, req);
  } else {
    uploaded = await uploadAttachmentOnCloudinary(req.file);
    if (uploaded?.error || !(uploaded.url || uploaded.secure_url)) {
      throw new ApiError(413, uploaded?.error || "Upload failed");
    }
  }

  // Prefer secure_url — Cloudinary's `.url` is http and causes mixed-content on HTTPS FE
  const fileUrl = (uploaded.secure_url || uploaded.url || "").replace(
    /^http:\/\//i,
    "https://"
  );
  if (!fileUrl) throw new ApiError(500, "Upload failed");

  const mime = req.file.mimetype || "";
  const name = (req.file.originalname || "").toLowerCase();
  // Only treat explicit voice recordings as voice (voice-*.webm from recorder)
  const isVoiceName = /^voice[-_]/.test(name);
  const isAudioExt = /\.(webm|ogg|mp3|m4a|wav|aac|opus)$/i.test(name);
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");

  let type = "file";
  if (mime.startsWith("image/")) type = "image";
  else if (mime.startsWith("video/") && !mime.startsWith("audio/")) type = "video";
  else if (mime.startsWith("audio/") || (isAudioExt && !isPdf)) {
    type = isVoiceName ? "voice" : "audio";
  } else if (isPdf) {
    type = "file";
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        type,
        attachment: {
          url: fileUrl,
          publicId: uploaded.public_id || "",
          resourceType: uploaded.resource_type || "raw",
          fileName: req.file.originalname,
          mimeType: mime || (isAudioExt ? "audio/webm" : ""),
          size: req.file.size || 0,
        },
      },
      "Uploaded"
    )
  );
});

// ─── Call logs ─────────────────────────────────────────────────────────────

export const listCallLogs = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const userId = req.user._id;
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const items = await CallLog.find({
    $or: [{ callerId: userId }, { calleeIds: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("callerId", USER_PUBLIC_SELECT)
    .populate("calleeIds", USER_PUBLIC_SELECT)
    .lean();
  return res.status(200).json(new ApiResponse(200, items, "Call history"));
});

export const getIceServers = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const stun = (process.env.WEBRTC_STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));

  const turnUrls = (process.env.WEBRTC_TURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const iceServers = [...stun];
  if (turnUrls.length && process.env.WEBRTC_TURN_USERNAME) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.WEBRTC_TURN_USERNAME,
      credential: process.env.WEBRTC_TURN_CREDENTIAL || "",
    });
  }
  return res.status(200).json(new ApiResponse(200, { iceServers }, "ICE config"));
});

// ─── Blocks / admin ────────────────────────────────────────────────────────

export const blockUser = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const { userId, reason } = req.body;
  if (!userId) throw new ApiError(400, "userId required");
  await ChatBlock.findOneAndUpdate(
    { blockerId: req.user._id, blockedId: userId, kind: "user_block" },
    { reason: reason || "" },
    { upsert: true, new: true }
  );
  return res.status(200).json(new ApiResponse(200, null, "User blocked"));
});

export const unblockUser = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  await ChatBlock.deleteOne({
    blockerId: req.user._id,
    blockedId: req.params.userId,
    kind: "user_block",
  });
  return res.status(200).json(new ApiResponse(200, null, "User unblocked"));
});

export const listBlockedUsers = asyncHandler(async (req, res) => {
  await assertCanUseChat(req.user._id);
  const items = await ChatBlock.find({
    blockerId: req.user._id,
    kind: "user_block",
  })
    .populate("blockedId", USER_PUBLIC_SELECT)
    .lean();
  return res.status(200).json(new ApiResponse(200, items, "Blocked list"));
});

export const adminDisableChat = asyncHandler(async (req, res) => {
  if (!isCrmAdmin(req.user)) throw new ApiError(403, "Admin only");
  const { userId, reason } = req.body;
  if (!userId) throw new ApiError(400, "userId required");
  await ChatBlock.findOneAndUpdate(
    {
      blockerId: req.user._id,
      blockedId: userId,
      kind: "admin_disable",
    },
    { reason: reason || "Disabled by admin" },
    { upsert: true, new: true }
  );
  emitToUser(userId, "chat:access:disabled", { reason });
  return res.status(200).json(new ApiResponse(200, null, "Chat disabled"));
});

export const adminEnableChat = asyncHandler(async (req, res) => {
  if (!isCrmAdmin(req.user)) throw new ApiError(403, "Admin only");
  await ChatBlock.deleteMany({
    blockedId: req.params.userId,
    kind: "admin_disable",
  });
  emitToUser(req.params.userId, "chat:access:enabled", {});
  return res.status(200).json(new ApiResponse(200, null, "Chat enabled"));
});

export const adminDeleteMessage = asyncHandler(async (req, res) => {
  if (!isCrmAdmin(req.user)) throw new ApiError(403, "Admin only");
  const msg = await ChatMessage.findById(req.params.messageId);
  if (!msg) throw new ApiError(404, "Message not found");
  const deleterName = req.user.fullName || "Admin";
  msg.deletedForEveryone = true;
  msg.deletedAt = new Date();
  msg.deletedBy = req.user._id;
  msg.body = `${deleterName} deleted this message`;
  msg.attachments = [];
  await msg.save();
  const conv = await Conversation.findById(msg.conversationId);
  if (conv) await chatService.refreshConversationLastMessage(conv._id);
  const populated = await populateMessage(msg._id);
  const io = getIO();
  if (io) {
    io.to(`conv:${msg.conversationId}`).emit("chat:message:deleted", {
      messageId: msg._id,
      conversationId: msg.conversationId,
      forEveryone: true,
      message: sanitizeMessageForUser(populated, req.user._id),
    });
  }
  if (conv) {
    emitToUsers(recipientIds(conv, "none"), "chat:conversation:updated", {
      _id: conv._id,
    });
  }
  return res.status(200).json(new ApiResponse(200, populated, "Message deleted"));
});

// ─── Web Push (background/closed-app call alerts) ──────────────────────────

export const getPushVapidPublicKey = asyncHandler(async (req, res) => {
  const key = getVapidPublicKey();
  if (!key) throw new ApiError(500, "Push notifications not configured");
  return res.status(200).json(new ApiResponse(200, { publicKey: key }));
});

export const subscribePush = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new ApiError(400, "Invalid push subscription");
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      userId: req.user._id,
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userAgent: (req.headers["user-agent"] || "").slice(0, 300),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.status(200).json(new ApiResponse(200, null, "Subscribed"));
});

export const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) throw new ApiError(400, "endpoint required");
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  return res.status(200).json(new ApiResponse(200, null, "Unsubscribed"));
});

/** Internal helper used by sockets — see utils/chatService.js */
export { chatService } from "../utils/chatService.js";
