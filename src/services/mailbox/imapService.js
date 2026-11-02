import { simpleParser } from "mailparser";
import DOMPurify from "isomorphic-dompurify";
import { withImap } from "./imapClient.js";
import { ApiError } from "../../utils/ApiError.js";

/** Special-use → logical role */
const SPECIAL_USE_MAP = {
  "\\inbox": "inbox",
  "\\sent": "sent",
  "\\drafts": "drafts",
  "\\junk": "junk",
  "\\trash": "trash",
  "\\archive": "archive",
};

const NAME_FALLBACKS = {
  inbox: ["INBOX", "Inbox"],
  sent: ["INBOX.Sent", "Sent", "Sent Messages", "Sent Items", "Sent Mail"],
  drafts: ["INBOX.Drafts", "Drafts", "Draft"],
  junk: ["INBOX.spam", "INBOX.Junk", "spam", "Spam", "Junk", "Junk E-mail"],
  trash: ["INBOX.Trash", "Trash", "Deleted Messages", "Deleted Items", "Bin"],
  archive: ["INBOX.Archive", "Archive", "Archives"],
};

/**
 * @param {string} path
 * @param {string[]} [specialUse]
 * @param {string} [name]
 */
function classifyFolder(path, specialUse = [], name = "") {
  const uses = (specialUse || []).map((s) => String(s).toLowerCase());
  for (const u of uses) {
    if (SPECIAL_USE_MAP[u]) return SPECIAL_USE_MAP[u];
  }
  const p = String(path || "");
  const n = String(name || path || "");
  if (p.toUpperCase() === "INBOX" || n.toUpperCase() === "INBOX") return "inbox";
  for (const [role, names] of Object.entries(NAME_FALLBACKS)) {
    if (role === "inbox") continue;
    if (names.some((x) => x.toLowerCase() === p.toLowerCase() || x.toLowerCase() === n.toLowerCase())) {
      return role;
    }
  }
  return "custom";
}

/**
 * @param {string} mailboxId
 */
export async function listFolders(mailboxId) {
  return withImap(mailboxId, async (client) => {
    const boxes = await client.list();
    const folders = [];
    for (const box of boxes) {
      if (box.flags?.has?.("\\Noselect") || box.flags?.has?.("\\NonExistent")) {
        continue;
      }
      const path = box.path;
      const specialUse = box.specialUse
        ? [box.specialUse]
        : [...(box.flags || [])].filter((f) => String(f).startsWith("\\"));
      const role = classifyFolder(path, specialUse, box.name);
      let status = { messages: 0, unseen: 0 };
      try {
        const st = await client.status(path, { messages: true, unseen: true });
        status = {
          messages: st.messages || 0,
          unseen: st.unseen || 0,
        };
      } catch {
        /* folder may be unselectable */
      }
      folders.push({
        path,
        name: box.name || path,
        role,
        specialUse: box.specialUse || null,
        messages: status.messages,
        unseen: status.unseen,
      });
    }

    // Prefer special-use when duplicate roles exist
    const byRole = new Map();
    for (const f of folders) {
      if (f.role === "custom") continue;
      const prev = byRole.get(f.role);
      if (!prev || f.specialUse) byRole.set(f.role, f);
    }

    return {
      folders: folders.sort((a, b) => a.path.localeCompare(b.path)),
      roles: Object.fromEntries(
        [...byRole.entries()].map(([k, v]) => [k, v.path]),
      ),
    };
  });
}

/**
 * Resolve folder path from logical role or raw path.
 * @param {import("imapflow").ImapFlow} client
 * @param {string} folderOrRole
 */
