import webpush from "web-push";
import { PushSubscription } from "../models/pushSubscription.model.js";
import { getIO } from "./socket.js";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

const userRoom = (userId) => `user:${userId}`;

/** True if this user currently has at least one open CRM socket (any browser/PWA). */
export function isUserSocketConnected(userId) {
  const io = getIO();
  if (!io || !userId) return false;
  const room = io.sockets.adapter.rooms.get(userRoom(String(userId)));
  return Boolean(room && room.size > 0);
}

/** Tell a user's devices to close any "incoming call" system notification
 * still showing for this call (answered elsewhere / cancelled / timed out) —
 * the service worker matches it by the `call-${callId}` tag. */
export async function sendCallEndedPush(userIds, callId) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  await Promise.all(
    ids.map((id) =>
      sendPushToUser(id, { kind: "call_ended", callId: String(callId) }, { force: true })
    )
  );
}

/**
 * Push a payload to the user's devices.
 *
 * Deduping rules (so Chrome + Edge + PWA don't all spam the same alert):
 * - incoming_call / call_ended: always push to every subscription (force)
 * - other kinds: skip entirely if user is online via socket (in-app toast covers it)
 * - other kinds when offline: only the most recently active subscription
 *   (latest browser/PWA that subscribed) — avoids Chrome+Edge double toast
 *   on the same laptop
 */
export async function sendPushToUser(userId, payload, { force = false } = {}) {
  if (!ensureConfigured()) return;

  const kind = payload?.kind || "app_notification";
  const isCallKind = kind === "incoming_call" || kind === "call_ended";

  if (!force && !isCallKind && isUserSocketConnected(userId)) {
    // User has CRM open somewhere — socket toast/OS notif is enough
    return;
  }

  let subs = await PushSubscription.find({ userId })
    .sort({ updatedAt: -1 })
    .lean();
  if (!subs.length) return;

  // One device for normal alerts; all devices for calls
  if (!isCallKind && !force) {
    subs = subs.slice(0, 1);
  }

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        }
      }
    })
  );
}
