import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Job,
  Application,
  Interview,
  Offer,
  Candidate,
  RecruitmentOutbox,
} from "../../models/recruitment/index.js";
import { ensureRecruitmentDefaults } from "../../utils/recruitmentHelpers.js";

export const getDashboard = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    activeJobs,
    totalCandidates,
    interviewsScheduled,
    offersSent,
    hiredThisMonth,
    newApplications,
    pipeline,
    topCandidates,
    upcomingInterviews,
    appsOverTime,
    sources,
  ] = await Promise.all([
    Job.countDocuments({ isDeleted: false, status: "published" }),
    Application.countDocuments({
      isDeleted: false,
      stage: { $nin: ["hired", "rejected"] },
    }),
    Interview.countDocuments({
      isDeleted: false,
      status: "scheduled",
      startsAt: { $gte: now },
    }),
    Offer.countDocuments({ isDeleted: false, status: "sent" }),
    Application.countDocuments({
      isDeleted: false,
      stage: "hired",
      hiredAt: { $gte: monthStart },
    }),
    Application.countDocuments({
      isDeleted: false,
      createdAt: { $gte: dayAgo },
      $or: [{ seenByHrAt: null }, { seenByHrAt: { $exists: false } }],
    }),
    Application.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$stage", count: { $sum: 1 } } },
    ]),
    Application.find({
      isDeleted: false,
      stage: { $nin: ["rejected"] },
      matchStatus: "done",
      matchPercent: { $ne: null, $gte: 0 },
    })
      .sort({ matchPercent: -1 })
      .limit(8)
      .populate("candidateId", "fullName email skills rating")
      .populate("jobId", "title")
      .lean(),
    Interview.find({
      isDeleted: false,
      status: "scheduled",
      startsAt: { $gte: now },
    })
      .sort({ startsAt: 1 })
      .limit(8)
      .populate({
        path: "applicationId",
        populate: [
          { path: "candidateId", select: "fullName" },
          { path: "jobId", select: "title" },
        ],
      })
      .populate("interviewerIds", "fullName")
      .lean(),
    Application.aggregate([
      {
        $match: {
          isDeleted: false,
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Application.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const pipelineMap = {};
  for (const row of pipeline) pipelineMap[row._id] = row.count;

  // simple time-to-hire avg (days) for hired this month
  const hiredApps = await Application.find({
    isDeleted: false,
    stage: "hired",
    hiredAt: { $gte: monthStart },
  })
    .select("createdAt hiredAt")
    .lean();
  let avgTimeToHire = null;
  if (hiredApps.length) {
    const days = hiredApps.map(
      (a) =>
        (new Date(a.hiredAt) - new Date(a.createdAt)) / (1000 * 60 * 60 * 24)
    );
    avgTimeToHire = Math.round(
      days.reduce((s, d) => s + d, 0) / days.length
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        counts: {
          activeJobs,
          totalCandidates,
          interviewsScheduled,
          offersSent,
          hiredThisMonth,
          newApplications,
          avgTimeToHire,
        },
        pipeline: pipelineMap,
        topCandidates,
        upcomingInterviews,
        analytics: {
          applicationsOverTime: appsOverTime,
          sources,
        },
      },
      "Dashboard"
    )
  );
});

export const getReports = asyncHandler(async (req, res) => {
  const jobId = req.query.jobId;
  const match = { isDeleted: false };
  if (jobId) match.jobId = jobId;

  const [funnel, byDept, bySource, timeToHire] = await Promise.all([
    Application.aggregate([
      { $match: match },
      { $group: { _id: "$stage", count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "job",
        },
      },
      { $unwind: { path: "$job", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$job.departmentId",
          applied: { $sum: 1 },
          hired: {
            $sum: { $cond: [{ $eq: ["$stage", "hired"] }, 1, 0] },
          },
        },
      },
    ]),
    Application.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$source",
          applied: { $sum: 1 },
          hired: {
            $sum: { $cond: [{ $eq: ["$stage", "hired"] }, 1, 0] },
          },
        },
      },
    ]),
    Application.find({
      ...match,
      stage: "hired",
      hiredAt: { $ne: null },
    })
      .select("createdAt hiredAt jobId")
      .lean(),
  ]);

  const tth = timeToHire.map((a) => ({
    jobId: a.jobId,
    days: Math.round(
      (new Date(a.hiredAt) - new Date(a.createdAt)) / (1000 * 60 * 60 * 24)
    ),
  }));

  const applied = funnel.reduce((s, r) => s + r.count, 0);
  const hired = funnel.find((r) => r._id === "hired")?.count || 0;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        funnel,
        conversionPercent: applied ? Math.round((hired / applied) * 100) : 0,
        byDepartment: byDept,
        bySource,
        timeToHire: tth,
      },
      "Reports"
    )
  );
});

export const exportApplicationsCsv = asyncHandler(async (req, res) => {
  const filter = { isDeleted: false };
  if (req.query.jobId) filter.jobId = req.query.jobId;
  if (req.query.stage) filter.stage = req.query.stage;
  const apps = await Application.find(filter)
    .populate("candidateId", "fullName email phone experienceYears")
    .populate("jobId", "title")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const header = [
    "ApplicationId",
    "Candidate",
    "Email",
    "Phone",
    "Job",
    "Stage",
    "Match%",
    "Source",
    "AppliedAt",
  ];
  const rows = apps.map((a) =>
    [
      a._id,
      a.candidateId?.fullName || "",
      a.candidateId?.email || "",
      a.candidateId?.phone || "",
      a.jobId?.title || "",
      a.stage,
      a.matchPercent,
      a.source,
      a.createdAt?.toISOString?.() || "",
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="applications.csv"'
  );
  return res.status(200).send(csv);
});

export const listCommunication = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.to) filter.to = String(req.query.to).toLowerCase();
  if (req.query.relatedId) filter.relatedId = req.query.relatedId;
  const items = await RecruitmentOutbox.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return res.status(200).json(new ApiResponse(200, items, "Communications"));
});
