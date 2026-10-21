import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  JoiningDetails,
  createJoiningToken,
  hashJoiningToken,
  Application,
  Candidate,
  Offer,
} from "../models/recruitment/index.js";
import { uploadAttachmentOnCloudinary } from "./cloudinary.js";
import {
  getOrCreateSettings,
  sendTemplatedEmail,
  recordStageChange,
  logActivity,
} from "./recruitmentHelpers.js";

export function getPublicAppBaseUrl(settings) {
  const fromSettings = String(settings?.careersPublicBaseUrl || "").trim();
  if (fromSettings) return fromSettings.replace(/\/$/, "");
  const fromEnv = String(
    process.env.CAREERS_PUBLIC_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.CRM_PUBLIC_URL ||
      ""
  ).trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function joiningExpiryDate(settings, from = new Date()) {
  const days = Math.min(
    90,
    Math.max(1, Number(settings?.joiningLinkExpiryDays) || 7)
  );
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Minimal text PDF (no extra dependency) for offer letter archive */
export function buildSimplePdfBuffer({ title, lines = [] }) {
  const escapePdf = (s) =>
    String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  const contentLines = [
    "BT",
    "/F1 14 Tf",
    "50 780 Td",
    `(${escapePdf(title || "Offer Letter")}) Tj`,
    "0 -24 Td",
    "/F1 11 Tf",
  ];
  let yStep = 0;
  for (const line of lines.slice(0, 40)) {
    contentLines.push(`0 -16 Td (${escapePdf(line)}) Tj`);
    yStep += 1;
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const objs = [];
  objs.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objs.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objs.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
  );
  objs.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objs.push(
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function generateAndUploadOfferPdf(offer) {
  const lines = [
    `Candidate: ${offer.candidateName || ""}`,
    `Role: ${offer.jobTitle || ""}`,
    `Company: ${offer.companyName || ""}`,
    offer.salary != null
      ? `Salary: ${offer.salaryCurrency || "PKR"} ${Number(
          offer.salary
        ).toLocaleString()}`
      : "Salary: —",
    offer.joiningDate
      ? `Joining date: ${new Date(offer.joiningDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      : "Joining date: —",
    "",
    String(offer.bodyHtml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200),
  ];
  const buf = buildSimplePdfBuffer({
    title: `Offer — ${offer.jobTitle || "Role"}`,
    lines,
  });
  const tmp = path.join(
    os.tmpdir(),
    `offer_${offer._id}_${Date.now()}.pdf`
  );
  fs.writeFileSync(tmp, buf);
  try {
    const uploaded = await uploadAttachmentOnCloudinary({
      path: tmp,
      originalname: `Offer_Letter_${String(offer.candidateName || "Candidate")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .slice(0, 40)}.pdf`,
      mimetype: "application/pdf",
      size: buf.length,
    });
    if (uploaded?.error || !uploaded?.secure_url) {
      return { pdfUrl: "", pdfPublicId: "" };
    }
    return {
      pdfUrl: uploaded.secure_url,
      pdfPublicId: uploaded.public_id || "",
    };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export function createOfferRespondToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return {
    raw,
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

export function hashOfferRespondToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Create/refresh joiningDetails + email magic link to candidate.
 * Invalidates previous token on resend.
 */
export async function issueJoiningInvite({
  offer,
  application,
  candidate,
  actorId = null,
  resend = false,
}) {
  const settings = await getOrCreateSettings();
  const base = getPublicAppBaseUrl(settings);
  const { raw, hash } = createJoiningToken();
  const expiresAt = joiningExpiryDate(settings);

  let doc = await JoiningDetails.findOne({
    offerId: offer._id,
    isDeleted: false,
  });
  if (!doc) {
    doc = await JoiningDetails.create({
      applicationId: application._id,
      candidateId: candidate._id,
      offerId: offer._id,
      tokenHash: hash,
      expiresAt,
      status: "sent",
      sentCount: 1,
      candidateName: offer.candidateName || candidate.fullName || "",
      jobTitle: offer.jobTitle || "",
      companyName: offer.companyName || settings.companyName || "",
    });
  } else {
    if (["approved", "used"].includes(doc.status)) {
      if (!resend) {
        return { joining: doc, rawToken: null, joiningUrl: null };
      }
      throw new Error(
        "Joining details are locked (approved/used) — cannot resend"
      );
    }
    // Keep prior hashes valid until expiresAt so older emails still open
    if (doc.tokenHash && doc.tokenHash !== hash) {
      const prev = Array.isArray(doc.previousTokenHashes)
        ? [...doc.previousTokenHashes]
        : [];
      prev.push({
        hash: doc.tokenHash,
        expiresAt: doc.expiresAt || expiresAt,
      });
      doc.previousTokenHashes = prev.slice(-12);
    }
    doc.tokenHash = hash;
    doc.expiresAt = expiresAt;
    // Resend / reopen: unlock form (empty submit used to leave status=submitted)
    if (resend || ["not_sent", "expired", "submitted"].includes(doc.status)) {
      doc.status = "sent";
      doc.submittedAt = null;
      doc.reviewNote = "";
      doc.requestedSections = [];
    }
    doc.sentCount = (doc.sentCount || 0) + 1;
    doc.candidateName = offer.candidateName || candidate.fullName || doc.candidateName;
    doc.jobTitle = offer.jobTitle || doc.jobTitle;
    doc.companyName =
      offer.companyName || settings.companyName || doc.companyName;
    await doc.save();
  }

  const joiningUrl = `${base}/joining/${raw}`;
  if (candidate?.email) {
    await sendTemplatedEmail(
      "joining_invite",
      candidate.email,
      {
        candidate_name: doc.candidateName,
        job_title: doc.jobTitle,
        company_name: doc.companyName || settings.companyName,
        joining_url: joiningUrl,
        expiry_date: expiresAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      },
      { type: "joining", id: doc._id }
    );
  }

  await logActivity({
    entityType: "joining",
    entityId: doc._id,
    action: resend ? "joining_link_resent" : "joining_link_sent",
    actorId,
    meta: { offerId: offer._id, applicationId: application._id },
  });

  return { joining: doc, rawToken: raw, joiningUrl };
}

/**
 * Shared accept/decline logic for HR and public magic-link paths.
 * On accept: stage → offer_accepted (not hired), issue joining invite.
 */
export async function finalizeOfferResponse({
  offer,
  status,
  actorId = null,
  via = "hr",
}) {
  if (!["accepted", "declined"].includes(status)) {
    throw new Error("status must be accepted or declined");
  }
  if (offer.status === "accepted" || offer.status === "declined") {
    throw new Error("Offer already finalized");
  }
  if (offer.status !== "sent" && offer.status !== "draft") {
    throw new Error("Offer cannot be responded to");
  }

  offer.status = status;
  offer.respondedAt = new Date();
  if (actorId) offer.updatedBy = actorId;
  // Invalidate respond token after use
  offer.respondTokenHash = "";
  offer.respondTokenExpiresAt = null;
  await offer.save();

  const app = await Application.findById(offer.applicationId);
  const candidate = app
    ? await Candidate.findById(app.candidateId)
    : null;

  let joining = null;
  if (app && status === "accepted") {
    const from = app.stage;
    if (from !== "offer_accepted" && from !== "hired") {
      app.stage = "offer_accepted";
      await app.save();
      await recordStageChange({
        applicationId: app._id,
        fromStage: from,
        toStage: "offer_accepted",
        by: actorId || null,
        note: via === "public" ? "Offer accepted via email link" : "Offer accepted",
      });
    }
    if (candidate) {
      const issued = await issueJoiningInvite({
        offer,
        application: app,
        candidate,
        actorId,
      });
      joining = issued.joining;
    }
  }

  await logActivity({
    entityType: "offer",
    entityId: offer._id,
    action: status,
    actorId,
    meta: { via },
  });

  return { offer, application: app, candidate, joining };
}

export function publicJoiningShape(doc, { editable }) {
  if (!doc) return null;
  const expired =
    doc.expiresAt && new Date(doc.expiresAt) < new Date() &&
    !["submitted", "approved", "used", "changes_requested"].includes(doc.status);
  return {
    _id: doc._id,
    status: expired ? "expired" : doc.status,
    expiresAt: doc.expiresAt,
    submittedAt: doc.submittedAt,
    reviewNote: doc.reviewNote || "",
    requestedSections: doc.requestedSections || [],
    candidateName: doc.candidateName,
    jobTitle: doc.jobTitle,
    companyName: doc.companyName,
    editable: Boolean(editable) && !expired,
    data: doc.data || {},
  };
}

export function canCandidateEditJoining(doc) {
  if (!doc || doc.isDeleted) return false;
  if (["approved", "used", "submitted"].includes(doc.status)) return false;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
    if (doc.status !== "changes_requested" && doc.status !== "draft") return false;
  }
  return ["sent", "draft", "changes_requested"].includes(doc.status);
}

export function canHrEditJoining(doc) {
  if (!doc || doc.isDeleted) return false;
  return !["approved", "used"].includes(doc.status);
}

/** Deep-merge joining form payload into existing data subdoc */
export function mergeJoiningData(existing, incoming) {
  const base = existing?.toObject ? existing.toObject() : { ...(existing || {}) };
  const src = incoming && typeof incoming === "object" ? incoming : {};
  const out = { ...base };

  if (src.personal && typeof src.personal === "object") {
    out.personal = { ...(base.personal || {}), ...src.personal };
    if (src.personal.dateOfBirth !== undefined) {
      out.personal.dateOfBirth = src.personal.dateOfBirth
        ? new Date(src.personal.dateOfBirth)
        : null;
    }
  }
  if (src.emergencyContact && typeof src.emergencyContact === "object") {
    out.emergencyContact = {
      ...(base.emergencyContact || {}),
      ...src.emergencyContact,
    };
  }
  if (src.bank && typeof src.bank === "object") {
    out.bank = { ...(base.bank || {}), ...src.bank };
  }
  if (src.ntn !== undefined) out.ntn = String(src.ntn || "");
  if (src.consent !== undefined) out.consent = Boolean(src.consent);

  if (src.family && typeof src.family === "object") {
    out.family = { ...(base.family || {}) };
    if (src.family.fatherName !== undefined)
      out.family.fatherName = String(src.family.fatherName || "");
    if (src.family.motherName !== undefined)
      out.family.motherName = String(src.family.motherName || "");
    if (src.family.spouse && typeof src.family.spouse === "object") {
      out.family.spouse = {
        ...(base.family?.spouse || {}),
        ...src.family.spouse,
      };
      if (src.family.spouse.dob !== undefined) {
        out.family.spouse.dob = src.family.spouse.dob
          ? new Date(src.family.spouse.dob)
          : null;
      }
      // spouse.phone removed from schema — strip legacy values
      if (out.family.spouse && "phone" in out.family.spouse) {
        delete out.family.spouse.phone;
      }
    }
    if (Array.isArray(src.family.children)) {
      out.family.children = src.family.children.map((c) => ({
        name: c?.name || "",
        dob: c?.dob ? new Date(c.dob) : null,
        gender: c?.gender || "",
        ...(c?._id ? { _id: c._id } : {}),
      }));
    }
  }

  if (Array.isArray(src.previousJobs)) {
    out.previousJobs = src.previousJobs.map((j) => ({
      companyName: j?.companyName || "",
      designation: j?.designation || "",
      startDate: j?.startDate ? new Date(j.startDate) : null,
      endDate: j?.endDate ? new Date(j.endDate) : null,
      lastSalary:
        j?.lastSalary != null && j.lastSalary !== ""
          ? Number(j.lastSalary)
          : null,
      reasonForLeaving: j?.reasonForLeaving || "",
      ...(j?._id ? { _id: j._id } : {}),
    }));
  }

  if (Array.isArray(src.documents)) {
    out.documents = src.documents;
  }

  return out;
}

export function hrJoiningShape(doc) {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    ...plain,
    hrEditable: canHrEditJoining(plain),
    canApprove: plain.status === "submitted",
    canRequestChanges: ["submitted", "draft"].includes(plain.status),
  };
}

function filled(v) {
  if (v == null) return false;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return String(v).trim().length > 0;
}

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const MARITAL_OPTIONS = ["Single", "Married", "Divorced", "Widowed"];
const BLOOD_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const RELATIONSHIP_OPTIONS = [
  "Father",
  "Mother",
  "Spouse",
  "Brother",
  "Sister",
  "Son",
  "Daughter",
  "Uncle",
  "Aunt",
  "Friend",
  "Other",
];
const NAME_RE = /^[A-Za-z][A-Za-z\s'.-]{1,79}$/;
const CNIC_RE = /^\d{5}-\d{7}-\d$/;
const PHONE_RE = /^(?:\+92|0)3\d{9}$/;
const ACCOUNT_RE = /^\d{8,20}$/;
const IBAN_RE = /^PK\d{2}[A-Z0-9]{20}$/i;
const NTN_RE = /^[A-Za-z0-9-]{5,20}$/;

/**
 * Required sections for candidate submit: Personal, Emergency, Bank,
 * Family, Documents (+ consent). Previous jobs optional (first-job ok).
 * If a previous job is added, its core fields must be complete.
 * Returns { ok: true } or { ok: false, message, missing: string[] }.
 */
export function validateJoiningSubmit(data) {
  const d = data || {};
  const missing = [];
  const p = d.personal || {};
  const personalInvalid =
    !filled(p.cnic) ||
    !CNIC_RE.test(String(p.cnic).trim()) ||
    !filled(p.dateOfBirth) ||
    !filled(p.gender) ||
    !GENDER_OPTIONS.includes(String(p.gender)) ||
    !filled(p.maritalStatus) ||
    !MARITAL_OPTIONS.includes(String(p.maritalStatus)) ||
    !filled(p.bloodGroup) ||
    !BLOOD_OPTIONS.includes(String(p.bloodGroup)) ||
    !filled(p.address) ||
    String(p.address).trim().length < 5 ||
    !filled(p.photoUrl);
  if (personalInvalid) missing.push("Personal");

  const e = d.emergencyContact || {};
  const emergencyInvalid =
    !filled(e.name) ||
    !NAME_RE.test(String(e.name).trim()) ||
    !filled(e.phone) ||
    !PHONE_RE.test(String(e.phone).replace(/\s/g, "")) ||
    !filled(e.relationship) ||
    !RELATIONSHIP_OPTIONS.includes(String(e.relationship)) ||
    !filled(e.address) ||
    String(e.address).trim().length < 5;
  if (emergencyInvalid) missing.push("Emergency contact");

  const b = d.bank || {};
  const bankInvalid =
    !filled(b.bankName) ||
    !filled(b.accountTitle) ||
    !NAME_RE.test(String(b.accountTitle).trim()) ||
    !filled(b.accountNumber) ||
    !ACCOUNT_RE.test(String(b.accountNumber).replace(/\s/g, "")) ||
    !filled(b.iban) ||
    !IBAN_RE.test(String(b.iban).replace(/\s/g, ""));
  if (bankInvalid) missing.push("Bank");
  if (filled(d.ntn) && !NTN_RE.test(String(d.ntn).trim())) {
    missing.push("Bank & tax (NTN format)");
  }

  const f = d.family || {};
  if (
    !filled(f.fatherName) ||
    !NAME_RE.test(String(f.fatherName).trim()) ||
    !filled(f.motherName) ||
    !NAME_RE.test(String(f.motherName).trim())
  ) {
    missing.push("Family");
  } else {
    const married = /married/i.test(String(p.maritalStatus || ""));
    if (
      married &&
      (!filled(f.spouse?.name) || !NAME_RE.test(String(f.spouse.name).trim()))
    ) {
      missing.push("Family (spouse)");
    }
    if (filled(f.spouse?.cnic) && !CNIC_RE.test(String(f.spouse.cnic).trim())) {
      missing.push("Family (spouse CNIC format)");
    }
  }

  const children = Array.isArray(f.children) ? f.children : [];
  const incompleteChild = children.some((c) => {
    const started = filled(c?.name) || filled(c?.dob) || filled(c?.gender);
    if (!started) return false;
    if (!filled(c?.name) || !NAME_RE.test(String(c.name).trim())) return true;
    if (filled(c?.gender) && !GENDER_OPTIONS.includes(String(c.gender)))
      return true;
    return false;
  });
  if (incompleteChild) missing.push("Family (children)");

  // Previous employment is optional (freshers). Incomplete added rows fail.
  const jobs = Array.isArray(d.previousJobs) ? d.previousJobs : [];
  const incompleteJob = jobs.some((j) => {
    const started =
      filled(j?.companyName) ||
      filled(j?.designation) ||
      filled(j?.startDate) ||
      filled(j?.endDate) ||
      filled(j?.lastSalary) ||
      filled(j?.reasonForLeaving);
    if (!started) return false;
    return !(
      filled(j?.companyName) &&
      filled(j?.designation) &&
      filled(j?.startDate) &&
      filled(j?.reasonForLeaving)
    );
  });
  if (incompleteJob) {
    missing.push("Previous jobs (complete each added job)");
  }

  const docs = Array.isArray(d.documents) ? d.documents : [];
  if (!docs.some((doc) => filled(doc?.fileUrl))) {
    missing.push("Documents");
  }

  if (!d.consent) {
    missing.push("Consent");
  }

  if (missing.length) {
    return {
      ok: false,
      missing,
      message: `Please complete required sections: ${missing.join(", ")}`,
    };
  }
  return { ok: true, missing: [], message: "" };
}

export { hashJoiningToken };
