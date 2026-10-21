import {
  RecruitmentSettings,
  RecruitmentEmailTemplate,
  OfferTemplate,
  RecruitmentOutbox,
  RecruitmentActivityLog,
  ApplicationStageHistory,
} from "../models/recruitment/index.js";
import { sendEmail } from "./mailgun.js";

export const HR_ROLES = ["ADMIN", "SUBADMIN", "HR_ADMIN"];

export const DEFAULT_STAGES = [
  { key: "applied", label: "Applied", sortOrder: 0, isTerminal: false },
  { key: "screened", label: "Screened", sortOrder: 1, isTerminal: false },
  { key: "shortlisted", label: "Shortlisted", sortOrder: 2, isTerminal: false },
  { key: "interview", label: "Interview", sortOrder: 3, isTerminal: false },
  { key: "offer", label: "Offer", sortOrder: 4, isTerminal: false },
  {
    key: "offer_accepted",
    label: "Offer Accepted",
    sortOrder: 5,
    isTerminal: false,
  },
  { key: "hired", label: "Hired", sortOrder: 6, isTerminal: true },
  { key: "rejected", label: "Rejected", sortOrder: 7, isTerminal: true },
];

export const DEFAULT_REJECTION_REASONS = [
  { key: "skills", label: "Skills mismatch" },
  { key: "experience", label: "Insufficient experience" },
  { key: "culture", label: "Culture fit" },
  { key: "salary", label: "Salary expectations" },
  { key: "other", label: "Other" },
];

export const DEFAULT_SOURCES = [
  { key: "careers", label: "Careers page" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "referral", label: "Referral" },
  { key: "agency", label: "Agency" },
  { key: "other", label: "Other" },
];

const DEFAULT_EMAIL_TEMPLATES = [
  {
    key: "application_received",
    name: "Application received",
    subject: "We received your application for {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>Thank you for applying to <strong>{{job_title}}</strong> at {{company_name}}. Our team will review your application shortly.</p><p>Best regards,<br/>{{company_name}} Talent Team</p>",
  },
  {
    key: "shortlisted",
    name: "Shortlisted",
    subject: "You have been shortlisted for {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>Great news — you have been shortlisted for <strong>{{job_title}}</strong>. We will contact you about next steps soon.</p><p>Best regards,<br/>{{company_name}}</p>",
  },
  {
    key: "interview_invite",
    name: "Interview invite",
    subject: "Interview invitation — {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>You are invited to an interview for <strong>{{job_title}}</strong>.</p><p><strong>When:</strong> {{interview_datetime}}<br/><strong>Type:</strong> {{interview_type}}<br/><strong>Details:</strong> {{interview_details}}</p><p>Best regards,<br/>{{company_name}}</p>",
  },
  {
    key: "rejection",
    name: "Rejection",
    subject: "Update on your application for {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>Thank you for your interest in <strong>{{job_title}}</strong>. After careful review, we will not be moving forward at this time. We appreciate your time and wish you the best.</p><p>Best regards,<br/>{{company_name}}</p>",
  },
  {
    key: "offer",
    name: "Offer",
    subject: "Job offer — {{job_title}} at {{company_name}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>We are pleased to offer you the position of <strong>{{job_title}}</strong> at {{company_name}}.</p><p><strong>Salary:</strong> {{salary}}<br/><strong>Joining date:</strong> {{joining_date}}</p><p>{{offer_body}}</p><p><a href=\"{{accept_url}}\">Accept offer</a> &nbsp;|&nbsp; <a href=\"{{decline_url}}\">Decline offer</a></p><p>Best regards,<br/>{{company_name}}</p>",
  },
  {
    key: "joining_invite",
    name: "Joining details invite",
    subject: "Complete your joining details — {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>Welcome to {{company_name}}! Please complete your joining details for <strong>{{job_title}}</strong> using the secure link below (expires {{expiry_date}}).</p><p><a href=\"{{joining_url}}\">Open joining form</a></p><p><strong>Required:</strong> Personal, Emergency contact, Bank, Family, Documents. Previous employment is optional if this is your first job.</p><p>Best regards,<br/>{{company_name}} HR</p>",
  },
  {
    key: "joining_submitted_hr",
    name: "Joining details submitted (HR)",
    subject: "Joining details submitted — {{candidate_name}}",
    bodyHtml:
      "<p>{{candidate_name}} submitted joining details for <strong>{{job_title}}</strong>.</p><p>Please review in the CRM Recruitment module.</p>",
  },
  {
    key: "joining_changes_requested",
    name: "Joining details changes requested",
    subject: "Update needed on your joining details — {{job_title}}",
    bodyHtml:
      "<p>Hi {{candidate_name}},</p><p>HR requested updates to your joining details for <strong>{{job_title}}</strong>.</p><p><strong>Note:</strong> {{review_note}}</p><p><a href=\"{{joining_url}}\">Update joining form</a></p><p>Best regards,<br/>{{company_name}} HR</p>",
  },
];

