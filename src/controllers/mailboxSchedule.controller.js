import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { z } from "zod";
import { MailboxScheduled } from "../models/mailboxScheduled.model.js";
import {
  loadActorFromDb,
  getActiveMailboxAccess,
  permissionAllows,
} from "../utils/mailbox/permissions.js";
import { writeMailboxAudit } from "../utils/mailbox/audit.js";
import {
  runMailboxScheduledTick,
  executeScheduledJobById,
} from "../utils/mailbox/scheduledCron.js";
import { MailboxActivity } from "../models/mailboxActivity.model.js";
import { lookupCrmByEmail } from "../utils/mailbox/crmLookup.js";
import { validateAndNormalizeAttachments } from "../utils/mailbox/mailSchemas.js";
import {
  sanitizeScheduledDoc,
  sanitizeScheduledList,
} from "../utils/mailbox/scheduledSanitize.js";
import { timingSafeEqualString } from "../utils/mailbox/messageId.js";

const emailList = z
  .array(z.string().trim().email())
  .transform((a) => a.map((e) => e.toLowerCase()));

const scheduleSchema = z.object({
  to: emailList.refine((a) => a.length > 0, {
    message: "At least one To recipient",
  }),
  cc: emailList.optional().default([]),
  bcc: emailList.optional().default([]),
  subject: z.string().max(998).default(""),
  bodyHtml: z.string().max(2_000_000).default(""),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().optional(),
        contentBase64: z.string().min(1),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  sendAt: z.union([z.string().min(1), z.number()]),
});

async function requireSend(req, mailboxId) {
  const actor = await loadActorFromDb(req.user._id);
  const result = await getActiveMailboxAccess(actor._id, mailboxId);
  if (!result) throw new ApiError(403, "No access to this mailbox");
  if (!permissionAllows(result.access.permission, "send")) {
    throw new ApiError(403, "Send permission required");
  }
  return { actor, ...result };
}

async function requireRead(req, mailboxId) {
  const actor = await loadActorFromDb(req.user._id);
  const result = await getActiveMailboxAccess(actor._id, mailboxId);
  if (!result) throw new ApiError(403, "No access to this mailbox");
  if (!permissionAllows(result.access.permission, "read")) {
    throw new ApiError(403, "Insufficient mailbox permission");
  }
  return { actor, ...result };
}

function parseSendAt(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid sendAt");
  if (d.getTime() < Date.now() - 30_000) {
    throw new ApiError(400, "sendAt must be in the future");
  }
  return d;
}

export const listScheduled = asyncHandler(async (req, res) => {
  const mailboxId = req.params.mailboxId;
  await requireSend(req, mailboxId);
  const status = req.query.status;
  const query = { mailboxId };
  if (status) query.status = status;
  else query.status = { $in: ["pending", "sending", "failed"] };

  // contentBase64 has select:false — never loaded here
  const rows = await MailboxScheduled.find(query).sort({ sendAt: 1 }).lean();
  return res
    .status(200)
    .json(
      new ApiResponse(200, sanitizeScheduledList(rows), "Scheduled list"),
    );
});

export const createScheduled = asyncHandler(async (req, res) => {
  const mailboxId = req.params.mailboxId;
  const { actor } = await requireSend(req, mailboxId);
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(
      400,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  }
  const data = parsed.data;
  const sendAt = parseSendAt(data.sendAt);
  const attachments = validateAndNormalizeAttachments(data.attachments);

  const row = await MailboxScheduled.create({
    mailboxId,
    createdByUserId: actor._id,
    to: data.to,
    cc: data.cc,
    bcc: data.bcc,
    subject: data.subject,
    bodyHtml: data.bodyHtml,
    attachments,
    sendAt,
    status: "pending",
    attempts: 0,
  });

  await writeMailboxAudit({
    action: "mailbox_schedule_create",
    actor,
    mailboxId,
    meta: { id: row._id, sendAt, subject: data.subject },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, sanitizeScheduledDoc(row), "Scheduled"));
});

export const updateScheduled = asyncHandler(async (req, res) => {
  const { mailboxId, id } = req.params;
  const { actor } = await requireSend(req, mailboxId);
  const row = await MailboxScheduled.findOne({ _id: id, mailboxId });
  if (!row) throw new ApiError(404, "Scheduled message not found");
  if (!["pending", "failed"].includes(row.status)) {
    throw new ApiError(400, "Only pending/failed schedules can be edited");
  }

  if (req.body.sendAt != null) row.sendAt = parseSendAt(req.body.sendAt);
  if (req.body.subject != null) row.subject = String(req.body.subject);
  if (req.body.bodyHtml != null) row.bodyHtml = String(req.body.bodyHtml);
  if (Array.isArray(req.body.to)) {
    row.to = req.body.to.map((e) => String(e).toLowerCase());
  }
  if (Array.isArray(req.body.cc)) {
    row.cc = req.body.cc.map((e) => String(e).toLowerCase());
  }
  if (Array.isArray(req.body.bcc)) {
    row.bcc = req.body.bcc.map((e) => String(e).toLowerCase());
  }
  if (Array.isArray(req.body.attachments)) {
    row.attachments = validateAndNormalizeAttachments(req.body.attachments);
  }
  row.status = "pending";
  row.error = null;
  row.attempts = 0;
  row.smtpMessageId = null;
  row.smtpSentAt = null;
  row.completionWarning = null;
  await row.save();

  await writeMailboxAudit({
    action: "mailbox_schedule_update",
    actor,
    mailboxId,
    meta: { id: row._id },
  });

  // Re-load without contentBase64 (select:false)
  const clean = await MailboxScheduled.findById(row._id).lean();
  return res
    .status(200)
    .json(new ApiResponse(200, sanitizeScheduledDoc(clean), "Updated"));
});

