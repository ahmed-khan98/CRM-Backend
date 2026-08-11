import { ChatMessage } from "../models/chat/message.model.js";
import { CallLog } from "../models/chat/callLog.model.js";
import { sanitizeChatText } from "../utils/sanitizeChat.js";
import {
  ChatPresence,
  presenceMemory,
} from "../models/chat/chatPresence.model.js";
import { Notification } from "../models/notification.model.js";
import { Employee } from "../models/employee.model.js";
import { emitToUser, emitToUsers } from "../utils/socket.js";
import { chatService } from "../utils/chatService.js";
import {
  getConversationForUser,
  previewFromMessage,
  areUsersBlocked,
  isChatDisabled,
} from "../utils/chatHelpers.js";

// callId -> { callerId, calleeIds, joinedIds, conversationId, callType, isGroupCall }
const activeCalls = new Map();

async function setPresence(userId, status, extra = {}) {
  const doc = await ChatPresence.findOneAndUpdate(
    { userId },
    {
      $set: {
        status,
        lastSeen: new Date(),
        ...extra,
      },
    },
    { upsert: true, new: true }
  ).lean();
  return doc;
}

function broadcastPresence(userId, payload) {
  emitToUsers(
    // lightweight: broadcast via io later; for now emit to all connected is heavy —
    // clients request presence for visible users. Still emit a global-ish event on user room peers.
    [],
    "chat:presence",
    payload
  );
  // Emit on a presence channel by having clients listen after knowing user ids —
  // use io from getIO for broadcast
}

