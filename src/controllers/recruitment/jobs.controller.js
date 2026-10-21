import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Job,
  JobQuestion,
  Application,
  JOB_STATUSES,
} from "../../models/recruitment/index.js";
import {
  parsePagination,
  paginatedResponse,
  parseMaybeJson,
  toNumber,
} from "../../utils/hrmsHelpers.js";
import {
  uniqueJobSlug,
  parseSkills,
  logActivity,
  ensureRecruitmentDefaults,
} from "../../utils/recruitmentHelpers.js";

const VERSION_FIELDS = [
  "title",
  "description",
  "requirements",
  "responsibilities",
  "skills",
  "niceToHaveSkills",
  "experienceMin",
  "experienceMax",
  "education",
];

function skillsEqual(a, b) {
  const norm = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
  return norm(a) === norm(b);
}

function pickJobBody(body = {}) {
  const data = {
    title: body.title?.trim(),
    departmentId: body.departmentId || null,
    location: body.location?.trim() || "",
    jobType: body.jobType,
    workMode: body.workMode,
    description: body.description || "",
    requirements: body.requirements || "",
    responsibilities: body.responsibilities || "",
    skills: parseSkills(body.skills),
    experienceMin: toNumber(body.experienceMin) ?? 0,
    experienceMax: toNumber(body.experienceMax) ?? 0,
    education: body.education?.trim() || "",
    salaryMin: toNumber(body.salaryMin) ?? null,
    salaryMax: toNumber(body.salaryMax) ?? null,
    salaryCurrency: body.salaryCurrency?.trim() || "PKR",
    showSalary: Boolean(body.showSalary === true || body.showSalary === "true"),
    openings: toNumber(body.openings) ?? 1,
    deadline: body.deadline ? new Date(body.deadline) : null,
    status: body.status,
  };
  if (body.niceToHaveSkills !== undefined) {
    data.niceToHaveSkills = parseSkills(body.niceToHaveSkills);
  }
  return data;
}

function shouldBumpJobVersion(job, data) {
  for (const key of VERSION_FIELDS) {
    if (data[key] === undefined) continue;
    if (key === "skills" || key === "niceToHaveSkills") {
      if (!skillsEqual(job[key], data[key])) return true;
      continue;
    }
    if (String(job[key] ?? "") !== String(data[key] ?? "")) return true;
  }
  return false;
}

async function syncQuestions(jobId, questions = []) {
  const list = Array.isArray(questions) ? questions : [];
  const keepIds = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q?.label?.trim()) continue;
    const payload = {
      type: q.type || "text",
      label: q.label.trim(),
      options: Array.isArray(q.options) ? q.options : [],
      required: Boolean(q.required),
      sortOrder: q.sortOrder ?? i,
      isDeleted: false,
    };
    if (q._id) {
      const updated = await JobQuestion.findOneAndUpdate(
        { _id: q._id, jobId },
        { $set: payload },
        { new: true }
      );
      if (updated) keepIds.push(updated._id);
    } else {
      const created = await JobQuestion.create({ jobId, ...payload });
      keepIds.push(created._id);
    }
  }
  await JobQuestion.updateMany(
    { jobId, _id: { $nin: keepIds }, isDeleted: false },
    { $set: { isDeleted: true } }
  );
}

export const listJobs = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.location) {
    filter.location = new RegExp(String(req.query.location).trim(), "i");
  }
  if (req.query.q) {
    filter.$text = { $search: String(req.query.q).trim() };
  }
  const sort =
    req.query.sort === "applicants"
      ? { applicantCount: -1 }
      : req.query.sort === "title"
        ? { title: 1 }
        : { updatedAt: -1 };

  const [items, total] = await Promise.all([
    Job.find(filter)
      .populate("departmentId", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, paginatedResponse(items, total, page, limit), "Jobs")
    );
});

export const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, isDeleted: false })
    .populate("departmentId", "name")
    .lean();
  if (!job) throw new ApiError(404, "Job not found");
  const questions = await JobQuestion.find({
    jobId: job._id,
    isDeleted: false,
  })
    .sort({ sortOrder: 1 })
    .lean();
  return res
    .status(200)
    .json(new ApiResponse(200, { ...job, questions }, "Job found"));
});

