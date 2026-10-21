import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Candidate,
  Application,
  ApplicationAnswer,
  RecruitmentNote,
  ApplicationStageHistory,
  JoiningDetails,
} from "../../models/recruitment/index.js";
import { hrJoiningShape } from "../../utils/joiningHelpers.js";
import {
  parsePagination,
  paginatedResponse,
  toNumber,
} from "../../utils/hrmsHelpers.js";
import { parseSkills, logActivity } from "../../utils/recruitmentHelpers.js";
import { fetchAttachmentFromCloudinary } from "../../utils/cloudinary.js";
import { parseCandidateCv } from "../../services/ai/cv/parseCv.js";
import {
  readResumeFromDisk,
  contentTypeForExt,
  sanitizeCandidateForClient,
} from "../../utils/recruitmentCvStore.js";

export const searchCandidates = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false };
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { fullName: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
      { phone: new RegExp(q, "i") },
      { skills: new RegExp(q, "i") },
    ];
  }
  const [items, total] = await Promise.all([
    Candidate.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Candidate.countDocuments(filter),
  ]);
  const safe = items.map((c) => ({
    ...sanitizeCandidateForClient(c),
    hasResume: Boolean(c.resumePath || c.resumeUrl || c.resumePublicId),
  }));
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(safe, total, page, limit),
        "Candidates"
      )
    );
});

export const getCandidate = asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).lean();
  if (!candidate) throw new ApiError(404, "Candidate not found");

  const applications = await Application.find({
    candidateId: candidate._id,
    isDeleted: false,
  })
    .populate("jobId", "title slug status version skills niceToHaveSkills")
    .sort({ createdAt: -1 })
    .lean();

  const notes = await RecruitmentNote.find({
    candidateId: candidate._id,
    isDeleted: false,
  })
    .populate("authorId", "fullName")
    .sort({ createdAt: -1 })
    .lean();

  const appIds = applications.map((a) => a._id);
  const [history, allAnswers] = await Promise.all([
    ApplicationStageHistory.find({
      applicationId: { $in: appIds },
    })
      .populate("by", "fullName")
      .sort({ at: -1 })
      .limit(100)
      .lean(),
    ApplicationAnswer.find({ applicationId: { $in: appIds } })
      .populate("questionId", "label type options")
      .lean(),
  ]);

  const answersByApp = {};
  for (const ans of allAnswers) {
    const key = String(ans.applicationId);
    if (!answersByApp[key]) answersByApp[key] = [];
    answersByApp[key].push(ans);
  }

  const applicationsWithAnswers = applications.map((app) => ({
    ...app,
    answers: answersByApp[String(app._id)] || [],
  }));

  const duplicates = await Candidate.find({
    isDeleted: false,
    _id: { $ne: candidate._id },
    $or: [
      { email: candidate.email },
      ...(candidate.phone ? [{ phone: candidate.phone }] : []),
    ],
  })
    .select("fullName email phone")
    .lean();

  const joiningRows = await JoiningDetails.find({
    candidateId: candidate._id,
    isDeleted: false,
  })
    .sort({ updatedAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...sanitizeCandidateForClient(candidate),
        hasResume: Boolean(
          candidate.resumePath || candidate.resumeUrl || candidate.resumePublicId
        ),
        applications: applicationsWithAnswers,
        notes,
        history,
        duplicates,
        joiningDetails: joiningRows.map((d) => hrJoiningShape(d)),
      },
      "Candidate"
    )
  );
});

export const updateCandidate = asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!candidate) throw new ApiError(404, "Candidate not found");
  const fields = [
    "fullName",
    "phone",
    "currentLocation",
    "noticePeriod",
    "coverLetter",
    "linkedIn",
    "portfolio",
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) candidate[f] = req.body[f];
  }
  if (req.body.experienceYears !== undefined) {
    candidate.experienceYears = toNumber(req.body.experienceYears) ?? 0;
  }
  if (req.body.currentSalary !== undefined) {
    candidate.currentSalary = toNumber(req.body.currentSalary) ?? null;
  }
  if (req.body.expectedSalary !== undefined) {
    candidate.expectedSalary = toNumber(req.body.expectedSalary) ?? null;
  }
  if (req.body.skills !== undefined) candidate.skills = parseSkills(req.body.skills);
  if (req.body.tags !== undefined) candidate.tags = parseSkills(req.body.tags);
  if (req.body.rating !== undefined) {
    const r = toNumber(req.body.rating);
    if (r != null) candidate.rating = Math.min(5, Math.max(0, r));
  }
  await candidate.save();
  await logActivity({
    entityType: "candidate",
    entityId: candidate._id,
    action: "updated",
    actorId: req.user._id,
  });
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sanitizeCandidateForClient(candidate.toObject()),
        "Updated"
      )
    );
});

