import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Interview,
  InterviewFeedback,
  Application,
  Candidate,
  Job,
} from "../../models/recruitment/index.js";
import {
  parsePagination,
  paginatedResponse,
  toNumber,
} from "../../utils/hrmsHelpers.js";
import {
  isHrUser,
  sendTemplatedEmail,
  getOrCreateSettings,
  logActivity,
  recordStageChange,
} from "../../utils/recruitmentHelpers.js";

async function loadInterviewContext(applicationId) {
  const app = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  });
  if (!app) throw new ApiError(404, "Application not found");
  const [candidate, job] = await Promise.all([
    Candidate.findById(app.candidateId),
    Job.findById(app.jobId),
  ]);
  return { app, candidate, job };
}

export const listInterviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false };
  const hr = (await isHrUser(req.user));
  if (!hr) {
    filter.interviewerIds = req.user._id;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.startsAt = {};
    if (req.query.from) filter.startsAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.startsAt.$lte = new Date(req.query.to);
  }
  if (req.query.upcoming === "true") {
    filter.startsAt = { ...(filter.startsAt || {}), $gte: new Date() };
    filter.status = filter.status || "scheduled";
  }

  const [items, total] = await Promise.all([
    Interview.find(filter)
      .populate({
        path: "applicationId",
        populate: [
          { path: "candidateId", select: "fullName email phone" },
          { path: "jobId", select: "title" },
        ],
      })
      .populate("interviewerIds", "fullName email")
      .sort({ startsAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Interview.countDocuments(filter),
  ]);

  const interviewIds = items.map((i) => i._id);
  const feedbackRows = interviewIds.length
    ? await InterviewFeedback.find({ interviewId: { $in: interviewIds } })
        .populate("by", "fullName")
        .lean()
    : [];
  const feedbackByInterview = {};
  for (const fb of feedbackRows) {
    const key = String(fb.interviewId);
    if (!feedbackByInterview[key]) feedbackByInterview[key] = [];
    feedbackByInterview[key].push(fb);
  }
  const withFeedback = items.map((i) => ({
    ...i,
    feedback: feedbackByInterview[String(i._id)] || [],
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(withFeedback, total, page, limit),
        "Interviews"
      )
    );
});

export const createInterview = asyncHandler(async (req, res) => {
  if (!(await isHrUser(req.user))) throw new ApiError(403, "Forbidden");
  const {
    applicationId,
    round,
    type,
    startsAt,
    durationMin,
    interviewerIds,
    meetingLink,
    location,
    notes,
  } = req.body;
  if (!applicationId || !startsAt) {
    throw new ApiError(400, "applicationId and startsAt required");
  }
  const { app, candidate, job } = await loadInterviewContext(applicationId);
  const interview = await Interview.create({
    applicationId,
    round: round || "Round 1",
    type: type || "video",
    startsAt: new Date(startsAt),
    durationMin: toNumber(durationMin) ?? 60,
    interviewerIds: interviewerIds || [],
    meetingLink: meetingLink || "",
    location: location || "",
    notes: notes || "",
    createdBy: req.user._id,
  });

  if (app.stage !== "interview" && app.stage !== "offer" && app.stage !== "hired") {
    const from = app.stage;
    app.stage = "interview";
    await app.save();
    await recordStageChange({
      applicationId: app._id,
      fromStage: from,
      toStage: "interview",
      by: req.user._id,
      note: "Interview scheduled",
    });
  }

  const settings = await getOrCreateSettings();
  const when = new Date(startsAt).toLocaleString();
  const details =
    type === "onsite"
      ? location || ""
      : meetingLink || "";
  await sendTemplatedEmail(
    "interview_invite",
    candidate?.email,
    {
      candidate_name: candidate?.fullName,
      job_title: job?.title,
      company_name: settings.companyName,
      interview_datetime: when,
      interview_type: type || "video",
      interview_details: details,
    },
    { type: "interview", id: interview._id }
  );

  await logActivity({
    entityType: "interview",
    entityId: interview._id,
    action: "scheduled",
    actorId: req.user._id,
  });

  const populated = await Interview.findById(interview._id)
    .populate("interviewerIds", "fullName email")
    .populate({
      path: "applicationId",
      populate: [
        { path: "candidateId", select: "fullName email" },
        { path: "jobId", select: "title" },
      ],
    });

  return res.status(201).json(new ApiResponse(201, populated, "Scheduled"));
});

export const updateInterview = asyncHandler(async (req, res) => {
  if (!(await isHrUser(req.user))) throw new ApiError(403, "Forbidden");
  const interview = await Interview.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!interview) throw new ApiError(404, "Interview not found");
  const fields = [
    "round",
    "type",
    "meetingLink",
    "location",
    "notes",
    "status",
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) interview[f] = req.body[f];
  }
  if (req.body.startsAt) interview.startsAt = new Date(req.body.startsAt);
  if (req.body.durationMin !== undefined) {
    interview.durationMin = toNumber(req.body.durationMin) ?? 60;
  }
  if (req.body.interviewerIds) interview.interviewerIds = req.body.interviewerIds;
  if (req.body.status === "rescheduled" || req.body.startsAt) {
    interview.status =
      req.body.status === "cancelled" ? "cancelled" : "rescheduled";
    if (req.body.status === "scheduled") interview.status = "scheduled";
  }
  await interview.save();
  await logActivity({
    entityType: "interview",
    entityId: interview._id,
    action: "updated",
    actorId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, interview, "Updated"));
});

export const cancelInterview = asyncHandler(async (req, res) => {
  if (!(await isHrUser(req.user))) throw new ApiError(403, "Forbidden");
  const interview = await Interview.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!interview) throw new ApiError(404, "Interview not found");
  interview.status = "cancelled";
  await interview.save();
  return res.status(200).json(new ApiResponse(200, interview, "Cancelled"));
});

export const submitFeedback = asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!interview) throw new ApiError(404, "Interview not found");
  const hr = (await isHrUser(req.user));
  const assigned = (interview.interviewerIds || []).some(
    (id) => String(id) === String(req.user._id)
  );
  if (!hr && !assigned) throw new ApiError(403, "Forbidden");

  const { rating, comments, recommendation, scorecard } = req.body;
  const feedback = await InterviewFeedback.findOneAndUpdate(
    { interviewId: interview._id, by: req.user._id },
    {
      $set: {
        rating: toNumber(rating) ?? 0,
        comments: comments || "",
        recommendation: recommendation || "hold",
        scorecard: scorecard || {},
      },
    },
    { upsert: true, new: true }
  );
  interview.status = "completed";
  await interview.save();
  return res.status(200).json(new ApiResponse(200, feedback, "Feedback saved"));
});

export const getInterviewFeedback = asyncHandler(async (req, res) => {
  const interview = await Interview.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!interview) throw new ApiError(404, "Interview not found");
  const hr = (await isHrUser(req.user));
  const assigned = (interview.interviewerIds || []).some(
    (id) => String(id) === String(req.user._id)
  );
  if (!hr && !assigned) throw new ApiError(403, "Forbidden");
  const list = await InterviewFeedback.find({ interviewId: interview._id })
    .populate("by", "fullName email")
    .lean();
  return res.status(200).json(new ApiResponse(200, list, "Feedback"));
});
