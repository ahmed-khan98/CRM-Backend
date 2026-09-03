import { Notification } from "../models/notification.model.js";
import { Lead } from "../models/lead.model.js";
import { emitToUser } from "./socket.js";
import { sendPushToUser } from "./webPush.js";

/** Remind 1 hour before scheduleDate/time. */
export const SCHEDULE_REMINDER_LEAD_MS = 60 * 60 * 1000;

/** How far back to catch missed reminders (cron downtime, etc.). */
const MISSED_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const toId = (value) =>
  value?._id?.toString?.() || value?.toString?.() || null;

const uniqueIds = (values = []) => [
  ...new Set(values.map(toId).filter(Boolean)),
];

/**
 * Date-only strings (YYYY-MM-DD) → 09:00 Asia/Karachi that day.
 * datetime-local without timezone → Asia/Karachi.
 * Full ISO datetimes are kept as-is.
 */
export function normalizeScheduleDate(input) {
  if (!input) return null;
  const raw = String(input).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T09:00:00+05:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) &&
    !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
  ) {
    const withSec = raw.length === 16 ? `${raw}:00` : raw;
    const d = new Date(`${withSec}+05:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when schedule is within the next hour (or already past). */
export function isWithinScheduleReminderWindow(scheduleDate, now = new Date()) {
  if (!scheduleDate) return false;
  const at = new Date(scheduleDate).getTime();
  if (Number.isNaN(at)) return false;
  return at - now.getTime() <= SCHEDULE_REMINDER_LEAD_MS;
}

function formatWhen(scheduleDate) {
  return new Date(scheduleDate).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {"scheduled"|"reminder"|"due"} kind
 */
function buildCopy(kind, leadName, scheduleDate) {
  const name = leadName || "a lead";
  const when = scheduleDate ? formatWhen(scheduleDate) : "soon";

  if (kind === "due") {
    return {
      title: "Lead follow-up due",
      message: `Follow-up is due now for ${name} (${when})`,
    };
  }
  if (kind === "reminder") {
    return {
      title: "Lead follow-up reminder",
      message: `Follow-up in 1 hour for ${name} (${when})`,
    };
  }
  return {
    title: "Lead follow-up scheduled",
    message: `Follow-up scheduled for ${name} on ${when}`,
  };
}

/**
 * @param {{ leadId: any, agentId: any, scheduleDate: any, leadName?: string, actorId?: any, allowSelf?: boolean, kind?: "scheduled"|"reminder"|"due" }} params
 */
export async function notifyLeadSchedule({
  leadId,
  agentId,
  scheduleDate,
  leadName,
  actorId,
  allowSelf = false,
  kind = "scheduled",
}) {
  const recipient = toId(agentId);
  if (!recipient || !leadId) {
    console.warn("[lead-schedule] skip: missing recipient or leadId", {
      recipient,
      leadId: toId(leadId),
    });
    return null;
  }

  const actorStr = toId(actorId);
  if (!allowSelf && actorStr && actorStr === recipient) {
    console.log("[lead-schedule] skip self-notify on create", { recipient });
    return null;
  }

  const { title, message } = buildCopy(kind, leadName, scheduleDate);

  const doc = await Notification.create({
    recipient,
    title,
    message,
    type: "LEAD_SCHEDULE",
    leadId,
    createdBy: actorStr || null,
    isRead: false,
  });

  emitToUser(recipient, "notification:new", {
    _id: doc._id,
    title: doc.title,
    message: doc.message,
    type: doc.type,
    leadId: doc.leadId,
    isRead: false,
    createdAt: doc.createdAt,
  });

  sendPushToUser(recipient, {
    kind: "app_notification",
    type: doc.type,
    title: doc.title,
    body: doc.message,
    message: doc.message,
    leadId: doc.leadId ? String(doc.leadId) : null,
  }).catch(() => {});

  console.log(
    `[lead-schedule] created notification=${doc._id} recipient=${recipient} kind=${kind}`,
  );

  return doc;
}

/** Notify lead agent + the user who scheduled (if different). */
export async function notifyLeadScheduleRecipients({
  leadId,
  recipientIds,
  scheduleDate,
  leadName,
  actorId,
  allowSelf = false,
  kind = "scheduled",
}) {
  const recipients = uniqueIds(recipientIds);
  const created = [];
  for (const recipient of recipients) {
    const doc = await notifyLeadSchedule({
      leadId,
      agentId: recipient,
      scheduleDate,
      leadName,
      actorId,
      allowSelf,
      kind,
    });
    if (doc) created.push(doc);
  }
  return created;
}

/**
 * Send reminder once when schedule is within the next 1 hour
 * (or overdue within lookback if the pre-reminder was missed).
 * Kept lightweight: indexed query, only unsent rows, batched lead fetch.
 */
export async function processDueLeadScheduleReminders() {
  const now = new Date();
  const lookback = new Date(now.getTime() - MISSED_LOOKBACK_MS);
  const windowEnd = new Date(now.getTime() + SCHEDULE_REMINDER_LEAD_MS);

  const { LeadComment } = await import("../models/leadComment.model.js");

  // Mostly empty runs — only rows not yet reminded
  const candidates = await LeadComment.find({
    lastAction: "schedule",
    reminderSentAt: null,
    scheduleDate: { $gte: lookback, $lte: windowEnd },
  })
    .select("leadId userId scheduleDate createdAt reminderSentAt")
    .sort({ scheduleDate: 1 })
    .limit(50)
    .lean();

  if (!candidates.length) {
    return { processed: 0, candidates: 0, skipped: 0 };
  }

  const leadIds = uniqueIds(candidates.map((c) => c.leadId));
  const leads = await Lead.find({ _id: { $in: leadIds } })
    .select("name agent")
    .lean();
  const leadMap = new Map(leads.map((l) => [String(l._id), l]));

  let processed = 0;
  let skipped = 0;

  for (const comment of candidates) {
    try {
      const lead = leadMap.get(String(comment.leadId));
      const recipients = uniqueIds([lead?.agent, comment.userId]);
      if (!recipients.length) {
        skipped += 1;
        continue;
      }

      const scheduleAt = new Date(comment.scheduleDate).getTime();
      const kind = scheduleAt <= now.getTime() ? "due" : "reminder";

      const docs = await notifyLeadScheduleRecipients({
        leadId: comment.leadId,
        recipientIds: recipients,
        scheduleDate: comment.scheduleDate,
        leadName: lead?.name,
        actorId: comment.userId,
        allowSelf: true,
        kind,
      });

      if (docs.length) {
        await LeadComment.updateOne(
          { _id: comment._id },
          { $set: { reminderSentAt: new Date() } },
        );
        processed += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      console.error(
        "Lead schedule reminder failed for comment",
        comment?._id?.toString?.(),
        err?.message || err,
      );
    }
  }

  if (processed > 0) {
    console.log(
      `[lead-schedule-cron] sent=${processed} candidates=${candidates.length} skipped=${skipped}`,
    );
  }

  return { processed, candidates: candidates.length, skipped };
}
