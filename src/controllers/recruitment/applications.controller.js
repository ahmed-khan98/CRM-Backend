import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Application,
  ApplicationAnswer,
  ApplicationStageHistory,
  Candidate,
  Job,
  RecruitmentNote,
  RecruitmentRematchBatch,
} from "../../models/recruitment/index.js";
import {
  parsePagination,
  paginatedResponse,
} from "../../utils/hrmsHelpers.js";
import {
  getOrCreateSettings,
  recordStageChange,
  logActivity,
  sendTemplatedEmail,
} from "../../utils/recruitmentHelpers.js";
import { enqueueMatchJob } from "../../services/ai/matching/queue.js";

/** Cross-job application picker for interviews / offers */
export const listApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false };
  if (req.query.stage) filter.stage = req.query.stage;
  if (req.query.jobId) filter.jobId = req.query.jobId;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    const cands = await Candidate.find({
      isDeleted: false,
      $or: [
        { fullName: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
      ],
    })
      .select("_id")
      .lean();
    filter.candidateId = { $in: cands.map((c) => c._id) };
  }

  const [items, total] = await Promise.all([
    Application.find(filter)
      .populate("candidateId", "fullName email")
      .populate("jobId", "title status")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(items, total, page, limit),
        "Applications"
      )
    );
});

export const listApplicationsForJob = asyncHandler(async (req, res) => {
  const jobId = req.params.jobId;
  const job = await Job.findOne({ _id: jobId, isDeleted: false });
  if (!job) throw new ApiError(404, "Job not found");

  const { page, limit, skip } = parsePagination(req.query);
  const filter = { jobId, isDeleted: false };
  if (req.query.stage) filter.stage = req.query.stage;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.matchStatus) {
    filter.matchStatus = String(req.query.matchStatus).trim();
  }
  const minScore = Number(req.query.minScore);
  if (Number.isFinite(minScore) && minScore > 0) {
    filter.matchPercent = { $ne: null, $gte: minScore };
    filter.matchStatus = filter.matchStatus || "done";
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }
  if (req.query.minRating) {
    /* filter via candidate after populate — use aggregation if needed */
  }

  let candidateFilter = null;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    const cands = await Candidate.find({
      isDeleted: false,
      $or: [
        { fullName: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { skills: new RegExp(q, "i") },
      ],
    })
      .select("_id")
      .lean();
    candidateFilter = cands.map((c) => c._id);
    filter.candidateId = { $in: candidateFilter };
  }
  if (req.query.minExp || req.query.maxExp) {
    const expQ = { isDeleted: false };
    if (req.query.minExp) expQ.experienceYears = { $gte: Number(req.query.minExp) };
    if (req.query.maxExp) {
      expQ.experienceYears = {
        ...(expQ.experienceYears || {}),
        $lte: Number(req.query.maxExp),
      };
    }
    const cands = await Candidate.find(expQ).select("_id").lean();
    const ids = cands.map((c) => c._id);
    filter.candidateId = filter.candidateId
      ? { $in: ids.filter((id) => filter.candidateId.$in.some((x) => String(x) === String(id))) }
      : { $in: ids };
  }
  if (req.query.rating) {
    const cands = await Candidate.find({
      isDeleted: false,
      rating: Number(req.query.rating),
    })
      .select("_id")
      .lean();
    filter.candidateId = { $in: cands.map((c) => c._id) };
  }

  const [items, total, stageAgg] = await Promise.all([
    Application.find(filter)
      .populate(
        "candidateId",
        "fullName email phone experienceYears skills tags rating resumeFileName"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
    Application.aggregate([
      { $match: { jobId: job._id, isDeleted: false } },
      { $group: { _id: "$stage", count: { $sum: 1 } } },
    ]),
  ]);

  const stats = {};
  for (const row of stageAgg) stats[row._id] = row.count;
  stats.total = await Application.countDocuments({ jobId, isDeleted: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        job: {
          _id: job._id,
          title: job.title,
          status: job.status,
          version: job.version || 1,
        },
        stats,
        ...paginatedResponse(items, total, page, limit),
      },
      "Applicants"
    )
  );
});

