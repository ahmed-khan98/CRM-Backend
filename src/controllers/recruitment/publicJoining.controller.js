import fs from "fs";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  JoiningDetails,
  Offer,
  hashJoiningToken,
  normalizeJoiningRawToken,
} from "../../models/recruitment/index.js";
import {
  canCandidateEditJoining,
  hashOfferRespondToken,
  publicJoiningShape,
  finalizeOfferResponse,
  mergeJoiningData,
  validateJoiningSubmit,
} from "../../utils/joiningHelpers.js";
import {
  getOrCreateSettings,
  sendTemplatedEmail,
  logActivity,
} from "../../utils/recruitmentHelpers.js";
import { uploadAttachmentOnCloudinary } from "../../utils/cloudinary.js";
import { parseMaybeJson } from "../../utils/hrmsHelpers.js";

const DOC_TYPES = [
  "PROFILE_PICTURE",
  "CV",
  "EXPERIENCE_CERTIFICATE",
  "CNIC_PASSPORT",
  "EDUCATIONAL_DOCUMENTS",
  "SALARY_SLIPS",
  "SKILL_CERTIFICATES",
  "OTHER",
];

async function findJoiningByRawToken(raw) {
  const token = normalizeJoiningRawToken(raw);
  if (!token || token.length < 20) return null;
  const hash = hashJoiningToken(token);
  return JoiningDetails.findOne({
    isDeleted: false,
    $or: [{ tokenHash: hash }, { "previousTokenHashes.hash": hash }],
  });
}

export const publicGetJoining = asyncHandler(async (req, res) => {
  const doc = await findJoiningByRawToken(req.params.token);
  if (!doc) {
    throw new ApiError(
      404,
      "This joining link is no longer valid. Please open the latest email from HR, or ask them to resend the link."
    );
  }

  const now = new Date();
  const expiredByDate =
    doc.expiresAt && new Date(doc.expiresAt).getTime() < now.getTime();

  // Recover false "expired" if expiry is still in the future (e.g. after resend)
  if (doc.status === "expired" && !expiredByDate) {
    doc.status = "sent";
    await doc.save();
  }

  const expired =
    expiredByDate &&
    !["submitted", "approved", "used", "changes_requested"].includes(
      doc.status
    );
  if (expired && doc.status !== "expired") {
    doc.status = "expired";
    await doc.save();
  }

  const editable = canCandidateEditJoining(doc);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        publicJoiningShape(doc, { editable }),
        "Joining details"
      )
    );
});

export const publicSaveJoiningDraft = asyncHandler(async (req, res) => {
  const doc = await findJoiningByRawToken(req.params.token);
  if (!doc) throw new ApiError(404, "Joining link not found");
  if (!canCandidateEditJoining(doc)) {
    throw new ApiError(400, "This form can no longer be edited");
  }

  const payload = parseMaybeJson(req.body.data) || req.body;
  doc.data = mergeJoiningData(doc.data, payload);
  if (doc.status === "sent" || doc.status === "changes_requested") {
    doc.status = "draft";
  }
  doc.editLog.push({
    at: new Date(),
    by: null,
    section: "draft",
    note: "Candidate saved draft",
  });
  await doc.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        publicJoiningShape(doc, { editable: true }),
        "Draft saved"
      )
    );
});

export const publicSubmitJoining = asyncHandler(async (req, res) => {
  const doc = await findJoiningByRawToken(req.params.token);
  if (!doc) throw new ApiError(404, "Joining link not found");
  if (!canCandidateEditJoining(doc)) {
    throw new ApiError(400, "This form can no longer be submitted");
  }

  const payload = parseMaybeJson(req.body.data) || req.body;
  doc.data = mergeJoiningData(doc.data, payload);

  const check = validateJoiningSubmit(doc.data);
  if (!check.ok) {
    throw new ApiError(400, check.message);
  }

  doc.status = "submitted";
  doc.submittedAt = new Date();
  doc.editLog.push({
    at: new Date(),
    by: null,
    section: "submit",
    note: "Candidate submitted joining details",
  });
  await doc.save();

  await logActivity({
    entityType: "joining",
    entityId: doc._id,
    action: "joining_submitted",
    meta: { offerId: doc.offerId },
  });

  const settings = await getOrCreateSettings();
  const hrNotify = String(process.env.RECRUITMENT_HR_NOTIFY_EMAIL || "").trim();
  if (hrNotify) {
    await sendTemplatedEmail(
      "joining_submitted_hr",
      hrNotify,
      {
        candidate_name: doc.candidateName,
        job_title: doc.jobTitle,
        company_name: doc.companyName || settings.companyName,
      },
      { type: "joining", id: doc._id }
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        publicJoiningShape(doc, { editable: false }),
        "Submitted"
      )
    );
});

