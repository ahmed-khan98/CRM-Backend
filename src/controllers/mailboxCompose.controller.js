import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  loadActorFromDb,
  getActiveMailboxAccess,
  permissionAllows,
  isMailboxAdmin,
} from "../utils/mailbox/permissions.js";
import { writeMailboxAudit } from "../utils/mailbox/audit.js";
import { formatMailboxConnError } from "../services/mailbox/imapClient.js";
import { sendViaMailboxSmtp } from "../services/mailbox/smtpSend.js";
import {
  appendOutboundMessage,
  saveDraftMessage,
  moveMessages,
  deleteMessages,
  markMessagesSpam,
  setMessagesFlags,
} from "../services/mailbox/imapService.js";
import { MailboxSent } from "../models/mailboxSent.model.js";
import {
  composeMailSchema,
  moveMailSchema,
  deleteMailSchema,
  bulkFlagsSchema,
  assertSafeHeaderValue,
  validateAndNormalizeAttachments,
} from "../utils/mailbox/mailSchemas.js";

async function requireSendAccess(req, mailboxId) {
  const actor = await loadActorFromDb(req.user._id);
  const result = await getActiveMailboxAccess(actor._id, mailboxId);
  if (!result) throw new ApiError(403, "No access to this mailbox");
  if (!permissionAllows(result.access.permission, "send")) {
    throw new ApiError(403, "You need read_send or manage permission to send");
  }
  return { actor, ...result };
}

async function requireReadAccess(req, mailboxId) {
  const actor = await loadActorFromDb(req.user._id);
  const result = await getActiveMailboxAccess(actor._id, mailboxId);
  if (!result) throw new ApiError(403, "No access to this mailbox");
  if (!permissionAllows(result.access.permission, "read")) {
    throw new ApiError(403, "Insufficient mailbox permission");
  }
  return { actor, ...result };
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new ApiError(400, msg || "Invalid input");
  }
  return parsed.data;
}

function wrapImap(err, actor) {
  if (err instanceof ApiError) throw err;
  throw new ApiError(502, formatMailboxConnError(err, isMailboxAdmin(actor)));
}

/** POST /mail/:mailboxId/send */
export const sendMail = asyncHandler(async (req, res) => {
  const mailboxId = req.params.mailboxId;
  const { actor } = await requireSendAccess(req, mailboxId);
  const data = parseBody(composeMailSchema, req.body);

  let sent;
  try {
    sent = await sendViaMailboxSmtp(mailboxId, data);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  }

  let imapAppended = false;
  try {
    await appendOutboundMessage(mailboxId, "sent", {
      ...sent,
      inReplyTo: data.inReplyTo,
      references: data.references,
      messageId: sent.messageId,
    });
    imapAppended = true;
  } catch (err) {
    console.error(
      "[mailbox-send] IMAP Sent append failed:",
      formatMailboxConnError(err, true),
    );
  }

  // Delete draft if we were editing one
  if (data.draftUid) {
    try {
      await deleteMessages(mailboxId, "drafts", [data.draftUid], true);
    } catch {
      /* ignore */
    }
  }

  await MailboxSent.create({
    mailboxId,
    sentByUserId: actor._id,
    to: sent.to,
    cc: sent.cc,
    bcc: sent.bcc,
    subject: sent.subject,
    messageId: sent.messageId,
    imapAppended,
    inReplyTo: data.inReplyTo || null,
    references: data.references || null,
  });

  await writeMailboxAudit({
    action: "mailbox_send",
    actor,
    mailboxId,
    meta: {
      to: sent.to,
      subject: sent.subject,
      messageId: sent.messageId,
      imapAppended,
    },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        messageId: sent.messageId,
        imapAppended,
        to: sent.to,
        subject: sent.subject,
        fromAddress: sent.fromAddress,
        replyAddress: sent.replyAddress,
        addressMismatch: sent.addressMismatch,
        warning: sent.addressMismatch
          ? `From/Reply-To uses login ${sent.fromAddress} (IMAP inbox). Listed address was ${sent.listedAddress}. Align them in Email Mapping so replies match.`
          : null,
      },
      "Message sent",
    ),
  );
});