export const addCandidateNote = asyncHandler(async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) throw new ApiError(400, "Note body required");
  const candidateId = req.body.candidateId || req.params.id;
  const note = await RecruitmentNote.create({
    candidateId,
    applicationId: req.body.applicationId || null,
    body,
    authorId: req.user._id,
  });
  const populated = await RecruitmentNote.findById(note._id).populate(
    "authorId",
    "fullName"
  );
  return res.status(201).json(new ApiResponse(201, populated, "Note added"));
});

/** Stream resume via authenticated route (disk first, Cloudinary fallback). */
export const downloadCandidateResume = asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).lean();
  if (!candidate) throw new ApiError(404, "Candidate not found");
  if (
    !candidate.resumePath &&
    !candidate.resumeUrl &&
    !candidate.resumePublicId
  ) {
    throw new ApiError(404, "No resume on file");
  }

  const filename = candidate.resumeFileName || "resume.pdf";
  const disposition =
    req.query.disposition === "attachment" ? "attachment" : "inline";
  const safeName = String(filename).replace(/[^\w.\- ()[\]]+/g, "_");

  let buffer;
  let contentType;

  if (candidate.resumePath) {
    try {
      const disk = readResumeFromDisk(candidate.resumePath);
      buffer = disk.buffer;
      contentType = contentTypeForExt(disk.ext);
    } catch (err) {
      if (err?.code === "RESUME_PATH_TRAVERSAL" || err?.code === "RESUME_PATH_INVALID") {
        throw new ApiError(400, "Invalid resume path");
      }
      throw new ApiError(404, err?.message || "Resume file not found");
    }
  } else {
    let upstream;
    try {
      upstream = await fetchAttachmentFromCloudinary({
        url: candidate.resumeUrl || undefined,
        publicId: candidate.resumePublicId || undefined,
        filename,
      });
    } catch (err) {
      throw new ApiError(
        502,
        err?.message || "Failed to fetch resume from storage"
      );
    }
    buffer = Buffer.from(await upstream.arrayBuffer());
    const head = buffer
      .subarray(0, 32)
      .toString("utf8")
      .trimStart()
      .toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) {
      throw new ApiError(502, "Resume storage returned an invalid file");
    }
    const isPdf = /\.pdf$/i.test(filename);
    if (isPdf && !buffer.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
      throw new ApiError(
        502,
        "Resume PDF is blocked or corrupt in storage. Ask candidate to re-apply with resume."
      );
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    contentType =
      contentTypeForExt(ext) ||
      upstream.headers.get("content-type") ||
      "application/octet-stream";
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${safeName}"`
  );
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(buffer);
});

/**
 * HR-only manual CV parse (Phase 2 test hook). Not called from public apply.
 * POST /candidates/:id/parse-cv
 * Query: force=true to bypass cvHash cache
 * Body: { applicationId? } — optional, updates that application's matchStatus
 */
export const parseCandidateCvEndpoint = asyncHandler(async (req, res) => {
  const force =
    req.query.force === "true" ||
    req.query.force === "1" ||
    req.body?.force === true;
  const applicationId = req.body?.applicationId || req.query.applicationId || null;

  try {
    const result = await parseCandidateCv(req.params.id, {
      force,
      applicationId,
    });
    await logActivity({
      entityType: "candidate",
      entityId: req.params.id,
      action: "cv_parse_manual",
      actorId: req.user?._id || null,
      meta: {
        status: result.status,
        reason: result.reason,
        cached: result.cached,
        applicationId: applicationId || null,
      },
    });
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            ok: result.ok,
            cached: result.cached,
            status: result.status,
            reason: result.reason,
            flags: result.flags,
            textLength: result.textLength,
            cvHash: result.cvHash,
            parserVersion: result.parserVersion,
            parserModel: result.parserModel,
            parsedProfile: result.parsedProfile,
          },
          result.cached
            ? "Parsed profile served from cache"
            : result.ok
              ? "CV parsed"
              : "CV not analyzed"
        )
      );
  } catch (err) {
    if (err?.code === "CANDIDATE_NOT_FOUND") {
      throw new ApiError(404, "Candidate not found");
    }
    throw new ApiError(500, err?.message || "CV parse failed");
  }
});