export const getApplication = asyncHandler(async (req, res) => {
  const app = await Application.findOne({
    _id: req.params.id,
    isDeleted: false,
  })
    .populate("jobId")
    .populate("candidateId")
    .lean();
  if (!app) throw new ApiError(404, "Application not found");
  if (!app.seenByHrAt) {
    await Application.updateOne(
      { _id: app._id },
      { $set: { seenByHrAt: new Date() } }
    );
  }
  const [answers, history, notes] = await Promise.all([
    ApplicationAnswer.find({ applicationId: app._id })
      .populate("questionId", "label type options")
      .lean(),
    ApplicationStageHistory.find({ applicationId: app._id })
      .populate("by", "fullName email")
      .sort({ at: -1 })
      .lean(),
    RecruitmentNote.find({
      $or: [{ applicationId: app._id }, { candidateId: app.candidateId?._id }],
      isDeleted: false,
    })
      .populate("authorId", "fullName")
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  return res.status(200).json(
    new ApiResponse(200, { ...app, answers, history, notes }, "Application")
  );
});

async function moveOne(app, toStage, userId, note = "", rejectionReasonId = null) {
  const from = app.stage;
  if (from === toStage) return app;
  app.stage = toStage;
  if (toStage === "rejected") {
    app.rejectionReasonId = rejectionReasonId || null;
    app.rejectionNote = note || "";
  }
  if (toStage === "hired") app.hiredAt = new Date();
  await app.save();
  await recordStageChange({
    applicationId: app._id,
    fromStage: from,
    toStage,
    by: userId,
    note,
  });
  await logActivity({
    entityType: "application",
    entityId: app._id,
    action: `stage_${toStage}`,
    actorId: userId,
    meta: { from, to: toStage },
  });

  const candidate = await Candidate.findById(app.candidateId);
  const job = await Job.findById(app.jobId);
  const settings = await getOrCreateSettings();
  const vars = {
    candidate_name: candidate?.fullName || "",
    job_title: job?.title || "",
    company_name: settings.companyName,
  };
  if (toStage === "shortlisted") {
    await sendTemplatedEmail("shortlisted", candidate?.email, vars, {
      type: "application",
      id: app._id,
    });
  } else if (toStage === "rejected") {
    await sendTemplatedEmail("rejection", candidate?.email, vars, {
      type: "application",
      id: app._id,
    });
  }
  return app;
}

export const moveApplicationStage = asyncHandler(async (req, res) => {
  const { stage, note, rejectionReasonId, notify } = req.body;
  if (!stage) throw new ApiError(400, "stage is required");
  const settings = await getOrCreateSettings();
  const valid = (settings.pipelineStages || []).map((s) => s.key);
  if (valid.length && !valid.includes(stage)) {
    throw new ApiError(400, "Invalid stage");
  }
  const app = await Application.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!app) throw new ApiError(404, "Application not found");
  if (stage === "rejected" && !rejectionReasonId && !note) {
    throw new ApiError(400, "Rejection reason is required");
  }
  await moveOne(app, stage, req.user._id, note || "", rejectionReasonId);
  // notify unused flag — emails already sent for shortlist/reject
  void notify;
  const refreshed = await Application.findById(app._id)
    .populate("candidateId", "fullName email")
    .lean();
  return res.status(200).json(new ApiResponse(200, refreshed, "Stage updated"));
});

export const bulkMoveApplications = asyncHandler(async (req, res) => {
  const { ids = [], stage, note, rejectionReasonId } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    throw new ApiError(400, "ids required");
  }
  if (!stage) throw new ApiError(400, "stage required");
  const apps = await Application.find({
    _id: { $in: ids },
    isDeleted: false,
  });
  for (const app of apps) {
    await moveOne(app, stage, req.user._id, note || "", rejectionReasonId);
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { updated: apps.length }, "Bulk updated"));
});

export const recomputeMatch = asyncHandler(async (req, res) => {
  const app = await Application.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!app) throw new ApiError(404, "Application not found");
  app.matchStatus = "pending";
  app.matchPercent = null;
  app.matchStatusReason = "";
  app.scoreBreakdown = null;
  await app.save();
  const row = await enqueueMatchJob(app._id, { force: true });
  await logActivity({
    entityType: "application",
    entityId: app._id,
    action: "recompute_match",
    actorId: req.user._id,
    meta: { queueId: row?._id },
  });
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          applicationId: app._id,
          matchStatus: "pending",
          queueId: row?._id,
        },
        "Match recompute queued"
      )
    );
});

