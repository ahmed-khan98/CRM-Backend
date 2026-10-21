import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  Offer,
  OfferTemplate,
  Application,
  Candidate,
  Job,
  JoiningDetails,
} from "../../models/recruitment/index.js";
import {
  parsePagination,
  paginatedResponse,
  toNumber,
} from "../../utils/hrmsHelpers.js";
import {
  getOrCreateSettings,
  renderTemplate,
  sendTemplatedEmail,
  recordStageChange,
  logActivity,
  ensureRecruitmentDefaults,
} from "../../utils/recruitmentHelpers.js";
import {
  createOfferRespondToken,
  generateAndUploadOfferPdf,
  getPublicAppBaseUrl,
  finalizeOfferResponse,
  issueJoiningInvite,
  joiningExpiryDate,
} from "../../utils/joiningHelpers.js";

export const listOfferTemplates = asyncHandler(async (req, res) => {
  const items = await OfferTemplate.find({ isActive: true }).sort({
    isDefault: -1,
    name: 1,
  });
  return res.status(200).json(new ApiResponse(200, items, "Templates"));
});

export const upsertOfferTemplate = asyncHandler(async (req, res) => {
  const { id, name, subject, bodyHtml, isDefault } = req.body;
  if (!name || !bodyHtml) throw new ApiError(400, "name and bodyHtml required");
  let doc;
  if (id) {
    doc = await OfferTemplate.findByIdAndUpdate(
      id,
      {
        name,
        subject,
        bodyHtml,
        isDefault: Boolean(isDefault),
        updatedBy: req.user._id,
      },
      { new: true }
    );
  } else {
    doc = await OfferTemplate.create({
      name,
      subject: subject || "Job Offer — {{job_title}}",
      bodyHtml,
      isDefault: Boolean(isDefault),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  }
  if (isDefault && doc) {
    await OfferTemplate.updateMany(
      { _id: { $ne: doc._id } },
      { $set: { isDefault: false } }
    );
  }
  return res.status(200).json(new ApiResponse(200, doc, "Saved"));
});

export const listOffers = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.applicationId) filter.applicationId = req.query.applicationId;
  const [items, total] = await Promise.all([
    Offer.find(filter)
      .populate({
        path: "applicationId",
        select: "candidateId jobId stage employeeId",
        populate: [{ path: "candidateId", select: "fullName email" }],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Offer.countDocuments(filter),
  ]);

  const offerIds = items.map((o) => o._id);
  const joiningRows = offerIds.length
    ? await JoiningDetails.find({
        offerId: { $in: offerIds },
        isDeleted: false,
      })
        .select(
          "offerId status expiresAt submittedAt reviewedAt sentCount candidateName"
        )
        .lean()
    : [];
  const joiningByOffer = {};
  for (const j of joiningRows) joiningByOffer[String(j.offerId)] = j;

  // Prefer offer.jobId; backfill from application.jobId for older rows (id only, no job object)
  const withJoining = items.map((o) => {
    const appJobId = o.applicationId?.jobId || null;
    const jobId = o.jobId || appJobId || null;
    return {
      ...o,
      jobId,
      applicationId: o.applicationId
        ? {
            ...o.applicationId,
            jobId: appJobId,
          }
        : o.applicationId,
      joiningDetails: joiningByOffer[String(o._id)] || null,
    };
  });

  // Persist missing jobId on older offers (fire-and-forget)
  const needJobId = withJoining.filter(
    (o, i) => o.jobId && !items[i]?.jobId
  );
  if (needJobId.length) {
    Promise.all(
      needJobId.map((o) =>
        Offer.updateOne({ _id: o._id }, { $set: { jobId: o.jobId } })
      )
    ).catch(() => {});
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        paginatedResponse(withJoining, total, page, limit),
        "Offers"
      )
    );
});

export const createOffer = asyncHandler(async (req, res) => {
  const {
    applicationId,
    templateId,
    salary,
    salaryCurrency,
    joiningDate,
    bodyHtml,
    subject,
    expiresAt,
  } = req.body;
  if (!applicationId) throw new ApiError(400, "applicationId required");
  const app = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  });
  if (!app) throw new ApiError(404, "Application not found");
  const [candidate, job, settings] = await Promise.all([
    Candidate.findById(app.candidateId),
    Job.findById(app.jobId),
    getOrCreateSettings(),
  ]);
  let tpl = null;
  if (templateId) tpl = await OfferTemplate.findById(templateId);
  if (!tpl) tpl = await OfferTemplate.findOne({ isDefault: true, isActive: true });

  const vars = {
    candidate_name: candidate?.fullName || "",
    job_title: job?.title || "",
    salary:
      salary != null
        ? `${salaryCurrency || "PKR"} ${Number(salary).toLocaleString()}`
        : "",
    joining_date: joiningDate
      ? new Date(joiningDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "",
    company_name: settings.companyName,
    accept_url: "",
    decline_url: "",
  };
  const html =
    bodyHtml ||
    (tpl ? renderTemplate(tpl.bodyHtml, vars) : `<p>Offer for ${vars.job_title}</p>`);
  const subj =
    subject ||
    (tpl
      ? renderTemplate(tpl.subject, vars)
      : `Job Offer — ${vars.job_title}`);

  const offer = await Offer.create({
    applicationId,
    jobId: app.jobId || job?._id || null,
    templateId: tpl?._id || null,
    candidateName: vars.candidate_name,
    jobTitle: vars.job_title,
    salary: toNumber(salary) ?? null,
    salaryCurrency: salaryCurrency || "PKR",
    joiningDate: joiningDate ? new Date(joiningDate) : null,
    companyName: settings.companyName,
    bodyHtml: html,
    subject: subj,
    status: "draft",
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  return res.status(201).json(new ApiResponse(201, offer, "Offer created"));
});

export const updateOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.findOne({ _id: req.params.id, isDeleted: false });
  if (!offer) throw new ApiError(404, "Offer not found");
  if (offer.status !== "draft" && offer.status !== "sent") {
    throw new ApiError(400, "Cannot edit this offer");
  }
  const fields = [
    "bodyHtml",
    "subject",
    "salaryCurrency",
    "candidateName",
    "jobTitle",
    "companyName",
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) offer[f] = req.body[f];
  }
  if (req.body.salary !== undefined) offer.salary = toNumber(req.body.salary);
  if (req.body.joiningDate) offer.joiningDate = new Date(req.body.joiningDate);
  if (req.body.expiresAt) offer.expiresAt = new Date(req.body.expiresAt);
  offer.updatedBy = req.user._id;
  await offer.save();
  return res.status(200).json(new ApiResponse(200, offer, "Updated"));
});

