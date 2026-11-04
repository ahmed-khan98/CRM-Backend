import { MailboxScheduled } from "../../models/mailboxScheduled.model.js";
import { MailboxSent } from "../../models/mailboxSent.model.js";
import { MailboxActivity } from "../../models/mailboxActivity.model.js";
import { MailboxAccount } from "../../models/mailboxAccount.model.js";
import { sendViaMailboxSmtp } from "../../services/mailbox/smtpSend.js";
import { appendOutboundMessage } from "../../services/mailbox/imapService.js";
import { formatMailboxConnError } from "../../services/mailbox/imapClient.js";
import { generateMailboxMessageId } from "./messageId.js";
import { assertPersonalInternalRecipients } from "./personalInternal.js";

const INTERVAL_MS = 60 * 1000;
const STALE_SENDING_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

let intervalHandle = null;

/**
 * Atomically claim one due job (pending → sending). Multi-instance safe.
 * Does not claim jobs that already completed SMTP (smtpSentAt set) — those
 * are finished via stale recovery / finishAfterSmtp only.
 */
async function claimNextJob() {
  const now = new Date();
  return MailboxScheduled.findOneAndUpdate(
    {
      status: "pending",
      sendAt: { $lte: now },
      attempts: { $lt: MAX_ATTEMPTS },
      smtpSentAt: null,
    },
    {
      $set: { status: "sending", sendingStartedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { sendAt: 1 }, new: true },
  ).select("+attachments.contentBase64");
}

/**
 * Stale recovery:
 * - smtpSentAt set → finish IMAP/status only (never resend SMTP)
 * - otherwise → reset to pending for retry
 */
async function recoverStaleSending() {
  const cutoff = new Date(Date.now() - STALE_SENDING_MS);

  const afterSmtp = await MailboxScheduled.find({
    status: "sending",
    sendingStartedAt: { $lt: cutoff },
    smtpSentAt: { $ne: null },
  }).select("+attachments.contentBase64");

  for (const job of afterSmtp) {
    await finishAfterSmtp(job, {
      warning:
        "Recovered after SMTP success (IMAP/status unfinished); message was not resent",
    });
  }

  await MailboxScheduled.updateMany(
    {
      status: "sending",
      sendingStartedAt: { $lt: cutoff },
      $or: [{ smtpSentAt: null }, { smtpSentAt: { $exists: false } }],
    },
    {
      $set: {
        status: "pending",
        sendingStartedAt: null,
        error: "Recovered from stale sending state",
        smtpMessageId: null,
      },
    },
  );
}

/**
 * Complete post-SMTP steps and mark sent. Safe to call multiple times.
 * @param {import("mongoose").Document} job
 * @param {{ warning?: string|null, sentPayload?: object }} [opts]
 */
async function finishAfterSmtp(job, opts = {}) {
  const messageId = job.smtpMessageId || opts.sentPayload?.messageId;
  let imapAppended = false;
  try {
    const payload = opts.sentPayload || {
      to: job.to || [],
      cc: job.cc || [],
      bcc: job.bcc || [],
      subject: job.subject || "",
      bodyHtml: job.bodyHtml || "",
      messageId,
      fromAddress: undefined,
      _rawAttachments: [],
    };
    await appendOutboundMessage(String(job.mailboxId), "sent", {
      ...payload,
      messageId,
    });
    imapAppended = true;
  } catch (err) {
    console.error(
      "[mailbox-scheduled] IMAP append failed:",
      formatMailboxConnError(err, true),
    );
  }

  try {
    const existing = await MailboxSent.findOne({
      mailboxId: job.mailboxId,
      messageId,
    }).lean();
    if (!existing) {
      await MailboxSent.create({
        mailboxId: job.mailboxId,
        sentByUserId: job.createdByUserId,
        to: opts.sentPayload?.to || job.to || [],
        cc: opts.sentPayload?.cc || job.cc || [],
        bcc: opts.sentPayload?.bcc || job.bcc || [],
        subject: opts.sentPayload?.subject || job.subject || "",
        messageId,
        imapAppended,
      });
    }
  } catch {
    /* unique race ok */
  }

  try {
    await MailboxActivity.create({
      mailboxId: job.mailboxId,
      messageId,
      subject: opts.sentPayload?.subject || job.subject || "",
      date: new Date(),
      direction: "outbound",
      counterpartyEmail: (opts.sentPayload?.to || job.to || [])[0] || null,
    });
  } catch {
    /* non-fatal */
  }

  await MailboxScheduled.updateOne(
    { _id: job._id },
    {
      $set: {
        status: "sent",
        error: null,
        sendingStartedAt: null,
        completionWarning: opts.warning || job.completionWarning || null,
      },
    },
  );
  return { ok: true, resent: false };
}

/**
 * Send one claimed job via SMTP + IMAP Sent append (idempotent).
 * @param {import("mongoose").Document} job
 */
async function executeJob(job) {
  // Already SMTP-succeeded (e.g. claimed incorrectly) — finish only
  if (job.smtpSentAt) {
    return finishAfterSmtp(job, {
      warning:
        "SMTP already completed earlier; finished remaining steps without resend",
    });
  }

  try {
    const mailbox = await MailboxAccount.findById(job.mailboxId)
      .select("loginUsername emailAddress kind")
      .lean();
    const fromHint =
      mailbox?.loginUsername || mailbox?.emailAddress || "mailbox.local";
    const messageId =
      job.smtpMessageId || generateMailboxMessageId(fromHint);

    if (!job.smtpMessageId) {
      await MailboxScheduled.updateOne(
        { _id: job._id, status: "sending", smtpSentAt: null },
        { $set: { smtpMessageId: messageId } },
      );
      job.smtpMessageId = messageId;
    }

    assertPersonalInternalRecipients(mailbox, {
      to: job.to || [],
      cc: job.cc || [],
      bcc: job.bcc || [],
    });

    const attachments = (job.attachments || []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType || "application/octet-stream",
      contentBase64: a.contentBase64,
    }));

    const sent = await sendViaMailboxSmtp(String(job.mailboxId), {
      to: job.to || [],
      cc: job.cc || [],
      bcc: job.bcc || [],
      subject: job.subject || "",
      bodyHtml: job.bodyHtml || "",
      attachments,
      messageId,
    });

    // Persist SMTP success BEFORE IMAP / other side effects
    await MailboxScheduled.updateOne(
      { _id: job._id, status: "sending" },
      {
        $set: {
          smtpSentAt: new Date(),
          smtpMessageId: sent.messageId || messageId,
        },
      },
    );
    job.smtpSentAt = new Date();
    job.smtpMessageId = sent.messageId || messageId;

    return finishAfterSmtp(job, { sentPayload: sent });
  } catch (err) {
    // If SMTP already recorded, never fail back to pending/resend
    const fresh = await MailboxScheduled.findById(job._id).select(
      "+attachments.contentBase64",
    );
    if (fresh?.smtpSentAt) {
      return finishAfterSmtp(fresh, {
        warning:
          "Post-SMTP steps failed once; marked sent without resending",
      });
    }

    const msg =
      err?.message ||
      formatMailboxConnError(err, true) ||
      "Scheduled send failed";
    const attempts = job.attempts || 1;
    const finalFail = attempts >= MAX_ATTEMPTS;

    await MailboxScheduled.updateOne(
      { _id: job._id, status: "sending", smtpSentAt: null },
      {
        $set: {
          status: finalFail ? "failed" : "pending",
          error: String(msg).slice(0, 500),
          sendingStartedAt: null,
          smtpMessageId: null,
          ...(finalFail ? {} : { sendAt: new Date(Date.now() + 60 * 1000) }),
        },
      },
    );
    return { ok: false, error: msg };
  }
}

async function processOne() {
  await recoverStaleSending();
  const job = await claimNextJob();
  if (!job) return false;
  await executeJob(job);
  return true;
}

async function tick() {
  try {
    for (let i = 0; i < 5; i += 1) {
      const did = await processOne();
      if (!did) break;
    }
  } catch (err) {
    console.error("[mailbox-scheduled-cron]", err?.message || err);
  }
}

/** Run due jobs once (HTTP cron + interval share this). */
export async function runMailboxScheduledTick() {
  await tick();
  return { ok: true };
}

/** Exported for send-now controller (same idempotent path). */
export async function executeScheduledJobById(jobId) {
  const job = await MailboxScheduled.findById(jobId).select(
    "+attachments.contentBase64",
  );
  if (!job) return { ok: false, error: "not found" };
  return executeJob(job);
}

export function startMailboxScheduledCron() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(tick, INTERVAL_MS);
  setTimeout(() => {
    tick().catch(() => {});
  }, 5000);
  console.log(
    `[mailbox-scheduled-cron] started (every ${INTERVAL_MS / 1000}s)`,
  );
  return intervalHandle;
}

export function stopMailboxScheduledCron() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