async function resolveFolderPath(client, folderOrRole) {
  if (!folderOrRole) return "INBOX";
  const raw = String(folderOrRole);
  if (raw.includes("/") || raw.includes(".") || raw.toUpperCase() === "INBOX") {
    return raw;
  }
  const role = raw.toLowerCase();
  if (role === "important") return "INBOX"; // filtered view
  const boxes = await client.list();
  for (const box of boxes) {
    const specialUse = box.specialUse ? [box.specialUse] : [];
    if (classifyFolder(box.path, specialUse, box.name) === role) {
      return box.path;
    }
  }
  const fallbacks = NAME_FALLBACKS[role] || [];
  for (const name of fallbacks) {
    if (boxes.some((b) => b.path.toLowerCase() === name.toLowerCase())) {
      return boxes.find((b) => b.path.toLowerCase() === name.toLowerCase()).path;
    }
  }
  if (role === "inbox") return "INBOX";
  throw new ApiError(404, `Folder not found: ${folderOrRole}`);
}

/**
 * @param {string} mailboxId
 * @param {string} folder
 * @param {{ page?: number, pageSize?: number, search?: string, flaggedOnly?: boolean }} opts
 */
export async function listMessages(mailboxId, folder, opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 25));
  const search = String(opts.search || "").trim();
  const flaggedOnly = Boolean(opts.flaggedOnly) || folder === "important";

  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(
      client,
      flaggedOnly && folder === "important" ? "inbox" : folder,
    );
    const lock = await client.getMailboxLock(path);
    try {
      let uids;
      if (search || flaggedOnly) {
        /** @type {object} */
        const criteria = { all: true };
        if (flaggedOnly) criteria.flagged = true;
        if (search) {
          // IMAP SEARCH OR chain is awkward; use imapflow search object
          uids = await client.search(
            {
              or: [
                { subject: search },
                { from: search },
                { to: search },
                { body: search },
              ],
              ...(flaggedOnly ? { flagged: true } : {}),
            },
            { uid: true },
          );
        } else {
          uids = await client.search({ flagged: true }, { uid: true });
        }
      } else {
        uids = await client.search({ all: true }, { uid: true });
      }

      if (!Array.isArray(uids)) uids = [];
      uids.sort((a, b) => b - a); // newest first
      const total = uids.length;
      const start = (page - 1) * pageSize;
      const pageUids = uids.slice(start, start + pageSize);

      const messages = [];
      if (pageUids.length) {
        for await (const msg of client.fetch(
          pageUids,
          {
            uid: true,
            flags: true,
            envelope: true,
            bodyStructure: true,
            internalDate: true,
            size: true,
          },
          { uid: true },
        )) {
          const env = msg.envelope || {};
          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            subject: env.subject || "(no subject)",
            from: formatAddresses(env.from),
            to: formatAddresses(env.to),
            cc: formatAddresses(env.cc),
            date: env.date || msg.internalDate || null,
            flags: [...(msg.flags || [])],
            seen: msg.flags?.has("\\Seen") || false,
            flagged: msg.flags?.has("\\Flagged") || false,
            answered: msg.flags?.has("\\Answered") || false,
            hasAttachments: structureHasAttachment(msg.bodyStructure),
            size: msg.size || 0,
          });
        }
        messages.sort((a, b) => b.uid - a.uid);
      }

      return {
        folder: path,
        page,
        pageSize,
        total,
        messages,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * @param {string} mailboxId
 * @param {string} folder
 * @param {number} uid
 * @param {{ markSeen?: boolean, loadImages?: boolean }} [opts]
 */
export async function getMessage(mailboxId, folder, uid, opts = {}) {
  const markSeen = opts.markSeen !== false;
  // Remote images load by default (CRM preference)
  const loadImages = opts.loadImages !== false;

  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      const uidNum = Number(uid);
      if (!uidNum) throw new ApiError(400, "Invalid UID");

      let source = null;
      let flags = new Set();
      let envelope = null;
      for await (const msg of client.fetch(
        uidNum,
        { uid: true, flags: true, envelope: true, source: true, bodyStructure: true },
        { uid: true },
      )) {
        source = msg.source;
        flags = msg.flags || new Set();
        envelope = msg.envelope;
      }
      if (!source) throw new ApiError(404, "Message not found");

      if (markSeen && !flags.has("\\Seen")) {
        await client.messageFlagsAdd(uidNum, ["\\Seen"], { uid: true });
        flags.add("\\Seen");
      }

      const parsed = await simpleParser(source);
      const attachments = (parsed.attachments || []).map((att, idx) => ({
        index: idx,
        filename: att.filename || `attachment-${idx + 1}`,
        contentType: att.contentType || "application/octet-stream",
        size: att.size || (att.content ? att.content.length : 0),
        contentId: att.contentId ? String(att.contentId).replace(/[<>]/g, "") : null,
        related: Boolean(att.related),
      }));

      let html = parsed.html || "";
      if (!html && parsed.text) {
        html = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(parsed.text)}</pre>`;
      }

      // cid: → data URLs for inline images we have
      const cidMap = new Map();
      for (const att of parsed.attachments || []) {
        if (att.contentId && att.content) {
          const cid = String(att.contentId).replace(/[<>]/g, "");
          const b64 = Buffer.from(att.content).toString("base64");
          const ct = att.contentType || "application/octet-stream";
          cidMap.set(cid, `data:${ct};base64,${b64}`);
        }
      }
      html = html.replace(
        /(?:src\s*=\s*["'])cid:([^"']+)(["'])/gi,
        (_, cid, q) => {
          const data = cidMap.get(String(cid).replace(/[<>]/g, ""));
          return data ? `src=${q}${data}${q}` : `src=${q}cid:${cid}${q}`;
        },
      );

      if (!loadImages) {
        html = html.replace(
          /(<img\b[^>]*\bsrc\s*=\s*["'])(?!data:)(https?:\/\/[^"']+)(["'][^>]*>)/gi,
          '$1#$2$3 data-blocked-src="$2"',
        );
      }

      const safeHtml = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["data-blocked-src"],
      });

      return {
        uid: uidNum,
        folder: path,
        subject: envelope?.subject || parsed.subject || "(no subject)",
        from: formatAddresses(envelope?.from || parsed.from?.value),
        to: formatAddresses(envelope?.to || parsed.to?.value),
        cc: formatAddresses(envelope?.cc || parsed.cc?.value),
        date: envelope?.date || parsed.date || null,
        flags: [...flags],
        seen: flags.has("\\Seen"),
        flagged: flags.has("\\Flagged"),
        text: parsed.text || "",
        html: safeHtml,
        imagesBlocked: !loadImages,
        attachments: attachments.filter((a) => !a.related),
        messageId: parsed.messageId || null,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * @param {string} mailboxId
 * @param {string} folder
 * @param {number} uid
 * @param {number} attachmentIndex
 */
export async function getAttachment(mailboxId, folder, uid, attachmentIndex) {
  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      const uidNum = Number(uid);
      const idx = Number(attachmentIndex);
      if (!uidNum || Number.isNaN(idx) || idx < 0) {
        throw new ApiError(400, "Invalid attachment request");
      }

      let source = null;
      for await (const msg of client.fetch(
        uidNum,
        { uid: true, source: true },
        { uid: true },
      )) {
        source = msg.source;
      }
      if (!source) throw new ApiError(404, "Message not found");

      const parsed = await simpleParser(source);
      const list = (parsed.attachments || []).filter((a) => !a.related);
      const att = list[idx];
      if (!att) throw new ApiError(404, "Attachment not found");

      return {
        filename: att.filename || `attachment-${idx + 1}`,
        contentType: att.contentType || "application/octet-stream",
        content: Buffer.from(att.content),
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * @param {string} mailboxId
 * @param {string} folder
 * @param {number} uid
 * @param {{ seen?: boolean, flagged?: boolean }} flags
 */
export async function setMessageFlags(mailboxId, folder, uid, flags) {
  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      const uidNum = Number(uid);
      if (!uidNum) throw new ApiError(400, "Invalid UID");
      if (typeof flags.seen === "boolean") {
        if (flags.seen) {
          await client.messageFlagsAdd(uidNum, ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove(uidNum, ["\\Seen"], { uid: true });
        }
      }
      if (typeof flags.flagged === "boolean") {
        if (flags.flagged) {
          await client.messageFlagsAdd(uidNum, ["\\Flagged"], { uid: true });
        } else {
          await client.messageFlagsRemove(uidNum, ["\\Flagged"], { uid: true });
        }
      }
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

/**
 * @param {string} mailboxId
 * @param {string} folder
 * @param {number[]} uids
 * @param {{ seen?: boolean, flagged?: boolean }} flags
 */
export async function setMessagesFlags(mailboxId, folder, uids, flags) {
  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      const list = (uids || []).map(Number).filter(Boolean);
      if (!list.length) throw new ApiError(400, "No UIDs");
      if (typeof flags.seen === "boolean") {
        if (flags.seen) {
          await client.messageFlagsAdd(list, ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove(list, ["\\Seen"], { uid: true });
        }
      }
      if (typeof flags.flagged === "boolean") {
        if (flags.flagged) {
          await client.messageFlagsAdd(list, ["\\Flagged"], { uid: true });
        } else {
          await client.messageFlagsRemove(list, ["\\Flagged"], { uid: true });
        }
      }
      return { ok: true, count: list.length };
    } finally {
      lock.release();
    }
  });
}

/**
 * Move messages to another folder (e.g. spam / archive / custom).
 */
export async function moveMessages(mailboxId, folder, uids, targetFolder) {
  return withImap(mailboxId, async (client) => {
    const source = await resolveFolderPath(client, folder);
    const dest = await resolveFolderPath(client, targetFolder);
    const lock = await client.getMailboxLock(source);
    try {
      const list = (uids || []).map(Number).filter(Boolean);
      if (!list.length) throw new ApiError(400, "No UIDs");
      await client.messageMove(list, dest, { uid: true });
      return { ok: true, from: source, to: dest, count: list.length };
    } finally {
      lock.release();
    }
  });
}

/**
 * Delete: move to Trash, or permanent expunge if already in Trash / permanent=true.
 * When allowPermanent is false (read_send), only move-to-Bin is allowed —
 * never expunge, even if the message is already in Trash.
 *
 * @param {string} mailboxId
 * @param {string} folder
 * @param {number[]} uids
 * @param {boolean} [permanent]
 * @param {{ allowPermanent?: boolean }} [opts]
 */
export async function deleteMessages(
  mailboxId,
  folder,
  uids,
  permanent = false,
  opts = {},
) {
  const allowPermanent = opts.allowPermanent !== false;
  return withImap(mailboxId, async (client) => {
    const source = await resolveFolderPath(client, folder);
    const list = (uids || []).map(Number).filter(Boolean);
    if (!list.length) throw new ApiError(400, "No UIDs");

    let trashPath = null;
    try {
      trashPath = await resolveFolderPath(client, "trash");
    } catch {
      trashPath = null;
    }

    const alreadyTrash =
      trashPath && source.toLowerCase() === trashPath.toLowerCase();
    const wouldPermanent = permanent || alreadyTrash || !trashPath;

    if (wouldPermanent && !allowPermanent) {
      throw new ApiError(
        403,
        "Permanent delete requires manage permission; read_send can only move messages to Bin",
      );
    }

    const lock = await client.getMailboxLock(source);
    try {
      if (wouldPermanent) {
        await client.messageDelete(list, { uid: true });
        return { ok: true, permanent: true, count: list.length };
      }
      await client.messageMove(list, trashPath, { uid: true });
      return {
        ok: true,
        permanent: false,
        to: trashPath,
        count: list.length,
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Mark as spam = move to Junk folder.
 */
export async function markMessagesSpam(mailboxId, folder, uids) {
  return moveMessages(mailboxId, folder, uids, "junk");
}

/**
 * Build RFC822 and APPEND to Sent / Drafts.
 * @param {string} mailboxId
 * @param {"sent"|"drafts"} role
 * @param {object} mail - from smtpSend result or compose payload
 * @param {{ draft?: boolean }} [opts]
 */
export async function appendOutboundMessage(mailboxId, role, mail, opts = {}) {
  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, role);
    const raw = buildRfc822(mail);
    const flags = opts.draft ? ["\\Draft", "\\Seen"] : ["\\Seen"];
    const result = await client.append(path, raw, flags, new Date());
    return {
      ok: true,
      folder: path,
      uid: result?.uid || null,
    };
  });
}

/**
 * Save / update draft in Drafts folder.
 */
export async function saveDraftMessage(mailboxId, mail, existingDraftUid = null) {
  return withImap(mailboxId, async (client) => {
    const path = await resolveFolderPath(client, "drafts");
    if (existingDraftUid) {
      const lock = await client.getMailboxLock(path);
      try {
        await client.messageDelete([Number(existingDraftUid)], { uid: true });
      } catch {
        /* draft may already be gone */
      } finally {
        lock.release();
      }
    }
    const raw = buildRfc822({ ...mail, draft: true });
    const result = await client.append(
      path,
      raw,
      ["\\Draft", "\\Seen"],
      new Date(),
    );
    return { ok: true, folder: path, uid: result?.uid || null };
  });
}

/**
 * @param {object} mail
 */
function buildRfc822(mail) {
  const fromAddress = mail.fromAddress || mail.from || "";
  const fromName = mail.fromName || "";
  const fromHeader = fromName
    ? `"${String(fromName).replace(/"/g, "")}" <${fromAddress}>`
    : fromAddress;
  const to = (mail.to || []).join(", ");
  const cc = (mail.cc || []).join(", ");
  // BCC must never appear on IMAP Drafts (shared with other assignees).
  // Outbound SMTP still receives BCC via nodemailer envelope; Sent copies
  // may omit BCC as well for the same privacy reason unless explicitly needed.
  const includeBcc = Boolean(mail.includeBccHeader) && !mail.draft;
  const bcc = includeBcc ? (mail.bcc || []).join(", ") : "";
  const subject = String(mail.subject || "").replace(/[\r\n]+/g, " ");
  const boundary = `----=_Mailbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const attachments = mail._rawAttachments || [];

  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Date: ${new Date().toUTCString()}`,
    mail.messageId ? `Message-ID: ${mail.messageId}` : null,
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : null,
    mail.references ? `References: ${mail.references}` : null,
  ].filter(Boolean);

  if (!attachments.length) {
    headers.push("Content-Type: text/html; charset=utf-8");
    headers.push("Content-Transfer-Encoding: 7bit");
    return `${headers.join("\r\n")}\r\n\r\n${mail.bodyHtml || ""}\r\n`;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [];
  parts.push(
    `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${mail.bodyHtml || ""}\r\n`,
  );
  for (const att of attachments) {
    const b64 = Buffer.from(att.content).toString("base64");
    const wrapped = b64.replace(/(.{76})/g, "$1\r\n");
    parts.push(
      `--${boundary}\r\nContent-Type: ${att.contentType || "application/octet-stream"}; name="${att.filename}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${att.filename}"\r\n\r\n${wrapped}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("")}`;
}

function formatAddresses(list) {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  return arr
    .map((a) => {
      if (!a) return null;
      if (typeof a === "string") return { name: "", address: a };
      const address =
        a.address ||
        (a.mailbox && a.host ? `${a.mailbox}@${a.host}` : "");
      return { name: a.name || "", address };
    })
    .filter((a) => a && a.address);
}

function structureHasAttachment(node) {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  if (node.type === "multipart" && Array.isArray(node.childNodes)) {
    return node.childNodes.some(structureHasAttachment);
  }
  return false;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