const REMATCH_ENQUEUE_CHUNK = 25;
const REMATCH_ENQUEUE_DELAY_MS = 40;

async function refreshRematchBatchCounts(batch) {
  if (!batch?.applicationIds?.length) {
    batch.done = 0;
    batch.failed = 0;
    batch.pending = 0;
    batch.processing = 0;
    batch.notAnalyzed = 0;
    batch.status = "done";
    batch.finishedAt = new Date();
    await batch.save();
    return batch;
  }
  const rows = await Application.find({
    _id: { $in: batch.applicationIds },
    isDeleted: false,
  })
    .select("matchStatus")
    .lean();

  let done = 0;
  let failed = 0;
  let pending = 0;
  let processing = 0;
  let notAnalyzed = 0;
  for (const r of rows) {
    if (r.matchStatus === "done") done += 1;
    else if (r.matchStatus === "failed") failed += 1;
    else if (r.matchStatus === "pending") pending += 1;
    else if (r.matchStatus === "processing") processing += 1;
    else if (r.matchStatus === "not_analyzed") notAnalyzed += 1;
  }
  batch.done = done;
  batch.failed = failed;
  batch.pending = pending;
  batch.processing = processing;
  batch.notAnalyzed = notAnalyzed;
  batch.total = rows.length;
  const remaining = pending + processing;
  if (remaining === 0) {
    batch.status = "done";
    batch.finishedAt = batch.finishedAt || new Date();
  } else {
    batch.status = "running";
  }
  await batch.save();
  return batch;
}

/** Enqueue rematch for every application on a job (throttled). */
export const recomputeMatchAllForJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.jobId, isDeleted: false });
  if (!job) throw new ApiError(404, "Job not found");

  const apps = await Application.find({
    jobId: job._id,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  const ids = apps.map((a) => a._id);
  const batch = await RecruitmentRematchBatch.create({
    jobId: job._id,
    status: ids.length ? "queued" : "done",
    total: ids.length,
    pending: ids.length,
    applicationIds: ids,
    createdBy: req.user._id,
    startedAt: new Date(),
    finishedAt: ids.length ? null : new Date(),
  });

  // Mark all pending first so the UI shows Processing immediately
  if (ids.length) {
    await Application.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          matchStatus: "pending",
          matchPercent: null,
          matchStatusReason: "",
          scoreBreakdown: null,
        },
      }
    );
  }

  // Throttle enqueue so we don't flood the queue in one tick
  setImmediate(async () => {
    try {
      batch.status = "running";
      await batch.save();
      for (let i = 0; i < ids.length; i += 1) {
        try {
          await enqueueMatchJob(ids[i], { force: true });
        } catch (err) {
          console.error(
            "rematch enqueue failed",
            String(ids[i]),
            err?.message || err
          );
        }
        if ((i + 1) % REMATCH_ENQUEUE_CHUNK === 0) {
          await new Promise((r) => setTimeout(r, REMATCH_ENQUEUE_DELAY_MS));
        }
      }
      await refreshRematchBatchCounts(batch);
    } catch (err) {
      console.error("rematch-all batch error", err?.message || err);
    }
  });

  await logActivity({
    entityType: "job",
    entityId: job._id,
    action: "recompute_match_all",
    actorId: req.user._id,
    meta: { batchId: batch._id, total: ids.length },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        batchId: batch._id,
        jobId: job._id,
        total: ids.length,
        status: batch.status,
      },
      ids.length ? "Re-match queued for all applicants" : "No applications to rematch"
    )
  );
});

export const getRematchBatchProgress = asyncHandler(async (req, res) => {
  const batch = await RecruitmentRematchBatch.findById(req.params.batchId);
  if (!batch) throw new ApiError(404, "Batch not found");
  if (String(batch.jobId) !== String(req.params.jobId)) {
    throw new ApiError(404, "Batch not found for this job");
  }
  await refreshRematchBatchCounts(batch);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        batchId: batch._id,
        jobId: batch.jobId,
        status: batch.status,
        total: batch.total,
        done: batch.done,
        failed: batch.failed,
        pending: batch.pending,
        processing: batch.processing,
        notAnalyzed: batch.notAnalyzed,
        finishedAt: batch.finishedAt,
      },
      "Rematch progress"
    )
  );
});