export const createJob = asyncHandler(async (req, res) => {
  const data = pickJobBody(req.body);
  if (!data.title) throw new ApiError(400, "Title is required");
  if (data.status && !JOB_STATUSES.includes(data.status)) {
    throw new ApiError(400, "Invalid status");
  }
  data.slug = await uniqueJobSlug(data.title);
  data.createdBy = req.user._id;
  data.updatedBy = req.user._id;
  if (data.status === "published") data.publishedAt = new Date();
  const job = await Job.create(data);
  const questions = parseMaybeJson(req.body.questions, []);
  await syncQuestions(job._id, questions);
  await logActivity({
    entityType: "job",
    entityId: job._id,
    action: "created",
    actorId: req.user._id,
  });
  const full = await Job.findById(job._id).populate("departmentId", "name");
  const qs = await JobQuestion.find({ jobId: job._id, isDeleted: false }).sort({
    sortOrder: 1,
  });
  return res
    .status(201)
    .json(new ApiResponse(201, { ...full.toObject(), questions: qs }, "Created"));
});

export const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, isDeleted: false });
  if (!job) throw new ApiError(404, "Job not found");
  const data = pickJobBody(req.body);
  if (req.body.title && req.body.title.trim() !== job.title) {
    data.slug = await uniqueJobSlug(req.body.title, job._id);
  }
  if (data.status === "published" && job.status !== "published") {
    data.publishedAt = job.publishedAt || new Date();
  }
  if (shouldBumpJobVersion(job, data)) {
    job.version = (Number(job.version) || 1) + 1;
  }
  Object.assign(job, data);
  job.updatedBy = req.user._id;
  await job.save();
  if (req.body.questions !== undefined) {
    await syncQuestions(job._id, parseMaybeJson(req.body.questions, []));
  }
  await logActivity({
    entityType: "job",
    entityId: job._id,
    action: "updated",
    actorId: req.user._id,
  });
  return getJob(req, res);
});

export const setJobStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!JOB_STATUSES.includes(status)) throw new ApiError(400, "Invalid status");
  const job = await Job.findOne({ _id: req.params.id, isDeleted: false });
  if (!job) throw new ApiError(404, "Job not found");
  job.status = status;
  if (status === "published" && !job.publishedAt) job.publishedAt = new Date();
  job.updatedBy = req.user._id;
  await job.save();
  await logActivity({
    entityType: "job",
    entityId: job._id,
    action: `status_${status}`,
    actorId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, job, "Status updated"));
});

export const duplicateJob = asyncHandler(async (req, res) => {
  const src = await Job.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!src) throw new ApiError(404, "Job not found");
  const copy = await Job.create({
    title: `${src.title} (Copy)`,
    slug: await uniqueJobSlug(`${src.title} copy`),
    departmentId: src.departmentId || null,
    location: src.location || "",
    jobType: src.jobType || "full_time",
    workMode: src.workMode || "onsite",
    description: src.description || "",
    requirements: src.requirements || "",
    responsibilities: src.responsibilities || "",
    skills: Array.isArray(src.skills) ? src.skills : parseSkills(src.skills),
    niceToHaveSkills: Array.isArray(src.niceToHaveSkills)
      ? src.niceToHaveSkills
      : parseSkills(src.niceToHaveSkills),
    experienceMin: src.experienceMin ?? 0,
    experienceMax: src.experienceMax ?? 0,
    education: src.education || "",
    version: 1,
    salaryMin: src.salaryMin ?? null,
    salaryMax: src.salaryMax ?? null,
    salaryCurrency: src.salaryCurrency || "PKR",
    showSalary: Boolean(src.showSalary),
    openings: Math.max(1, src.openings || 1),
    deadline: src.deadline || null,
    status: "draft",
    applicantCount: 0,
    publishedAt: null,
    isDeleted: false,
    deletedAt: null,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  const questions = await JobQuestion.find({
    jobId: src._id,
    isDeleted: false,
  }).lean();
  for (const q of questions) {
    await JobQuestion.create({
      jobId: copy._id,
      type: q.type,
      label: q.label,
      options: q.options,
      required: q.required,
      sortOrder: q.sortOrder,
    });
  }
  await logActivity({
    entityType: "job",
    entityId: copy._id,
    action: "duplicated",
    actorId: req.user._id,
    meta: { from: src._id },
  });
  return res.status(201).json(new ApiResponse(201, copy, "Duplicated"));
});

export const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, isDeleted: false });
  if (!job) throw new ApiError(404, "Job not found");
  const apps = await Application.countDocuments({
    jobId: job._id,
    isDeleted: false,
  });
  if (apps > 0) {
    job.status = "closed";
    job.isDeleted = true;
    job.deletedAt = new Date();
  } else {
    job.isDeleted = true;
    job.deletedAt = new Date();
  }
  job.updatedBy = req.user._id;
  await job.save();
  await logActivity({
    entityType: "job",
    entityId: job._id,
    action: "deleted",
    actorId: req.user._id,
  });
  return res.status(200).json(new ApiResponse(200, null, "Job deleted"));
});
