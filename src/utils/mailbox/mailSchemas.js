import { z } from "zod";
import { ApiError } from "../ApiError.js";

const emailList = z
  .array(z.string().trim().email())
  .default([])
  .transform((arr) =>
    arr.map((e) => e.toLowerCase()).filter((e, i, a) => a.indexOf(e) === i),
  );

/** Common safe attachment MIME types (plus octet-stream fallback). */
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB total

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default("application/octet-stream"),
  contentBase64: z.string().min(1),
});

export const composeMailSchema = z.object({
  to: emailList.refine((a) => a.length > 0, {
    message: "At least one To recipient",
  }),
  cc: emailList.optional().default([]),
  bcc: emailList.optional().default([]),
  subject: z.string().max(998).default(""),
  bodyHtml: z.string().max(2_000_000).default(""),
  attachments: z.array(attachmentSchema).max(20).optional().default([]),
  inReplyTo: z.string().optional().nullable(),
  references: z.string().optional().nullable(),
  /** When saving/updating a draft UID in Drafts folder */
  draftUid: z.coerce.number().optional().nullable(),
});

export const moveMailSchema = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number()).min(1).max(100),
  targetFolder: z.string().min(1),
});

export const deleteMailSchema = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number()).min(1).max(100),
  permanent: z.boolean().optional().default(false),
});

export const bulkFlagsSchema = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number()).min(1).max(100),
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

/** Reject header injection in subject / address / message-id strings */
export function assertSafeHeaderValue(value, fieldName = "field") {
  const s = String(value ?? "");
  if (/[\r\n]/.test(s)) {
    throw new ApiError(400, `Invalid ${fieldName}: newlines not allowed`);
  }
  return s;
}

/**
 * Sanitize attachment filename for Content-Disposition (no CR/LF, quotes, paths).
 * @param {string} filename
 */
export function sanitizeDownloadFilename(filename) {
  let name = String(filename || "attachment")
    .replace(/[\r\n\0]+/g, "")
    .replace(/["\\]/g, "_")
    .replace(/[/\\:?<>|*]+/g, "_")
    .replace(/\.\.+/g, ".")
    .trim();
  if (!name || name === "." || name === "..") name = "attachment";
  if (name.length > 180) name = name.slice(0, 180);
  return name;
}

/**
 * RFC 5987 Content-Disposition: attachment; filename="…"; filename*=UTF-8''…
 * @param {string} filename
 */
export function contentDispositionAttachment(filename) {
  const safe = sanitizeDownloadFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Validate attachment list (name, type, total decoded size). Used by send/draft/schedule.
 * @param {{ filename: string, contentType?: string, contentBase64: string }[]} attachments
 * @returns {{ filename: string, contentType: string, contentBase64: string, size: number }[]}
 */
export function validateAndNormalizeAttachments(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length > 20) {
    throw new ApiError(400, "Maximum 20 attachments allowed");
  }
  let total = 0;
  const out = [];
  for (const att of list) {
    if (!att?.filename || !att?.contentBase64) {
      throw new ApiError(400, "Each attachment needs filename and contentBase64");
    }
    const filename = sanitizeDownloadFilename(
      assertSafeHeaderValue(att.filename, "filename"),
    );
    const contentType = String(
      att.contentType || "application/octet-stream",
    )
      .trim()
      .toLowerCase()
      .slice(0, 200);
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      throw new ApiError(400, `Attachment type not allowed: ${contentType}`);
    }
    let buf;
    try {
      buf = Buffer.from(String(att.contentBase64), "base64");
    } catch {
      throw new ApiError(400, `Invalid attachment data: ${filename}`);
    }
    if (!buf.length) {
      throw new ApiError(400, `Empty attachment: ${filename}`);
    }
    total += buf.length;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(400, "Attachments exceed 10MB total limit");
    }
    out.push({
      filename,
      contentType,
      contentBase64: String(att.contentBase64),
      size: buf.length,
    });
  }
  return out;
}
