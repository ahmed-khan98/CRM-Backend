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

function toListItem(m, permission, canSeeConnDetail) {
  const brand = m.brandId;
  const doc = sanitizeMailboxDoc(m);
  if (!canSeeConnDetail) {
    doc.lastError = doc.lastError ? "unavailable" : null;
  }
  const isPersonal = m.kind === "personal";
  return {
    ...doc,
    kind: isPersonal ? "personal" : "brand",
    permission,
    brandName: isPersonal ? "Company" : brand?.name || "",
    departmentName: isPersonal
      ? "Internal"
      : (Array.isArray(brand?.departmentIds) && brand.departmentIds.length
          ? brand.departmentIds.map((d) => d?.name).filter(Boolean).join(", ")
          : brand?.departmentId?.name) || "",
    departmentId: isPersonal
      ? null
      : brand?.departmentId?._id || brand?.departmentId || null,
    departmentIds: isPersonal
      ? []
      : Array.isArray(brand?.departmentIds) && brand.departmentIds.length
        ? brand.departmentIds.map((d) => d?._id || d)
        : brand?.departmentId
          ? [brand.departmentId?._id || brand.departmentId]
          : [],
    connectionStatus: doc.lastError ? "unavailable" : "ok",
  };
}

/** Assigned brand mailboxes + own personal company mailbox (Inbox switcher). */
export const listMyMailboxes = asyncHandler(async (req, res) => {
  const actor = await loadActorFromDb(req.user._id);
  const canSeeConnDetail = canAccessMapping(actor);
  const list = [];

  const personal = await MailboxAccount.findOne({
    kind: "personal",
    ownerUserId: actor._id,
    isActive: true,
  }).lean();
  if (personal) {
    list.push(toListItem(personal, "manage", canSeeConnDetail));
  }

  const accessRows = await MailboxUserAccess.find({ userId: actor._id }).lean();
  if (accessRows.length) {
    const mailboxIds = accessRows.map((a) => a.mailboxId);
    const mailboxes = await MailboxAccount.find({
      _id: { $in: mailboxIds },
      isActive: true,
      kind: { $ne: "personal" },
    })
      .populate({
        path: "brandId",
        select: "name departmentId departmentIds",
        populate: [
          { path: "departmentId", select: "name" },
          { path: "departmentIds", select: "name" },
        ],
      })
      .lean();

    const accessByMb = new Map(
      accessRows.map((a) => [String(a.mailboxId), a]),
    );

    for (const m of mailboxes) {
      const brand = m.brandId;
      if (!isAssignmentDeptAligned(actor, brand)) continue;
      const access = accessByMb.get(String(m._id));
      list.push(
        toListItem(m, access?.permission || "read", canSeeConnDetail),
      );
    }
  }

  // Brand mailboxes first; company (personal) last — reduces accidental client sends
  const brandItems = list.filter((m) => m.kind !== "personal");
  const personalItems = list.filter((m) => m.kind === "personal");
  const orderedList = [...brandItems, ...personalItems];

  const grouped = [];
  const byBrand = new Map();
  for (const m of brandItems) {
    const key = String(m.brandId?._id || m.brandId);
    if (!byBrand.has(key)) {
      byBrand.set(key, {
        brandId: key,
        brandName: m.brandName,
        departmentName: m.departmentName,
        kind: "brand",
        mailboxes: [],
      });
    }
    byBrand.get(key).mailboxes.push(m);
  }
  grouped.push(...byBrand.values());

  if (personalItems.length) {
    grouped.push({
      brandId: "personal",
      brandName: "My company email",
      departmentName: "Internal",
      kind: "personal",
      mailboxes: personalItems,
    });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { mailboxes: orderedList, grouped },
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