export const sendOffer = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const offer = await Offer.findOne({ _id: req.params.id, isDeleted: false });
  if (!offer) throw new ApiError(404, "Offer not found");
  const app = await Application.findById(offer.applicationId);
  const candidate = await Candidate.findById(app?.candidateId);
  if (!candidate?.email) throw new ApiError(400, "Candidate email missing");

  const settings = await getOrCreateSettings();
  const base = getPublicAppBaseUrl(settings);
  const { raw, hash } = createOfferRespondToken();
  offer.respondTokenHash = hash;
  offer.respondTokenExpiresAt = joiningExpiryDate(settings);

  // Generate offer letter PDF (best-effort)
  try {
    const pdf = await generateAndUploadOfferPdf(offer);
    if (pdf.pdfUrl) {
      offer.pdfUrl = pdf.pdfUrl;
      offer.pdfPublicId = pdf.pdfPublicId;
    }
  } catch (err) {
    console.error("Offer PDF generate failed:", err?.message || err);
  }

  const acceptUrl = `${base}/offer/respond/${raw}?action=accept`;
  const declineUrl = `${base}/offer/respond/${raw}?action=decline`;

  await sendTemplatedEmail(
    "offer",
    candidate.email,
    {
      candidate_name: offer.candidateName,
      job_title: offer.jobTitle,
      company_name: offer.companyName || settings.companyName,
      salary:
        offer.salary != null
          ? `${offer.salaryCurrency} ${offer.salary.toLocaleString()}`
          : "",
      joining_date: offer.joiningDate
        ? new Date(offer.joiningDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "",
      offer_body: offer.bodyHtml,
      accept_url: acceptUrl,
      decline_url: declineUrl,
    },
    { type: "offer", id: offer._id }
  );

  offer.status = "sent";
  offer.sentAt = new Date();
  offer.updatedBy = req.user._id;
  await offer.save();

  if (
    app &&
    app.stage !== "offer" &&
    app.stage !== "offer_accepted" &&
    app.stage !== "hired"
  ) {
    const from = app.stage;
    app.stage = "offer";
    await app.save();
    await recordStageChange({
      applicationId: app._id,
      fromStage: from,
      toStage: "offer",
      by: req.user._id,
      note: "Offer sent",
    });
  }

  await logActivity({
    entityType: "offer",
    entityId: offer._id,
    action: "sent",
    actorId: req.user._id,
  });

  return res.status(200).json(new ApiResponse(200, offer, "Offer sent"));
});

export const respondOffer = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["accepted", "declined"].includes(status)) {
    throw new ApiError(400, "status must be accepted or declined");
  }
  const offer = await Offer.findOne({ _id: req.params.id, isDeleted: false });
  if (!offer) throw new ApiError(404, "Offer not found");

  let result;
  try {
    result = await finalizeOfferResponse({
      offer,
      status,
      actorId: req.user._id,
      via: "hr",
    });
  } catch (err) {
    throw new ApiError(400, err.message || "Cannot respond to offer");
  }

  const candidate = result.candidate;
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        offer: result.offer,
        joiningDetails: result.joining,
        createEmployeeHint: status === "accepted",
        prefill:
          status === "accepted"
            ? {
                fullName: offer.candidateName,
                email: candidate?.email || "",
                phoneNo: candidate?.phone || "",
                address: candidate?.currentLocation || "",
                designation: offer.jobTitle,
                joiningDate: offer.joiningDate,
                currentSalary: offer.salary,
                departmentId: null,
              }
            : null,
      },
      "Offer updated"
    )
  );
});

/** HR: resend joining magic link */
export const resendJoiningLink = asyncHandler(async (req, res) => {
  const offer = await Offer.findOne({ _id: req.params.id, isDeleted: false });
  if (!offer) throw new ApiError(404, "Offer not found");
  if (offer.status !== "accepted") {
    throw new ApiError(400, "Offer must be accepted first");
  }
  const app = await Application.findById(offer.applicationId);
  const candidate = await Candidate.findById(app?.candidateId);
  if (!candidate?.email) throw new ApiError(400, "Candidate email missing");

  let issued;
  try {
    issued = await issueJoiningInvite({
      offer,
      application: app,
      candidate,
      actorId: req.user._id,
      resend: true,
    });
  } catch (err) {
    throw new ApiError(400, err.message || "Cannot resend joining link");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, issued.joining, "Joining link resent"));
});