export const publicUploadJoiningFile = asyncHandler(async (req, res) => {
  const doc = await findJoiningByRawToken(req.params.token);
  if (!doc) throw new ApiError(404, "Joining link not found");
  if (!canCandidateEditJoining(doc)) {
    throw new ApiError(400, "This form can no longer be edited");
  }
  if (!req.file) throw new ApiError(400, "File required");

  const kind = String(req.body.kind || "document").toLowerCase();
  const uploaded = await uploadAttachmentOnCloudinary(req.file);
  try {
    fs.unlinkSync(req.file.path);
  } catch {
    /* ignore */
  }
  if (uploaded?.error || !uploaded?.secure_url) {
    throw new ApiError(500, uploaded?.error || "Upload failed");
  }

  if (kind === "photo") {
    doc.data = doc.data || {};
    doc.data.personal = doc.data.personal || {};
    doc.data.personal.photoUrl = uploaded.secure_url;
    doc.data.personal.photoPublicId = uploaded.public_id || "";
  } else {
    const documentType = DOC_TYPES.includes(req.body.documentType)
      ? req.body.documentType
      : "OTHER";
    if (!Array.isArray(doc.data.documents)) doc.data.documents = [];
    doc.data.documents.push({
      documentType,
      fileUrl: uploaded.secure_url,
      fileName: req.file.originalname || "",
      publicId: uploaded.public_id || "",
      mimeType: req.file.mimetype || "",
      notes: String(req.body.notes || ""),
    });
  }

  if (doc.status === "sent") doc.status = "draft";
  await doc.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        publicJoiningShape(doc, { editable: true }),
        "Uploaded"
      )
    );
});

/** GET offer summary for magic-link respond page */
export const publicGetOfferRespond = asyncHandler(async (req, res) => {
  const raw = String(req.params.token || "").trim();
  if (!raw || raw.length < 20) throw new ApiError(404, "Link not found");
  const hash = hashOfferRespondToken(raw);
  const offer = await Offer.findOne({
    respondTokenHash: hash,
    isDeleted: false,
  }).lean();
  if (!offer) throw new ApiError(404, "Offer link not found or already used");

  const expired =
    offer.respondTokenExpiresAt &&
    new Date(offer.respondTokenExpiresAt) < new Date();
  if (expired) throw new ApiError(410, "This offer link has expired");

  if (offer.status !== "sent" && offer.status !== "draft") {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          status: offer.status,
          alreadyFinalized: true,
          candidateName: offer.candidateName,
          jobTitle: offer.jobTitle,
          companyName: offer.companyName,
        },
        "Offer already responded"
      )
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        status: offer.status,
        alreadyFinalized: false,
        candidateName: offer.candidateName,
        jobTitle: offer.jobTitle,
        companyName: offer.companyName,
        salary: offer.salary,
        salaryCurrency: offer.salaryCurrency,
        joiningDate: offer.joiningDate,
        subject: offer.subject,
        bodyHtml: offer.bodyHtml,
        expiresAt: offer.respondTokenExpiresAt,
      },
      "Offer"
    )
  );
});

/** POST accept/decline via email magic link */
export const publicRespondOffer = asyncHandler(async (req, res) => {
  const raw = String(req.params.token || "").trim();
  const action = String(req.body.action || req.query.action || "")
    .toLowerCase()
    .trim();
  const status =
    action === "accept" || action === "accepted"
      ? "accepted"
      : action === "decline" || action === "declined"
        ? "declined"
        : null;
  if (!status) throw new ApiError(400, "action must be accept or decline");
  if (!raw || raw.length < 20) throw new ApiError(404, "Link not found");

  const hash = hashOfferRespondToken(raw);
  const offer = await Offer.findOne({
    respondTokenHash: hash,
    isDeleted: false,
  });
  if (!offer) throw new ApiError(404, "Offer link not found or already used");

  if (
    offer.respondTokenExpiresAt &&
    new Date(offer.respondTokenExpiresAt) < new Date()
  ) {
    throw new ApiError(410, "This offer link has expired");
  }

  let result;
  try {
    result = await finalizeOfferResponse({
      offer,
      status,
      actorId: null,
      via: "public",
    });
  } catch (err) {
    throw new ApiError(400, err.message || "Cannot respond to offer");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        status: result.offer.status,
        joiningSent: Boolean(result.joining),
        candidateName: result.offer.candidateName,
        jobTitle: result.offer.jobTitle,
      },
      status === "accepted" ? "Offer accepted" : "Offer declined"
    )
  );
});
