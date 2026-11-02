import nodemailer from "nodemailer";
import { loadMailboxCredentials } from "./imapClient.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  assertSafeHeaderValue,
  validateAndNormalizeAttachments,
} from "../../utils/mailbox/mailSchemas.js";

/**
 * Friendly SMTP / rate-limit errors (never include password).
 * @param {unknown} err
 */
export function formatSmtpError(err) {
  const msg = String(err?.message || err || "Send failed");
  const code = err?.responseCode || err?.code;
  if (
    code === 421 ||
    code === 450 ||
    code === 452 ||
    /rate|limit|too many|throttl|try again/i.test(msg)
  ) {
    return "Sending limit reached for this mailbox. Please try again later.";
  }
  if (/auth|invalid login|credentials/i.test(msg)) {
    return "SMTP authentication failed. Contact admin.";
  }
  return msg.replace(/pass(?:word)?[=:]\s*\S+/gi, "[redacted]").slice(0, 240);
}

/**
 * Send via the mailbox's own SMTP only.
 * @param {string} mailboxId
 * @param {{
 *   to: string[],
 *   cc?: string[],
 *   bcc?: string[],
 *   subject: string,
 *   bodyHtml: string,
 *   attachments?: { filename: string, contentType: string, contentBase64: string }[],
 *   inReplyTo?: string|null,
 *   references?: string|null,
 *   messageId?: string|null,
 * }} payload
 */
export async function sendViaMailboxSmtp(mailboxId, payload) {
  const { mailbox, password, settings } =
    await loadMailboxCredentials(mailboxId);

  /**
   * IMAP reads `loginUsername`'s inbox. Replies must go there.
   * If emailAddress (.org) ≠ loginUsername (.com), using emailAddress as
   * From/Reply-To causes replies to land in a different cPanel mailbox.
   */
  const imapAddress = String(mailbox.loginUsername || "").trim();
  const listedAddress = String(mailbox.emailAddress || "").trim();
  const fromAddress = imapAddress || listedAddress;
  const replyAddress = imapAddress || listedAddress;
  const fromName = mailbox.displayName || undefined;
  const addressMismatch =
    listedAddress &&
    imapAddress &&
    listedAddress.toLowerCase() !== imapAddress.toLowerCase();

  const subject = assertSafeHeaderValue(payload.subject || "", "subject");
  const to = (payload.to || []).map((e) => assertSafeHeaderValue(e, "to"));
  const cc = (payload.cc || []).map((e) => assertSafeHeaderValue(e, "cc"));
  const bcc = (payload.bcc || []).map((e) => assertSafeHeaderValue(e, "bcc"));

  const inReplyTo =
    payload.inReplyTo != null && String(payload.inReplyTo).trim()
      ? assertSafeHeaderValue(payload.inReplyTo, "inReplyTo")
      : undefined;
  const references =
    payload.references != null && String(payload.references).trim()
      ? assertSafeHeaderValue(payload.references, "references")
      : undefined;
  const messageId =
    payload.messageId != null && String(payload.messageId).trim()
      ? assertSafeHeaderValue(payload.messageId, "messageId")
      : undefined;

  const normalized = validateAndNormalizeAttachments(payload.attachments || []);
  const attachments = normalized.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.contentBase64, "base64"),
  }));

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: mailbox.loginUsername,
      pass: password,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 60000,
  });

  try {
    const info = await transporter.sendMail({
      from: fromName
        ? `"${fromName.replace(/"/g, "")}" <${fromAddress}>`
        : fromAddress,
      replyTo: replyAddress,
      envelope: {
        from: fromAddress,
        to: [...to, ...cc, ...bcc],
      },
      to: to.join(", "),
      cc: cc.length ? cc.join(", ") : undefined,
      bcc: bcc.length ? bcc.join(", ") : undefined,
      subject,
      html: payload.bodyHtml || "",
      text: stripHtml(payload.bodyHtml || ""),
      attachments,
      messageId,
      inReplyTo,
      references,
    });

    return {
      messageId: info.messageId || messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      fromAddress,
      replyAddress,
      listedAddress,
      addressMismatch,
      fromName: fromName || "",
      subject,
      to,
      cc,
      bcc,
      bodyHtml: payload.bodyHtml || "",
      attachmentsMeta: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.content.length,
      })),
      _rawAttachments: attachments,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, formatSmtpError(err));
  }
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
