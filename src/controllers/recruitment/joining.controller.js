import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  JoiningDetails,
  Offer,
  Application,
  Candidate,
  createJoiningToken,
} from "../../models/recruitment/index.js";
import {
  getOrCreateSettings,
  sendTemplatedEmail,
  logActivity,
} from "../../utils/recruitmentHelpers.js";
import {
  canHrEditJoining,
  getPublicAppBaseUrl,
  hrJoiningShape,
  issueJoiningInvite,
  joiningExpiryDate,
  mergeJoiningData,
} from "../../utils/joiningHelpers.js";
import { parseMaybeJson } from "../../utils/hrmsHelpers.js";
import { buildHirePrefillFromOffer } from "../../utils/hireHelpers.js";

const SECTION_KEYS = [
  "personal",
  "emergencyContact",
  "bank",
  "family",
  "previousJobs",
  "documents",
];

async function loadJoiningOrThrow(id) {
  const doc = await JoiningDetails.findOne({ _id: id, isDeleted: false });
  if (!doc) throw new ApiError(404, "Joining details not found");
  return doc;
}

export const getJoiningById = asyncHandler(async (req, res) => {
  const doc = await loadJoiningOrThrow(req.params.id);
  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(doc), "Joining details"));
});

export const getJoiningByOffer = asyncHandler(async (req, res) => {
  const doc = await JoiningDetails.findOne({
    offerId: req.params.offerId,
    isDeleted: false,
  });
  if (!doc) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "No joining details yet"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(doc), "Joining details"));
});

export const listJoiningByCandidate = asyncHandler(async (req, res) => {
  const candidateId = req.params.candidateId || req.query.candidateId;
  if (!candidateId) throw new ApiError(400, "candidateId required");
  const items = await JoiningDetails.find({
    candidateId,
    isDeleted: false,
  })
    .sort({ updatedAt: -1 })
    .lean();
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        items.map((d) => hrJoiningShape(d)),
        "Joining details"
      )
    );
});

export const updateJoiningByHr = asyncHandler(async (req, res) => {
  const doc = await loadJoiningOrThrow(req.params.id);
  if (!canHrEditJoining(doc)) {
    throw new ApiError(400, "Joining details are locked");
  }

  const payload = parseMaybeJson(req.body.data) || req.body;
  const note = String(req.body.note || "").trim();
  doc.data = mergeJoiningData(doc.data, payload);
  doc.editLog.push({
    at: new Date(),
    by: req.user._id,
    section: "hr_edit",
    note: note || "HR corrected joining details",
  });
  await doc.save();

  await logActivity({
    entityType: "joining",
    entityId: doc._id,
    action: "hr_edited",
    actorId: req.user._id,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(doc), "Updated"));
});

export const approveJoining = asyncHandler(async (req, res) => {
  const doc = await loadJoiningOrThrow(req.params.id);
  if (doc.status === "approved") {
    return res
      .status(200)
      .json(new ApiResponse(200, hrJoiningShape(doc), "Already approved"));
  }
  if (doc.status === "used") {
    throw new ApiError(400, "Joining details already used");
  }
  if (doc.status !== "submitted") {
    throw new ApiError(
      400,
      "Only submitted joining details can be approved"
    );
  }

  doc.status = "approved";
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  doc.reviewNote = String(req.body.note || doc.reviewNote || "").trim();
  doc.editLog.push({
    at: new Date(),
    by: req.user._id,
    section: "approve",
    note: doc.reviewNote || "Approved by HR",
  });
  await doc.save();

  await logActivity({
    entityType: "joining",
    entityId: doc._id,
    action: "approved",
    actorId: req.user._id,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(doc), "Approved"));
});

export const requestJoiningChanges = asyncHandler(async (req, res) => {
  const doc = await loadJoiningOrThrow(req.params.id);
  if (["approved", "used"].includes(doc.status)) {
    throw new ApiError(400, "Cannot request changes on locked joining details");
  }
  if (!["submitted", "draft", "sent"].includes(doc.status)) {
    throw new ApiError(400, "Cannot request changes in this status");
  }

  const reviewNote = String(req.body.note || req.body.reviewNote || "").trim();
  if (!reviewNote) throw new ApiError(400, "note is required");

  let sections = parseMaybeJson(req.body.requestedSections) ||
    req.body.requestedSections ||
    [];
  if (!Array.isArray(sections)) sections = [];
  sections = sections
    .map((s) => String(s))
    .filter((s) => SECTION_KEYS.includes(s));

  const settings = await getOrCreateSettings();
  const { raw, hash } = createJoiningToken();
  const expiresAt = joiningExpiryDate(settings);

  doc.status = "changes_requested";
  doc.reviewNote = reviewNote;
  doc.requestedSections = sections;
  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  doc.tokenHash = hash;
  doc.expiresAt = expiresAt;
  doc.sentCount = (doc.sentCount || 0) + 1;
  doc.editLog.push({
    at: new Date(),
    by: req.user._id,
    section: "request_changes",
    note: reviewNote,
    changes: { requestedSections: sections },
  });
  await doc.save();

  const candidate = await Candidate.findById(doc.candidateId);
  const joiningUrl = `${getPublicAppBaseUrl(settings)}/joining/${raw}`;
  if (candidate?.email) {
    await sendTemplatedEmail(
      "joining_changes_requested",
      candidate.email,
      {
        candidate_name: doc.candidateName || candidate.fullName,
        job_title: doc.jobTitle,
        company_name: doc.companyName || settings.companyName,
        review_note: reviewNote,
        joining_url: joiningUrl,
      },
      { type: "joining", id: doc._id }
    );
  }

  await logActivity({
    entityType: "joining",
    entityId: doc._id,
    action: "changes_requested",
    actorId: req.user._id,
    meta: { sections },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(doc), "Changes requested"));
});

/** Prefill payload for existing Add Employee modal */
export const getHirePrefill = asyncHandler(async (req, res) => {
  try {
    const payload = await buildHirePrefillFromOffer(req.params.offerId);
    return res
      .status(200)
      .json(new ApiResponse(200, payload, "Hire prefill"));
  } catch (err) {
    throw new ApiError(err.statusCode || 400, err.message || "Prefill failed");
  }
});

/** Convenience: resend via joining id (also available on offer) */
export const resendJoiningById = asyncHandler(async (req, res) => {
  const doc = await loadJoiningOrThrow(req.params.id);
  if (["approved", "used"].includes(doc.status)) {
    throw new ApiError(400, "Cannot resend for locked joining details");
  }
  const offer = await Offer.findById(doc.offerId);
  const application = await Application.findById(doc.applicationId);
  const candidate = await Candidate.findById(doc.candidateId);
  if (!offer || !application || !candidate?.email) {
    throw new ApiError(400, "Related offer/candidate missing");
  }
  let issued;
  try {
    issued = await issueJoiningInvite({
      offer,
      application,
      candidate,
      actorId: req.user._id,
      resend: true,
    });
  } catch (err) {
    throw new ApiError(400, err.message || "Cannot resend joining link");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, hrJoiningShape(issued.joining), "Link resent"));
});