export function registerChatSockets(io, socket) {
  const userId = socket.userId;

  socket.on("chat:join", async (payload = {}, ack) => {
    try {
      if (await isChatDisabled(userId)) {
        ack?.({ ok: false, error: "Chat disabled" });
        return;
      }
      const { conversationId } = payload;
      if (!conversationId) {
        ack?.({ ok: false, error: "conversationId required" });
        return;
      }
      await getConversationForUser(conversationId, userId);
      socket.join(`conv:${conversationId}`);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("chat:leave", (payload = {}) => {
    if (payload.conversationId) {
      socket.leave(`conv:${payload.conversationId}`);
    }
  });

  socket.on("chat:typing", async (payload = {}) => {
    try {
      const { conversationId, isTyping } = payload;
      if (!conversationId) return;
      await getConversationForUser(conversationId, userId);
      socket.to(`conv:${conversationId}`).emit("chat:typing", {
        conversationId,
        userId,
        isTyping: Boolean(isTyping),
      });
      await setPresence(userId, isTyping ? "online" : "online", {
        typingIn: isTyping ? conversationId : null,
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("chat:recording", async (payload = {}) => {
    try {
      const { conversationId, isRecording } = payload;
      if (!conversationId) return;
      await getConversationForUser(conversationId, userId);
      socket.to(`conv:${conversationId}`).emit("chat:recording", {
        conversationId,
        userId,
        isRecording: Boolean(isRecording),
      });
      if (isRecording) await setPresence(userId, "recording");
      else await setPresence(userId, "online");
    } catch {
      /* ignore */
    }
  });

  socket.on("chat:message:send", async (payload = {}, ack) => {
    try {
      if (await isChatDisabled(userId)) {
        ack?.({ ok: false, error: "Chat disabled" });
        return;
      }
      const {
        conversationId,
        body = "",
        type = "text",
        replyTo,
        mentions = [],
        attachments = [],
        clientId,
      } = payload;
      const conv = await getConversationForUser(conversationId, userId);

      if (conv.type === "direct") {
        const other = conv.participants.find(
          (p) => p.userId.toString() !== userId
        );
        if (other && (await areUsersBlocked(userId, other.userId))) {
          ack?.({ ok: false, error: "Blocked" });
          return;
        }
      }

      if (!String(body).trim() && !(attachments?.length) && type === "text") {
        ack?.({ ok: false, error: "Empty message" });
        return;
      }

      const receipts = chatService
        .recipientIds(conv, userId)
        .map((uid) => ({
          userId: uid,
          deliveredAt: presenceMemory.isOnline(uid) ? new Date() : null,
          seenAt: null,
        }));

      const msg = await ChatMessage.create({
        conversationId: conv._id,
        senderId: userId,
        type,
        body: sanitizeChatText(body || ""),
        replyTo: replyTo || null,
        mentions,
        attachments,
        receipts,
      });
      await chatService.updateConversationLastMessage(conv._id, msg);

      let dirty = false;
      for (const p of conv.participants) {
        if (p.hidden) {
          p.hidden = false;
          dirty = true;
        }
      }
      const me = conv.participants.find(
        (p) => p.userId.toString() === userId
      );
      if (me) {
        me.lastReadAt = new Date();
        dirty = true;
      }
      if (dirty) await conv.save();

      const populated = await chatService.populateMessage(msg._id);
      const out = { ...populated, clientId };

      io.to(`conv:${conv._id}`).emit("chat:message:new", out);
      emitToUsers(
        chatService.recipientIds(conv, userId),
        "chat:message:new",
        out
      );

      // Notifications for offline / muted
      const sender = await Employee.findById(userId).select("fullName").lean();
      for (const p of conv.participants) {
        const pid = p.userId.toString();
        if (pid === userId) continue;
        if (p.muted) continue;
        const isMention =
          Array.isArray(mentions) &&
          mentions.some((m) => m.toString() === pid);
        const notif = await Notification.create({
          recipient: pid,
          title: isMention
            ? "You were mentioned"
            : conv.type === "group"
              ? conv.name || "Group"
              : sender?.fullName || "New message",
          message: previewFromMessage(msg).body,
          type: isMention ? "CHAT_MENTION" : "CHAT_MESSAGE",
          conversationId: conv._id,
          messageId: msg._id,
          createdBy: userId,
        });
        emitToUser(pid, "notification:new", notif);
      }

      ack?.({ ok: true, message: out });
    } catch (err) {
      ack?.({ ok: false, error: err.message || "Failed to send" });
    }
  });

  socket.on("chat:delivered", async (payload = {}) => {
    try {
      const { conversationId, messageIds = [] } = payload;
      if (!conversationId) return;
      await getConversationForUser(conversationId, userId);
      const now = new Date();
      await ChatMessage.updateMany(
        {
          _id: { $in: messageIds },
          conversationId,
          "receipts.userId": userId,
        },
        { $set: { "receipts.$[r].deliveredAt": now } },
        { arrayFilters: [{ "r.userId": userId, "r.deliveredAt": null }] }
      );
      socket.to(`conv:${conversationId}`).emit("chat:message:delivered", {
        conversationId,
        userId,
        messageIds,
        deliveredAt: now,
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("chat:seen", async (payload = {}) => {
    try {
      const { conversationId } = payload;
      if (!conversationId) return;
      const conv = await getConversationForUser(conversationId, userId);
      const me = conv.participants.find(
        (p) => p.userId.toString() === userId
      );
      const now = new Date();
      if (me) {
        me.lastReadAt = now;
        me.lastDeliveredAt = now;
        await conv.save();
      }
      await ChatMessage.updateMany(
        {
          conversationId,
          senderId: { $ne: userId },
          "receipts.userId": userId,
        },
        {
          $set: {
            "receipts.$[r].seenAt": now,
            "receipts.$[r].deliveredAt": now,
          },
        },
        { arrayFilters: [{ "r.userId": userId }] }
      );
      socket.to(`conv:${conversationId}`).emit("chat:message:seen", {
        conversationId,
        userId,
        seenAt: now,
      });
      emitToUsers(chatService.recipientIds(conv, userId), "chat:message:seen", {
        conversationId,
        userId,
        seenAt: now,
      });
    } catch {
      /* ignore */
    }
  });

  // ─── WebRTC signaling ────────────────────────────────────────────────────

  socket.on("call:invite", async (payload = {}, ack) => {
    try {
      const { conversationId, callType = "voice", calleeId, sdpOffer } = payload;
      const conv = await getConversationForUser(conversationId, userId);
      let callees = [];
      if (calleeId) callees = [calleeId];
      else {
        callees = chatService.recipientIds(conv, userId);
      }
      if (!callees.length) {
        ack?.({ ok: false, error: "No callee" });
        return;
      }

      const isGroupCall = conv.type === "group" && !calleeId;

      const log = await CallLog.create({
        conversationId: conv._id,
        callerId: userId,
        calleeIds: callees,
        callType: callType === "video" ? "video" : "voice",
        isGroupCall,
        status: "ringing",
        startedAt: new Date(),
      });

      activeCalls.set(log._id.toString(), {
        callerId: String(userId),
        calleeIds: callees.map(String),
        joinedIds: [],
        conversationId: conv._id.toString(),
        callType: log.callType,
        isGroupCall,
      });

      await setPresence(userId, "in_call");

      const caller = await Employee.findById(userId)
        .select("fullName image")
        .lean();

      const groupName = isGroupCall ? conv.name || "Group" : null;
      const groupImage = isGroupCall ? conv.image || "" : null;

      for (const cid of callees) {
        emitToUser(cid, "call:incoming", {
          callId: log._id,
          conversationId: conv._id,
          callType: log.callType,
          caller,
          sdpOffer,
          groupCall: isGroupCall,
          groupName,
          groupImage,
        });
        const notif = await Notification.create({
          recipient: cid,
          title: isGroupCall ? "Incoming group call" : "Incoming call",
          message: isGroupCall
            ? `${caller?.fullName || "Someone"} is calling in ${groupName} (${log.callType})`
            : `${caller?.fullName || "Someone"} is calling (${log.callType})`,
          type: "INCOMING_CALL",
          conversationId: conv._id,
          callLogId: log._id,
          createdBy: userId,
        });
        emitToUser(cid, "notification:new", notif);
      }

      ack?.({ ok: true, callId: log._id });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("call:accept", async (payload = {}, ack) => {
    try {
      const { callId } = payload;
      const log = await CallLog.findById(callId).populate(
        "conversationId",
        "type name"
      );
      if (!log) {
        ack?.({ ok: false, error: "Call not found" });
        return;
      }
      if (log.status === "ended" || log.status === "rejected" || log.status === "missed") {
        ack?.({ ok: false, error: "Call already ended" });
        return;
      }

      const active = activeCalls.get(callId.toString());
      const conv = log.conversationId;
      // Prefer persisted flag so group never mis-classified as 1:1
      const isGroupCall = Boolean(
        log.isGroupCall ||
          active?.isGroupCall ||
          (conv && conv.type === "group") ||
          (log.calleeIds || []).length > 1
      );

      // Direct 1:1 — only one accepter
      if (!isGroupCall && log.status === "accepted") {
        ack?.({ ok: false, error: "Call already handled" });
        return;
      }

      const alreadyAccepted = log.status === "accepted";
      if (!alreadyAccepted) {
        log.status = "accepted";
        log.isGroupCall = isGroupCall;
        log.answeredAt = new Date();
        await log.save();
      }

      await setPresence(userId, "in_call");

      const uid = String(userId);
      if (active) {
        if (!active.joinedIds) active.joinedIds = [];
        if (!active.joinedIds.includes(uid)) active.joinedIds.push(uid);
        activeCalls.set(callId.toString(), active);
      }

      const joiner = await Employee.findById(userId)
        .select("fullName image")
        .lean();
      const joinerUser = joiner
        ? {
            _id: joiner._id,
            fullName: joiner.fullName,
            image: joiner.image || "",
          }
        : { _id: userId, fullName: "Member", image: "" };

      const joinPayload = {
        callId: log._id,
        userId: uid,
        user: joinerUser,
        groupCall: isGroupCall,
      };

      // Notify caller so they can create/continue WebRTC with this member
      emitToUser(
        log.callerId,
        alreadyAccepted ? "call:peer-joined" : "call:accepted",
        joinPayload
      );

      // Other members already in the call — update their participant grid
      if (isGroupCall && active?.joinedIds?.length) {
        const othersInCall = active.joinedIds.filter(
          (id) => id !== uid && id !== String(log.callerId)
        );
        if (othersInCall.length) {
          emitToUsers(othersInCall, "call:peer-joined", joinPayload);
        }

        // Send full roster to the new joiner (caller + everyone joined)
        const rosterIds = [
          String(log.callerId),
          ...active.joinedIds,
        ].filter((id, i, arr) => id && arr.indexOf(id) === i);
        const people = await Employee.find({ _id: { $in: rosterIds } })
          .select("fullName image")
          .lean();
        emitToUser(userId, "call:roster", {
          callId: log._id,
          participants: people.map((e) => ({
            userId: String(e._id),
            fullName: e.fullName || "Member",
            image: e.image || "",
          })),
        });
      }

      // Direct only: stop ringing for everyone else
      // Group: keep ringing so other members can still join — never emit call:ended here
      if (!isGroupCall) {
        const others = (log.calleeIds || [])
          .map((id) => id.toString())
          .filter((id) => id !== userId.toString());
        if (others.length) {
          emitToUsers(others, "call:ended", {
            callId: log._id,
            reason: "answered_elsewhere",
          });
        }
      }

      ack?.({ ok: true, groupCall: isGroupCall });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("call:reject", async (payload = {}) => {
    try {
      const { callId } = payload;
      const log = await CallLog.findById(callId);
      if (!log) return;

      await setPresence(userId, "online");

      // Call already in progress — a late reject must NOT kill the active call
      if (log.status === "accepted") {
        emitToUser(log.callerId, "call:peer-rejected", {
          callId,
          userId,
        });
        return;
      }

      if (log.status === "ended" || log.status === "rejected" || log.status === "missed") {
        return;
      }

      const active = activeCalls.get(callId.toString());
      const isGroupCall = Boolean(
        log.isGroupCall || active?.isGroupCall || (log.calleeIds || []).length > 1
      );
      const remaining = (active?.calleeIds || log.calleeIds.map(String)).filter(
        (id) => id !== userId.toString()
      );

      // Group still ringing: one reject shouldn't kill the whole ring
      if ((isGroupCall || remaining.length > 0) && log.status === "ringing" && remaining.length > 0) {
        if (active) {
          active.calleeIds = remaining;
          activeCalls.set(callId.toString(), active);
        }
        emitToUser(log.callerId, "call:peer-rejected", {
          callId,
          userId,
          remaining: remaining.length,
        });
        return;
      }

      log.status = "rejected";
      log.endedAt = new Date();
      await log.save();
      activeCalls.delete(callId.toString());
      emitToUser(log.callerId, "call:rejected", { callId, userId });
    } catch {
      /* ignore */
    }
  });

  socket.on("call:end", async (payload = {}) => {
    try {
      const { callId } = payload;
      const log = await CallLog.findById(callId);
      if (!log) return;
      if (log.status === "ended" || log.status === "rejected" || log.status === "missed") {
        return;
      }

      const active = activeCalls.get(callId.toString());
      const isGroupCall = Boolean(
        log.isGroupCall ||
          active?.isGroupCall ||
          (log.calleeIds || []).length > 1
      );
      const uid = String(userId);
      const callerId = String(log.callerId);
      const isCaller = callerId === uid;

      // Group: a non-caller leaving should only drop THAT user — not the whole call
      if (isGroupCall && log.status === "accepted" && !isCaller) {
        await setPresence(userId, "online");

        if (active) {
          active.joinedIds = (active.joinedIds || []).filter((id) => id !== uid);
          active.calleeIds = (active.calleeIds || []).filter((id) => id !== uid);
          activeCalls.set(callId.toString(), active);
        }

        const notify = [
          callerId,
          ...(active?.joinedIds || []),
        ].filter((id, i, arr) => id && id !== uid && arr.indexOf(id) === i);

        emitToUsers(notify, "call:peer-left", {
          callId: log._id,
          userId: uid,
          remaining: active?.joinedIds?.length || 0,
        });
        return;
      }

      const wasRinging = log.status === "ringing";
      log.status = wasRinging ? "missed" : "ended";
      log.endedAt = new Date();
      if (log.answeredAt) {
        log.duration = Math.max(
          0,
          Math.floor((log.endedAt - log.answeredAt) / 1000)
        );
      }
      await log.save();
      activeCalls.delete(callId.toString());

      const peers = [
        callerId,
        ...log.calleeIds.map((id) => id.toString()),
      ].filter((id) => id !== uid);

      emitToUsers(peers, "call:ended", {
        callId: log._id,
        status: log.status,
        duration: log.duration,
        endedBy: uid,
      });

      if (wasRinging) {
        for (const cid of log.calleeIds) {
          if (cid.toString() === uid) continue;
          const notif = await Notification.create({
            recipient: cid,
            title: "Missed call",
            message: `Missed ${log.callType} call`,
            type: "MISSED_CALL",
            conversationId: log.conversationId,
            callLogId: log._id,
            createdBy: log.callerId,
          });
          emitToUser(cid, "notification:new", notif);
        }
      }

      // system message in chat
      if (log.conversationId) {
        const msg = await ChatMessage.create({
          conversationId: log.conversationId,
          senderId: log.callerId,
          type: "call",
          body:
            log.status === "missed"
              ? `Missed ${log.callType} call`
              : `${log.callType} call · ${log.duration || 0}s`,
          callMeta: {
            callLogId: log._id,
            callType: log.callType,
            status: log.status,
            duration: log.duration,
          },
        });
        await chatService.updateConversationLastMessage(log.conversationId, msg);
        const populated = await chatService.populateMessage(msg._id);
        io.to(`conv:${log.conversationId}`).emit("chat:message:new", populated);
      }

      await setPresence(userId, "online");
      for (const pid of peers) await setPresence(pid, "online");
    } catch {
      /* ignore */
    }
  });

  socket.on("call:offer", (payload = {}) => {
    const { toUserId, sdp, callId } = payload;
    if (!toUserId) return;
    emitToUser(toUserId, "call:offer", { fromUserId: userId, sdp, callId });
  });

  socket.on("call:answer", (payload = {}) => {
    const { toUserId, sdp, callId } = payload;
    if (!toUserId) return;
    emitToUser(toUserId, "call:answer", { fromUserId: userId, sdp, callId });
  });

  socket.on("call:ice", (payload = {}) => {
    const { toUserId, candidate, callId } = payload;
    if (!toUserId) return;
    emitToUser(toUserId, "call:ice", {
      fromUserId: userId,
      candidate,
      callId,
    });
  });

  socket.on("call:screen-share", (payload = {}) => {
    const { toUserId, enabled, callId } = payload;
    if (!toUserId) return;
    emitToUser(toUserId, "call:screen-share", {
      fromUserId: userId,
      enabled,
      callId,
    });
  });

  socket.on("call:reconnect", (payload = {}) => {
    const { toUserId, callId } = payload;
    if (!toUserId) return;
    emitToUser(toUserId, "call:reconnect", { fromUserId: userId, callId });
  });
}

export async function onChatSocketConnect(io, socket) {
  const userId = socket.userId;
  const count = presenceMemory.add(userId, socket.id);
  if (count === 1) {
    const doc = await setPresence(userId, "online");
    io.emit("chat:presence", {
      userId: String(userId),
      status: "online",
      lastSeen: doc?.lastSeen,
      isOnline: true,
    });
  }

  // Catch-up: tell THIS socket who is already online (fixes asymmetric presence)
  const onlineIds = presenceMemory.listOnline();
  const docs = await ChatPresence.find({
    userId: { $in: onlineIds },
  }).lean();
  const byId = Object.fromEntries(
    docs.map((d) => [d.userId.toString(), d])
  );
  const snapshot = onlineIds.map((id) => ({
    userId: id,
    status: byId[id]?.status === "offline" ? "online" : byId[id]?.status || "online",
    lastSeen: byId[id]?.lastSeen || new Date(),
    isOnline: true,
  }));
  socket.emit("chat:presence:snapshot", { users: snapshot });

  socket.on("chat:presence:request", async (_payload, ack) => {
    const ids = presenceMemory.listOnline();
    const list = ids.map((id) => ({
      userId: id,
      status: "online",
      isOnline: true,
      lastSeen: null,
    }));
    socket.emit("chat:presence:snapshot", { users: list });
    ack?.({ ok: true, users: list });
  });

  registerChatSockets(io, socket);
}

export async function onChatSocketDisconnect(io, socket) {
  const userId = socket.userId;
  const remaining = presenceMemory.remove(userId, socket.id);
  if (remaining === 0) {
    const doc = await setPresence(userId, "offline");
    io.emit("chat:presence", {
      userId: String(userId),
      status: "offline",
      lastSeen: doc?.lastSeen || new Date(),
      isOnline: false,
    });
  }
}
