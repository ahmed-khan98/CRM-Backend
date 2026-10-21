import fs from "fs";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Job,
  JobQuestion,
  Candidate,
  Application,
  ApplicationAnswer,
} from "../../models/recruitment/index.js";
import {
  parsePagination,
  paginatedResponse,
  parseMaybeJson,
  toNumber,
} from "../../utils/hrmsHelpers.js";
import {
  publicJobShape,
  sendTemplatedEmail,
  getOrCreateSettings,
  recordStageChange,
  logActivity,
  parseSkills,
  ensureRecruitmentDefaults,
} from "../../utils/recruitmentHelpers.js";
import {
  saveResumeToDisk,
  deleteResumeFromDisk,
  MSG_RESUME_TYPE,
  MSG_RESUME_SIZE,
  MSG_RESUME_EMPTY,
  RESUME_MAX_BYTES,
} from "../../utils/recruitmentCvStore.js";
import { enqueueMatchJob } from "../../services/ai/matching/queue.js";

function isAccepting(job) {
  if (!job || job.isDeleted) return false;
  if (job.status !== "published") return false;
  if (job.deadline && new Date(job.deadline) < new Date()) return false;
  return true;
}

function normalizeOptionalUrl(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export const publicListJobs = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false, status: "published" };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.location) {
    filter.location = new RegExp(String(req.query.location).trim(), "i");
  }
  if (req.query.jobType) filter.jobType = req.query.jobType;
  if (req.query.workMode) filter.workMode = req.query.workMode;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { title: new RegExp(q, "i") },
      { location: new RegExp(q, "i") },
      { skills: new RegExp(q, "i") },
    ];
  }

  const [items, total, settings] = await Promise.all([
    Job.find(filter)
      .populate("departmentId", "name")
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter),
    getOrCreateSettings(),
  ]);

  const shaped = items.map((j) => publicJobShape(j));
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...paginatedResponse(shaped, total, page, limit),
        branding: {
          companyName: settings.companyName,
          logoUrl: settings.careersLogoUrl,
          bannerUrl: settings.careersBannerUrl,
          headline: settings.careersHeadline,
          subheadline: settings.careersSubheadline,
        },
      },
      "Careers jobs"
    )
  );
});

export const publicGetJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({
    slug: req.params.slug,
    isDeleted: false,
  })
    .populate("departmentId", "name")
    .lean();
  if (!job || (job.status !== "published" && job.status !== "closed" && job.status !== "paused")) {
    throw new ApiError(404, "Job not found");
  }
  if (job.status === "draft") throw new ApiError(404, "Job not found");
  const questions = await JobQuestion.find({
    jobId: job._id,
    isDeleted: false,
  })
    .sort({ sortOrder: 1 })
    .lean();
  const settings = await getOrCreateSettings();
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        job: publicJobShape(job, questions),
        accepting: isAccepting(job),
        branding: {
          companyName: settings.companyName,
          logoUrl: settings.careersLogoUrl,
        },
      },
      "Job"
    )
  );
});