/** POST /mail/:mailboxId/draft */
export const saveDraft = asyncHandler(async (req, res) => {
  const mailboxId = req.params.mailboxId;
  const { actor, mailbox } = await requireSendAccess(req, mailboxId);

  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e));
  const cleanList = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => e && emailOk(e));

  const inReplyTo =
    req.body?.inReplyTo != null && String(req.body.inReplyTo).trim()
      ? assertSafeHeaderValue(req.body.inReplyTo, "inReplyTo")
      : null;
  const references =
    req.body?.references != null && String(req.body.references).trim()
      ? assertSafeHeaderValue(req.body.references, "references")
      : null;

  const draftPayload = {
    to: cleanList(req.body?.to),
    cc: cleanList(req.body?.cc),
    // Kept in API metadata only — stripped from IMAP draft RFC822 (shared folder)
    bcc: cleanList(req.body?.bcc),
    subject: assertSafeHeaderValue(
      String(req.body?.subject || "").replace(/[\r\n]+/g, " "),
      "subject",
    ),
    bodyHtml: String(req.body?.bodyHtml || ""),
    draftUid: req.body?.draftUid || null,
    inReplyTo,
    references,
  };

  const normalized = validateAndNormalizeAttachments(
    Array.isArray(req.body?.attachments) ? req.body.attachments : [],
  );
  const attachments = normalized.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.contentBase64, "base64"),
  }));

  try {
    const result = await saveDraftMessage(
      mailboxId,
      {
        fromAddress: mailbox.loginUsername || mailbox.emailAddress,
        fromName: mailbox.displayName || "",
        to: draftPayload.to,
        cc: draftPayload.cc,
        // intentionally omit bcc from IMAP draft body
        bcc: [],
        draft: true,
        subject: draftPayload.subject,
        bodyHtml: draftPayload.bodyHtml,
        _rawAttachments: attachments,
        inReplyTo: draftPayload.inReplyTo,
        references: draftPayload.references,
      },
      draftPayload.draftUid,
    );

    await writeMailboxAudit({
      action: "mailbox_draft_save",
      actor,
      mailboxId,
      meta: {
        uid: result.uid,
        subject: draftPayload.subject,
        bccCount: draftPayload.bcc.length,
      },
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          bccStoredInImap: false,
          bccCount: draftPayload.bcc.length,
        },
        "Draft saved",
      ),
    );
  } catch (err) {
    wrapImap(err, actor);
  }
});

export const moveMail = asyncHandler(async (req, res) => {
  const { actor } = await requireSendAccess(req, req.params.mailboxId);
  const data = parseBody(moveMailSchema, req.body);
  try {
    const result = await moveMessages(
      req.params.mailboxId,
      data.folder,
      data.uids,
      data.targetFolder,
    );
    await writeMailboxAudit({
      action: "mailbox_move",
      actor,
      mailboxId: req.params.mailboxId,
      meta: result,
    });
    return res.status(200).json(new ApiResponse(200, result, "Moved"));
  } catch (err) {
    wrapImap(err, actor);
  }
});

export const deleteMail = asyncHandler(async (req, res) => {
  const { actor, access } = await requireSendAccess(req, req.params.mailboxId);
  const data = parseBody(deleteMailSchema, req.body);
  const allowPermanent = permissionAllows(
    access.permission,
    "permanent_delete",
  );
  if (data.permanent && !allowPermanent) {
    throw new ApiError(
      403,
      "Permanent delete requires manage permission; read_send can only move to Bin",
    );
  }
  try {
    const result = await deleteMessages(
      req.params.mailboxId,
      data.folder,
      data.uids,
      data.permanent,
      { allowPermanent },
    );
    await writeMailboxAudit({
      action: "mailbox_delete",
      actor,
      mailboxId: req.params.mailboxId,
      meta: result,
    });
    return res.status(200).json(new ApiResponse(200, result, "Deleted"));
  } catch (err) {
    wrapImap(err, actor);
  }
});

export const spamMail = asyncHandler(async (req, res) => {
  const { actor } = await requireSendAccess(req, req.params.mailboxId);
  const data = parseBody(deleteMailSchema.omit({ permanent: true }), req.body);
  try {
    const result = await markMessagesSpam(
      req.params.mailboxId,
      data.folder,
      data.uids,
    );
    await writeMailboxAudit({
      action: "mailbox_spam",
      actor,
      mailboxId: req.params.mailboxId,
      meta: result,
    });
    return res.status(200).json(new ApiResponse(200, result, "Marked as spam"));
  } catch (err) {
    wrapImap(err, actor);
  }
});

export const bulkFlags = asyncHandler(async (req, res) => {
  // read-only users can mark read/unread/flag
  const { actor } = await requireReadAccess(req, req.params.mailboxId);
  const data = parseBody(bulkFlagsSchema, req.body);
  try {
    const result = await setMessagesFlags(
      req.params.mailboxId,
      data.folder,
      data.uids,
      { seen: data.seen, flagged: data.flagged },
    );
    return res.status(200).json(new ApiResponse(200, result, "Flags updated"));
  } catch (err) {
    wrapImap(err, actor);
  }
});
