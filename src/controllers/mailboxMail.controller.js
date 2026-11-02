import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { MailboxAccount } from "../models/mailboxAccount.model.js";
import { MailboxUserAccess } from "../models/mailboxUserAccess.model.js";
import {
  loadActorFromDb,
  getActiveMailboxAccess,
  permissionAllows,
  isMailboxAdmin,
  isAssignmentDeptAligned,
  canAccessMapping,
} from "../utils/mailbox/permissions.js";
import { writeMailboxAudit } from "../utils/mailbox/audit.js";
import { formatMailboxConnError } from "../services/mailbox/imapClient.js";
import {
  listFolders,
  listMessages,
  getMessage,
  getAttachment,
  setMessageFlags,
} from "../services/mailbox/imapService.js";
import { sanitizeMailboxDoc } from "../utils/mailbox/crypto.js";
import { contentDispositionAttachment } from "../utils/mailbox/mailSchemas.js";

async function requireMailAccess(req, mailboxId, action = "read") {
  const actor = await loadActorFromDb(req.user._id);
  const result = await getActiveMailboxAccess(actor._id, mailboxId);
  if (!result) {
    throw new ApiError(403, "No access to this mailbox");
  }
  if (!permissionAllows(result.access.permission, action)) {
    throw new ApiError(403, "Insufficient mailbox permission");
  }
  return { actor, ...result };
}

function wrapImapError(err, actor) {
  if (err instanceof ApiError) throw err;
  const detail = formatMailboxConnError(err, isMailboxAdmin(actor));
  throw new ApiError(502, detail);
}

/** Assigned mailboxes for the logged-in user (Inbox switcher). */
export const listMyMailboxes = asyncHandler(async (req, res) => {
  const actor = await loadActorFromDb(req.user._id);
  const accessRows = await MailboxUserAccess.find({ userId: actor._id }).lean();
  if (!accessRows.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, { mailboxes: [] }, "No mailboxes assigned"));
  }

  const mailboxIds = accessRows.map((a) => a.mailboxId);
  const mailboxes = await MailboxAccount.find({
    _id: { $in: mailboxIds },
    isActive: true,
  })
    .populate({
      path: "brandId",
      select: "name departmentId",
      populate: { path: "departmentId", select: "name" },
    })
    .lean();

  const accessByMb = new Map(
    accessRows.map((a) => [String(a.mailboxId), a]),
  );

  const canSeeConnDetail = canAccessMapping(actor);
  const list = [];
  for (const m of mailboxes) {
    const brand = m.brandId;
    if (!isAssignmentDeptAligned(actor, brand)) continue;
    const access = accessByMb.get(String(m._id));
    const doc = sanitizeMailboxDoc(m);
    // Non-mapping roles get a generic status only — no host/auth detail
    if (!canSeeConnDetail) {
      doc.lastError = doc.lastError ? "unavailable" : null;
    }
    list.push({
      ...doc,
      permission: access?.permission || "read",
      brandName: brand?.name || "",
      departmentName: brand?.departmentId?.name || "",
      departmentId: brand?.departmentId?._id || brand?.departmentId || null,
      connectionStatus: doc.lastError ? "unavailable" : "ok",
    });
  }

  // Group by brand for UI
  const byBrand = new Map();
  for (const m of list) {
    const key = String(m.brandId?._id || m.brandId);
    if (!byBrand.has(key)) {
      byBrand.set(key, {
        brandId: key,
        brandName: m.brandName,
        departmentName: m.departmentName,
        mailboxes: [],
      });
    }
    byBrand.get(key).mailboxes.push(m);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { mailboxes: list, grouped: [...byBrand.values()] },
      "My mailboxes",
    ),
  );
});

export const getFolders = asyncHandler(async (req, res) => {
  const { actor } = await requireMailAccess(req, req.params.mailboxId, "read");
  try {
    const data = await listFolders(req.params.mailboxId);
    return res.status(200).json(new ApiResponse(200, data, "Folders"));
  } catch (err) {
    wrapImapError(err, actor);
  }
});

export const getMessages = asyncHandler(async (req, res) => {
  const { actor } = await requireMailAccess(req, req.params.mailboxId, "read");
  const folder = req.query.folder || "INBOX";
  try {
    const data = await listMessages(req.params.mailboxId, folder, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
      flaggedOnly: req.query.flagged === "1" || folder === "important",
    });
    return res.status(200).json(new ApiResponse(200, data, "Messages"));
  } catch (err) {
    wrapImapError(err, actor);
  }
});

export const getMessageByUid = asyncHandler(async (req, res) => {
  const { actor } = await requireMailAccess(req, req.params.mailboxId, "read");
  const folder = req.query.folder || "INBOX";
  try {
    const data = await getMessage(
      req.params.mailboxId,
      folder,
      req.params.uid,
      {
        markSeen: req.query.markSeen !== "0",
        loadImages: req.query.loadImages !== "0",
      },
    );
    await writeMailboxAudit({
      action: "mailbox_message_open",
      actor,
      mailboxId: req.params.mailboxId,
      meta: { uid: Number(req.params.uid), folder: data.folder },
    });
    return res.status(200).json(new ApiResponse(200, data, "Message"));
  } catch (err) {
    wrapImapError(err, actor);
  }
});

export const downloadAttachment = asyncHandler(async (req, res) => {
  const { actor } = await requireMailAccess(req, req.params.mailboxId, "read");
  const folder = req.query.folder || "INBOX";
  try {
    const file = await getAttachment(
      req.params.mailboxId,
      folder,
      req.params.uid,
      req.params.index,
    );
    await writeMailboxAudit({
      action: "mailbox_attachment_download",
      actor,
      mailboxId: req.params.mailboxId,
      meta: {
        uid: Number(req.params.uid),
        index: Number(req.params.index),
        filename: file.filename,
      },
    });
    res.setHeader(
      "Content-Type",
      file.contentType || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(file.filename),
    );
    return res.status(200).send(file.content);
  } catch (err) {
    wrapImapError(err, actor);
  }
});

export const patchMessageFlags = asyncHandler(async (req, res) => {
  const { actor } = await requireMailAccess(req, req.params.mailboxId, "read");
  const folder = req.body?.folder || req.query.folder || "INBOX";
  const { seen, flagged } = req.body || {};
  try {
    const data = await setMessageFlags(
      req.params.mailboxId,
      folder,
      req.params.uid,
      { seen, flagged },
    );
    return res.status(200).json(new ApiResponse(200, data, "Flags updated"));
  } catch (err) {
    wrapImapError(err, actor);
  }
});