export const publicApply = asyncHandler(async (req, res) => {
  // honeypot
  if (req.body.website || req.body.company_url) {
    return res.status(200).json(new ApiResponse(200, { ok: true }, "Submitted"));
  }

  const job = await Job.findOne({
    slug: req.params.slug,
    isDeleted: false,
  });
  if (!job) throw new ApiError(404, "Job not found");
  if (!isAccepting(job)) {
    throw new ApiError(400, "This job is no longer accepting applications");
  }

  const fullName = String(req.body.fullName || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const phone = String(req.body.phone || "").trim();
  if (!fullName || !email || !phone) {
    throw new ApiError(400, "Name, email and phone are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Invalid email");
  }
  if (!req.body.consent || req.body.consent === "false") {
    throw new ApiError(400, "Consent is required");
  }

  let candidate = await Candidate.findOne({ email, isDeleted: false });
  const existingApp = candidate
    ? await Application.findOne({
        jobId: job._id,
        candidateId: candidate._id,
        isDeleted: false,
      })
    : null;
  if (existingApp) {
    throw new ApiError(409, "You have already applied for this job");
  }

  let savedResumePath = "";
  try {
    let resumePath = "";
    let resumeFileName = "";
    if (req.file) {
      if (!req.file.size) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
        throw new ApiError(400, MSG_RESUME_EMPTY);
      }
      if (req.file.size > RESUME_MAX_BYTES) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
        throw new ApiError(400, MSG_RESUME_SIZE);
      }
      try {
        const saved = saveResumeToDisk(req.file);
        resumePath = saved.resumePath;
        resumeFileName = saved.resumeFileName;
        savedResumePath = saved.resumePath;
      } catch (err) {
        try {
          if (req.file?.path) fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
        if (
          err?.code === "RESUME_MAGIC_MISMATCH" ||
          err?.code === "RESUME_TYPE" ||
          err?.code === "RESUME_EMPTY" ||
          err?.code === "RESUME_TOO_LARGE"
        ) {
          throw new ApiError(400, err.message || MSG_RESUME_TYPE);
        }
        throw new ApiError(500, err?.message || "Resume upload failed");
      }
    } else if (!candidate?.resumePath && !candidate?.resumeUrl) {
      throw new ApiError(400, "Resume is required");
    }

    const skills = parseSkills(req.body.skills);
    const candPayload = {
      fullName,
      email,
      phone,
      currentLocation: String(req.body.currentLocation || "").trim(),
      experienceYears: toNumber(req.body.experienceYears) ?? 0,
      currentSalary: toNumber(req.body.currentSalary) ?? null,
      expectedSalary: toNumber(req.body.expectedSalary) ?? null,
      noticePeriod: String(req.body.noticePeriod || "").trim(),
      coverLetter: String(req.body.coverLetter || ""),
      linkedIn: normalizeOptionalUrl(req.body.linkedIn),
      portfolio: normalizeOptionalUrl(req.body.portfolio),
      skills,
    };
    if (resumePath) {
      candPayload.resumePath = resumePath;
      candPayload.resumeFileName = resumeFileName;
      // New uploads are local-only — clear legacy Cloudinary pointers
      candPayload.resumeUrl = "";
      candPayload.resumePublicId = "";
    }

    if (candidate) {
      Object.assign(candidate, candPayload);
      await candidate.save();
    } else {
      candidate = await Candidate.create(candPayload);
    }

    const application = await Application.create({
      jobId: job._id,
      candidateId: candidate._id,
      stage: "applied",
      source: String(req.body.source || "careers").trim() || "careers",
      matchPercent: null,
      matchStatus: "pending",
      jobVersion: Number(job.version) || 1,
      coverLetter: candPayload.coverLetter,
    });

    await recordStageChange({
      applicationId: application._id,
      fromStage: null,
      toStage: "applied",
      note: "Applied via careers page",
    });

    const answers = parseMaybeJson(req.body.answers, []);
    if (Array.isArray(answers)) {
      for (const a of answers) {
        if (!a?.questionId) continue;
        await ApplicationAnswer.create({
          applicationId: application._id,
          questionId: a.questionId,
          value: a.value ?? "",
        });
      }
    }

    job.applicantCount = (job.applicantCount || 0) + 1;
    await job.save();

    const settings = await getOrCreateSettings();
    await sendTemplatedEmail(
      "application_received",
      email,
      {
        candidate_name: fullName,
        job_title: job.title,
        company_name: settings.companyName,
      },
      { type: "application", id: application._id }
    );

    await logActivity({
      entityType: "application",
      entityId: application._id,
      action: "applied_public",
      meta: { jobId: job._id, email },
    });

    try {
      await enqueueMatchJob(application._id);
    } catch (enqueueErr) {
      console.error(
        "match enqueue failed",
        enqueueErr?.message || enqueueErr
      );
    }

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          applicationId: application._id,
          matchStatus: "pending",
        },
        "Application submitted"
      )
    );
  } catch (err) {
    if (savedResumePath) {
      deleteResumeFromDisk(savedResumePath);
    }
    throw err;
  }
});

export const publicApplicationStatus = asyncHandler(async (req, res) => {
  const email = String(req.query.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new ApiError(400, "email is required");
  }
  const candidate = await Candidate.findOne({ email, isDeleted: false }).lean();
  if (!candidate) throw new ApiError(404, "No applications found for this email");

  const apps = await Application.find({
    candidateId: candidate._id,
    isDeleted: false,
  })
    .populate("jobId", "title slug status")
    .sort({ createdAt: -1 })
    .lean();

  if (!apps.length) {
    throw new ApiError(404, "No applications found for this email");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        email: candidate.email,
        candidateName: candidate.fullName || "",
        items: apps.map((app) => ({
          applicationId: app._id,
          stage: app.stage,
          jobTitle: app.jobId?.title || "—",
          jobSlug: app.jobId?.slug || "",
          jobStatus: app.jobId?.status || "",
          appliedAt: app.createdAt,
        })),
      },
      "Status"
    )
  );
});