export const cancelScheduled = asyncHandler(async (req, res) => {
  const { mailboxId, id } = req.params;
  const { actor } = await requireSend(req, mailboxId);

  const existing = await MailboxScheduled.findOne({ _id: id, mailboxId }).lean();
  if (!existing) throw new ApiError(404, "Scheduled message not found");

  if (existing.status === "sending") {
    throw new ApiError(
      409,
      "Send already in progress — cannot cancel. Wait for it to finish or fail; the job was not modified.",
    );
  }
  if (existing.status === "sent") {
    throw new ApiError(400, "Already sent — cannot cancel");
  }
  if (existing.status === "cancelled") {
    return res
      .status(200)
      .json(
        new ApiResponse(200, sanitizeScheduledDoc(existing), "Already cancelled"),
      );
  }

  const row = await MailboxScheduled.findOneAndUpdate(
    {
      _id: id,
      mailboxId,
      status: { $in: ["pending", "failed"] },
    },
    { $set: { status: "cancelled", sendingStartedAt: null } },
    { new: true },
  );
  if (!row) {
    throw new ApiError(
      409,
      "Could not cancel — status changed (possibly sending). Job was not broken.",
    );
  }

  await writeMailboxAudit({
    action: "mailbox_schedule_cancel",
    actor,
    mailboxId,
    meta: { id: row._id },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, sanitizeScheduledDoc(row), "Cancelled"));
});

/** Send immediately (bypass wait) — uses same idempotent execute path as cron */
export const sendScheduledNow = asyncHandler(async (req, res) => {
  const { mailboxId, id } = req.params;
  const { actor } = await requireSend(req, mailboxId);

  const claimed = await MailboxScheduled.findOneAndUpdate(
    {
      _id: id,
      mailboxId,
      status: { $in: ["pending", "failed"] },
      smtpSentAt: null,
    },
    {
      $set: { status: "sending", sendingStartedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
  if (!claimed) {
    const cur = await MailboxScheduled.findOne({ _id: id, mailboxId }).lean();
    if (cur?.status === "sending") {
      throw new ApiError(409, "Send already in progress");
    }
    throw new ApiError(404, "Scheduled message not found");
  }

  const result = await executeScheduledJobById(claimed._id);
  if (!result?.ok) {
    throw new ApiError(502, result?.error || "Send now failed");
  }

  await writeMailboxAudit({
    action: "mailbox_schedule_send_now",
    actor,
    mailboxId,
    meta: { id: claimed._id },
  });

  return res.status(200).json(new ApiResponse(200, { sent: true }, "Sent now"));
});

/**
 * HTTP cron: GET|POST /mailbox/cron/send-scheduled
 * Auth (header or Bearer only — never query/body):
 *   x-mailbox-cron-secret: MAILBOX_CRON_SECRET
 *   Authorization: Bearer <MAILBOX_CRON_SECRET|CRON_SECRET>
 */
export const cronSendScheduled = asyncHandler(async (req, res) => {
  const secret =
    process.env.MAILBOX_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) {
    throw new ApiError(503, "MAILBOX_CRON_SECRET not configured");
  }
  const auth = String(req.header("authorization") || "");
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const provided = req.header("x-mailbox-cron-secret") || bearer || "";
  if (!provided || !timingSafeEqualString(provided, secret)) {
    throw new ApiError(401, "Invalid cron secret");
  }
  await runMailboxScheduledTick();
  return res.status(200).json(new ApiResponse(200, { ran: true }, "Cron tick"));
});

/** CRM link card — brand-scoped Client/Lead lookup; requires read */
export const getCrmLink = asyncHandler(async (req, res) => {
  const mailboxId = req.params.mailboxId;
  const { actor, mailbox, brand, access } = await requireRead(req, mailboxId);

  const email = String(req.query.email || "").trim().toLowerCase();
  const links = await lookupCrmByEmail(email, {
    brandId: mailbox.brandId,
    departmentId: brand?.departmentId,
  });

  if (email) {
    try {
      await MailboxActivity.findOneAndUpdate(
        {
          mailboxId,
          messageId: req.query.messageId || null,
          counterpartyEmail: email,
        },
        {
          $set: {
            subject: req.query.subject || "",
            date: req.query.date ? new Date(req.query.date) : new Date(),
            direction:
              req.query.direction === "outbound" ? "outbound" : "inbound",
            linkedClientId: links.client?._id || null,
            linkedLeadId: links.lead?._id || null,
            openedByUserId: actor._id,
          },
          $setOnInsert: {
            mailboxId,
            counterpartyEmail: email,
          },
        },
        { upsert: true, new: true },
      );
    } catch {
      /* ignore */
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...links,
        permission: access.permission,
        createLeadNote:
          "Create-lead-from-email is skipped: existing lead/add requires phoneNo, brandMark, serialNo etc. Open Leads and create manually, or ask to add a dedicated lightweight endpoint later.",
      },
      "CRM lookup",
    ),
  );
});