export function slugify(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function uniqueJobSlug(title, excludeId = null) {
  let base = slugify(title) || "job";
  let slug = base;
  let n = 1;
  const { Job } = await import("../models/recruitment/index.js");
  // Must check all docs — slug has a global unique index, including soft-deleted
  while (true) {
    const q = { slug };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Job.findOne(q).select("_id").lean();
    if (!exists) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Last-resort form-only fallback (no CV / no AI).
 * Returns { matchPercent, matchStatus, confidence, note, ... } — never invents flat 50/70.
 * Prefer the match queue + scoreApplicationMatch for real scoring.
 */
export { calculateMatchPercent } from "../services/ai/matching/fallback.js";

export function renderTemplate(str = "", vars = {}) {
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

export async function getOrCreateSettings() {
  let doc = await RecruitmentSettings.findOne();
  if (doc) return doc;
  doc = await RecruitmentSettings.create({
    companyName: process.env.COMPANY_NAME || "Company",
    pipelineStages: DEFAULT_STAGES,
    rejectionReasons: DEFAULT_REJECTION_REASONS,
    applicationSources: DEFAULT_SOURCES,
    matchWeights: {
      mustHaveSkills: 40,
      experience: 25,
      roleRelevance: 15,
      education: 10,
      niceToHaveSkills: 10,
    },
    mustHaveCap: 60,
    mustHaveCapTiers: {
      b1: 10,
      b2: 25,
      b3: 50,
      c1: 85,
      c2: 75,
      c3: 60,
    },
    aiMatchingEnabled: true,
    defaultMinMatchScore: 0,
  });
  return doc;
}

export async function ensureRecruitmentDefaults() {
  const settings = await getOrCreateSettings();
  let settingsDirty = false;
  if (!settings.matchWeights || settings.matchWeights.mustHaveSkills == null) {
    settings.matchWeights = {
      mustHaveSkills: 40,
      experience: 25,
      roleRelevance: 15,
      education: 10,
      niceToHaveSkills: 10,
    };
    settingsDirty = true;
  }
  if (settings.mustHaveCap == null) {
    settings.mustHaveCap = 60;
    settingsDirty = true;
  }
  // Backfill graduated tiers from legacy mustHaveCap (no data loss)
  if (
    !settings.mustHaveCapTiers ||
    settings.mustHaveCapTiers.b1 == null ||
    settings.mustHaveCapTiers.c3 == null
  ) {
    const hard =
      settings.mustHaveCap != null ? Number(settings.mustHaveCap) : 60;
    settings.mustHaveCapTiers = {
      b1: 10,
      b2: 25,
      b3: 50,
      c1: 85,
      c2: 75,
      c3: Number.isFinite(hard) ? hard : 60,
    };
    settingsDirty = true;
  }
  if (settings.aiMatchingEnabled == null) {
    settings.aiMatchingEnabled = true;
    settingsDirty = true;
  }
  if (settings.defaultMinMatchScore == null) {
    settings.defaultMinMatchScore = 0;
    settingsDirty = true;
  }
  // Ensure offer_accepted stage exists for existing tenants
  const stages = Array.isArray(settings.pipelineStages)
    ? [...settings.pipelineStages]
    : [];
  if (!stages.some((s) => s.key === "offer_accepted")) {
    const offerIdx = stages.findIndex((s) => s.key === "offer");
    const insertAt = offerIdx >= 0 ? offerIdx + 1 : stages.length;
    stages.splice(insertAt, 0, {
      key: "offer_accepted",
      label: "Offer Accepted",
      sortOrder: 5,
      isTerminal: false,
    });
    stages.forEach((s, i) => {
      s.sortOrder = i;
    });
    settings.pipelineStages = stages;
    settingsDirty = true;
  }
  if (settingsDirty) await settings.save();
  for (const t of DEFAULT_EMAIL_TEMPLATES) {
    await RecruitmentEmailTemplate.updateOne(
      { key: t.key },
      { $setOnInsert: t },
      { upsert: true }
    );
  }
  // Refresh offer email body if older seed missing accept links
  await RecruitmentEmailTemplate.updateOne(
    { key: "offer", bodyHtml: { $not: /accept_url/ } },
    {
      $set: {
        bodyHtml: DEFAULT_EMAIL_TEMPLATES.find((x) => x.key === "offer").bodyHtml,
      },
    }
  );
  // Drop outdated "optional" joining invite copy
  await RecruitmentEmailTemplate.updateOne(
    { key: "joining_invite", bodyHtml: /optional/i },
    {
      $set: {
        bodyHtml: DEFAULT_EMAIL_TEMPLATES.find(
          (x) => x.key === "joining_invite"
        ).bodyHtml,
      },
    }
  );
  const offerCount = await OfferTemplate.countDocuments();
  if (!offerCount) {
    await OfferTemplate.create({
      name: "Standard offer",
      isDefault: true,
      subject: "Job Offer — {{job_title}}",
      bodyHtml:
        "<p>Dear {{candidate_name}},</p><p>We are delighted to offer you the role of <strong>{{job_title}}</strong> at {{company_name}} with a compensation of <strong>{{salary}}</strong>, joining on <strong>{{joining_date}}</strong>.</p><p>Please reply to accept or decline this offer.</p><p>Sincerely,<br/>{{company_name}} HR</p>",
    });
  }
  return true;
}

export async function logActivity({
  entityType,
  entityId,
  action,
  actorId = null,
  meta = {},
}) {
  try {
    await RecruitmentActivityLog.create({
      entityType,
      entityId,
      action,
      actorId,
      meta,
    });
  } catch (e) {
    console.error("recruitment activity log error", e?.message);
  }
}

export async function recordStageChange({
  applicationId,
  fromStage,
  toStage,
  by = null,
  note = "",
}) {
  await ApplicationStageHistory.create({
    applicationId,
    fromStage,
    toStage,
    by,
    note,
    at: new Date(),
  });
}

export async function enqueueEmail({
  to,
  subject,
  html,
  templateKey = "",
  relatedType = "",
  relatedId = null,
}) {
  if (!to) return null;
  const row = await RecruitmentOutbox.create({
    to,
    subject,
    html,
    templateKey,
    relatedType,
    relatedId,
    status: "pending",
  });
  // best-effort immediate flush
  flushOutbox(5).catch(() => {});
  return row;
}

export async function sendTemplatedEmail(key, to, vars = {}, related = {}) {
  const tpl = await RecruitmentEmailTemplate.findOne({ key, isActive: true });
  if (!tpl) return null;
  const settings = await getOrCreateSettings();
  const merged = {
    company_name: settings.companyName || "Company",
    ...vars,
  };
  return enqueueEmail({
    to,
    subject: renderTemplate(tpl.subject, merged),
    html: renderTemplate(tpl.bodyHtml, merged),
    templateKey: key,
    relatedType: related.type || "",
    relatedId: related.id || null,
  });
}

export async function flushOutbox(limit = 20) {
  // HRMS recruitment mail via SMTP careers@ (Mailgun disabled)
  const fromEmail =
    process.env.RECRUITMENT_FROM_EMAIL ||
    process.env.SMTP_USER ||
    process.env.CAREERS_SMTP_USER ||
    process.env.SMTP_FROM ||
    "careers@zytronworld.com";
  const fromName =
    process.env.RECRUITMENT_FROM_NAME ||
    process.env.COMPANY_NAME ||
    "Zytron Careers";

  const pending = await RecruitmentOutbox.find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(limit);

  for (const row of pending) {
    row.attempts += 1;
    try {
      if (!fromEmail) {
        throw new Error("RECRUITMENT_FROM_EMAIL / SMTP_USER not configured");
      }
      await sendEmail(
        `${fromName} <${fromEmail}>`,
        fromEmail,
        row.to,
        row.subject,
        row.html
      );
      row.status = "sent";
      row.sentAt = new Date();
      row.lastError = "";
    } catch (e) {
      row.lastError = e?.message || String(e);
      if (row.attempts >= 5) row.status = "failed";
    }
    await row.save();
  }
  return pending.length;
}

export function isHrRole(role) {
  return HR_ROLES.includes(role);
}

/** Role is HR, or employee belongs to HR department. */
export async function isHrUser(user) {
  if (isHrRole(user?.role)) return true;
  const { userHasHrAdminAccess } = await import("./hrAccess.js");
  return userHasHrAdminAccess(user);
}

export function parseSkills(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parseSkills(parsed);
    } catch {
      /* csv */
    }
    return input
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function publicJobShape(job, questions = []) {
  if (!job) return null;
  const j = typeof job.toObject === "function" ? job.toObject() : { ...job };
  const out = {
    _id: j._id,
    title: j.title,
    slug: j.slug,
    departmentId: j.departmentId,
    location: j.location,
    jobType: j.jobType,
    workMode: j.workMode,
    description: j.description,
    requirements: j.requirements,
    responsibilities: j.responsibilities,
    skills: j.skills,
    experienceMin: j.experienceMin,
    experienceMax: j.experienceMax,
    education: j.education,
    openings: j.openings,
    deadline: j.deadline,
    status: j.status,
    publishedAt: j.publishedAt,
    createdAt: j.createdAt,
    showSalary: j.showSalary,
  };
  if (j.showSalary) {
    out.salaryMin = j.salaryMin;
    out.salaryMax = j.salaryMax;
    out.salaryCurrency = j.salaryCurrency;
  }
  if (questions?.length) {
    out.questions = questions.map((q) => ({
      _id: q._id,
      type: q.type,
      label: q.label,
      options: q.options,
      required: q.required,
      sortOrder: q.sortOrder,
    }));
  }
  return out;
}
