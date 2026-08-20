import webpush from "web-push";
import { PushSubscription } from "../models/pushSubscription.model.js";

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

/** Tell a user's devices to close any "incoming call" system notification
 * still showing for this call (answered elsewhere / cancelled / timed out) —
 * the service worker matches it by the `call-${callId}` tag. */
export async function sendCallEndedPush(userIds, callId) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  await Promise.all(
    ids.map((id) =>
      sendPushToUser(id, { kind: "call_ended", callId: String(callId) })
    )
  );
}

/** Push a payload to every device a user has subscribed from. Used for
 * things that must reach the user even if the PWA is backgrounded/closed —
 * currently just incoming calls. Silently drops dead subscriptions. */
export async function sendPushToUser(userId, payload) {
  if (!ensureConfigured()) return;
  const subs = await PushSubscription.find({ userId }).lean();
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err) {
        // 404/410 = subscription no longer valid on the push service's end
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        }
      }
    })
  );
}
