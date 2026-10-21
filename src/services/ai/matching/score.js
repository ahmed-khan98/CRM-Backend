import { normalizeSkillToken } from "./aliases.js";
import { educationScore, candidateEducationLevel } from "./education.js";
import {
  matchSkillsWithRelated,
  skillMatchPercent,
  missingShareFromCredits,
} from "./relatedSkills.js";
import {
  DEFAULT_MUST_HAVE_CAP,
  DEFAULT_MUST_HAVE_CAP_TIERS,
  normalizeMustHaveCapTiers,
  resolveMustHaveCap,
} from "./mustHaveCapTiers.js";

export const DEFAULT_MATCH_WEIGHTS = {
  mustHaveSkills: 40,
  experience: 25,
  roleRelevance: 15,
  education: 10,
  niceToHaveSkills: 10,
};

export {
  DEFAULT_MUST_HAVE_CAP,
  DEFAULT_MUST_HAVE_CAP_TIERS,
};

const SENIORITY_RE =
  /\b(principal|senior|sr\.?|lead|junior|jr\.?|staff|chief|head|associate)\b/gi;

/** Titles that collapse to one canonical role family for matching. */
const ROLE_FAMILY_PATTERNS = [
  {
    canon: "full stack engineer",
    patterns: [
      /\bmern\b/,
      /\bmean\b/,
      /\bfull\s*stack\b/,
      /\bfullstack\b/,
      /\bsoftware\s+engineer\b/,
      /\bweb\s+developer\b/,
      /\bsoftware\s+developer\b/,
    ],
  },
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/** Deterministic Jaccard similarity 0–100. */
export function tokenSimilarity(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  if (!union) return 0;
  return Math.round((inter / union) * 100);
}

/**
 * Drop seniority words; map MERN/MEAN/full-stack/software engineer/web developer
 * to one family for deterministic role matching.
 */
export function normalizeRoleTitle(title) {
  let t = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(SENIORITY_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  for (const fam of ROLE_FAMILY_PATTERNS) {
    if (fam.patterns.some((re) => re.test(t))) return fam.canon;
  }
  return t;
}

export function roleRelevanceScore(job, jobTitles = []) {
  const titles = (jobTitles || []).map(normalizeRoleTitle).filter(Boolean);
  if (!titles.length) return null;
  const jobTitle = normalizeRoleTitle(job?.title);
  const resp = String(job?.responsibilities || "");
  const jobBlob = [jobTitle, resp].filter(Boolean).join(" ");
  const candBlob = titles.join(" ");
  const familyHit = Boolean(jobTitle && titles.some((t) => t === jobTitle));
  const jaccard = tokenSimilarity(jobBlob, candBlob);
  if (familyHit) return Math.max(jaccard, 70);
  return jaccard;
}

export function experienceScore(years, min, max) {
  if (years == null || years === "") return null;
  const exp = Number(years);
  const lo = Number(min) || 0;
  const hi = Number(max) || 0;
  if (!Number.isFinite(exp) || exp < 0) return null;
  if (lo <= 0 && hi <= 0) return null;
  if (exp >= lo && (hi === 0 || exp <= hi)) return 100;
  if (exp < lo) {
    const gap = lo - exp;
    return Math.max(0, 100 - gap * 20);
  }
  if (hi > 0 && exp > hi) {
    const gap = exp - hi;
    return Math.max(40, 100 - gap * 10);
  }
  return 70;
}

function hasJobExperienceRange(job) {
  return (Number(job?.experienceMin) || 0) > 0 || (Number(job?.experienceMax) || 0) > 0;
}

function extractYearsFromCvText(cvText) {
  if (!cvText) return null;
  const m = String(cvText).match(
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp\.?)/i
  );
  return m ? Number(m[1]) : null;
}

/**
 * CV-only signals. Form fields are never used for scoring.
 * formYears is kept only for an informational HR note.
 */
export function resolveCandidateSignals(parsedProfile, candidate, cvText = "") {
  const profile = parsedProfile || {};
  const skills = [
    ...new Set(
      [...(profile.skills || [])]
        .map((s) => String(s).trim())
        .filter(Boolean)
    ),
  ];

  const flags = [...(profile.flags || [])];
  let years = profile.totalExperienceYears;
  if (years == null || !Number.isFinite(Number(years))) {
    years = extractYearsFromCvText(cvText);
  } else {
    years = Number(years);
  }

  const formYearsRaw = Number(candidate?.experienceYears);
  const formYears = Number.isFinite(formYearsRaw) ? formYearsRaw : null;

  let formExperienceNote = "";
  if (
    formYears != null &&
    years != null &&
    Number.isFinite(years) &&
    Math.abs(years - formYears) > 1
  ) {
    formExperienceNote = `Form says ${formYears} years, CV says ${years} years`;
  }

  const jobTitles = (profile.jobTitles || []).filter(Boolean);
  const education = profile.education || [];
  const certifications = (profile.certifications || []).filter(Boolean);

  return {
    skills,
    years: years == null || !Number.isFinite(years) ? null : years,
    formYears,
    formExperienceNote,
    jobTitles,
    education,
    certifications,
    flags,
    summary: profile.summary || "",
    textLength: profile.textLength || String(cvText || "").length,
  };
}

/**
 * Active criteria = job asks for it AND CV provides a value for it.
 * Missing CV values redistribute weight (never fall back to form).
 */
export function activeWeights(job, baseWeights, signals = {}) {
  const w = { ...DEFAULT_MATCH_WEIGHTS, ...(baseWeights || {}) };
  const active = {};
  if ((job?.skills || []).filter(Boolean).length) {
    active.mustHaveSkills = w.mustHaveSkills;
  }
  if (
    hasJobExperienceRange(job) &&
    signals.years != null &&
    Number.isFinite(Number(signals.years))
  ) {
    active.experience = w.experience;
  }
  if (
    (String(job?.title || "").trim() ||
      String(job?.responsibilities || "").trim()) &&
    (signals.jobTitles || []).length
  ) {
    active.roleRelevance = w.roleRelevance;
  }
  if (
    String(job?.education || "").trim() &&
    candidateEducationLevel(signals.education) > 0
  ) {
    active.education = w.education;
  }
  if ((job?.niceToHaveSkills || []).filter(Boolean).length) {
    active.niceToHaveSkills = w.niceToHaveSkills;
  }
  const total = Object.values(active).reduce((s, n) => s + n, 0);
  if (!total) return { active: {}, total: 0 };
  const scaled = {};
  for (const [k, v] of Object.entries(active)) {
    scaled[k] = (v / total) * 100;
  }
  return { active: scaled, total: 100 };
}

export const MATCH_CRITERIA_KEYS = [
  "mustHaveSkills",
  "experience",
  "roleRelevance",
  "education",
  "niceToHaveSkills",
];

/**
 * UI-ready breakdown (does not change the score). Marks criteria as
 * not scored when their weight was redistributed away.
 */
export function buildScoreBreakdownDetail({
  breakdown = {},
  active = {},
  baseWeights = DEFAULT_MATCH_WEIGHTS,
  mustHaveCap = DEFAULT_MUST_HAVE_CAP,
  mustHaveCapApplied = false,
  mustHaveCapTiers = DEFAULT_MUST_HAVE_CAP_TIERS,
  missingShare = 0,
  signals = {},
}) {
  const base = { ...DEFAULT_MATCH_WEIGHTS, ...(baseWeights || {}) };
  const criteria = {};
  for (const key of MATCH_CRITERIA_KEYS) {
    const scored = active[key] != null;
    criteria[key] = {
      score: scored ? breakdown[key] ?? null : null,
      weight: scored
        ? Math.round((Number(active[key]) + Number.EPSILON) * 10) / 10
        : 0,
      configuredWeight: Number(base[key]) || 0,
      scored,
    };
  }
  return {
    criteria,
    mustHaveCapApplied: Boolean(mustHaveCapApplied),
    mustHaveCap: Number(mustHaveCap),
    mustHaveCapTiers: normalizeMustHaveCapTiers(mustHaveCapTiers, mustHaveCap),
    missingShare: Math.round((Number(missingShare) + Number.EPSILON) * 1000) / 1000,
    cvYears: signals.years ?? null,
    formYears: signals.formYears ?? null,
    formExperienceNote: signals.formExperienceNote || "",
  };
}

function confidenceFrom({ scorableCount, textLength, usedAiParse, flags }) {
  if (!scorableCount) return "low";
  if (!usedAiParse) return "low";
  if (textLength < 200) return "low";
  if (
    scorableCount >= 3 &&
    textLength >= 400 &&
    !(flags || []).includes("suspicious_cv")
  ) {
    return "high";
  }
  return "medium";
}

/**
 * Hybrid match score from CV only. Pure function — no LLM.
 */
export function scoreApplicationMatch({
  job,
  candidate,
  parsedProfile,
  cvText = "",
  weights = DEFAULT_MATCH_WEIGHTS,
  mustHaveCap = DEFAULT_MUST_HAVE_CAP,
  mustHaveCapTiers = null,
  usedAiParse = true,
  note = "",
}) {
  const baseWeights = { ...DEFAULT_MATCH_WEIGHTS, ...(weights || {}) };
  const tiers = normalizeMustHaveCapTiers(
    mustHaveCapTiers != null ? mustHaveCapTiers : mustHaveCap,
    mustHaveCap
  );
  const signals = resolveCandidateSignals(parsedProfile, candidate, cvText);
  const { active } = activeWeights(job, baseWeights, signals);
  const keys = Object.keys(active);

  if (!keys.length) {
    return {
      matchPercent: null,
      matchStatus: "not_analyzed",
      matchStatusReason: "insufficient_job_criteria",
      confidence: "low",
      matchedSkills: [],
      relatedSkills: [],
      missingSkills: [],
      flags: [...signals.flags],
      note: note || "No scorable job criteria",
      formExperienceNote: signals.formExperienceNote || "",
      breakdown: {},
      scoreBreakdown: buildScoreBreakdownDetail({
        breakdown: {},
        active: {},
        baseWeights,
        mustHaveCap: tiers.c3,
        mustHaveCapTiers: tiers,
        mustHaveCapApplied: false,
        missingShare: 0,
        signals,
      }),
    };
  }

  const flags = [...signals.flags];
  if (
    (parsedProfile?.flags || []).includes("suspicious_cv") &&
    !flags.includes("suspicious_cv")
  ) {
    flags.push("suspicious_cv");
  }

  const mustHave = (job?.skills || []).filter(Boolean);
  const nice = (job?.niceToHaveSkills || []).filter(Boolean);
  // CV skills only — never form/candidate.skills
  const must = matchSkillsWithRelated(mustHave, signals.skills);
  const niceMatch = matchSkillsWithRelated(nice, signals.skills);

  const breakdown = {};
  let weighted = 0;

  if (active.mustHaveSkills != null) {
    const pct = skillMatchPercent(must.credits);
    breakdown.mustHaveSkills = pct;
    weighted += (pct * active.mustHaveSkills) / 100;
  }

  if (active.niceToHaveSkills != null) {
    const pct = skillMatchPercent(niceMatch.credits);
    breakdown.niceToHaveSkills = pct;
    weighted += (pct * active.niceToHaveSkills) / 100;
  }

  if (active.experience != null) {
    const pct = experienceScore(
      signals.years,
      job.experienceMin,
      job.experienceMax
    );
    breakdown.experience = pct == null ? 0 : pct;
    weighted += ((pct == null ? 0 : pct) * active.experience) / 100;
  }

  if (active.roleRelevance != null) {
    const pct = roleRelevanceScore(job, signals.jobTitles);
    breakdown.roleRelevance = pct == null ? 0 : pct;
    weighted += ((pct == null ? 0 : pct) * active.roleRelevance) / 100;
  }

  if (active.education != null) {
    const pct = educationScore(job.education, signals.education);
    breakdown.education = pct == null ? 0 : pct;
    weighted += ((pct == null ? 0 : pct) * active.education) / 100;
  }

  let matchPercent = Math.round(Math.min(100, Math.max(0, weighted)));

  const missingShare = mustHave.length
    ? missingShareFromCredits(must.credits)
    : 0;
  const tierCap = mustHave.length
    ? resolveMustHaveCap(missingShare, tiers)
    : null;
  const mustHaveCapApplied = tierCap != null;
  let capVal = tiers.c3;
  if (mustHaveCapApplied) {
    capVal = tierCap;
    matchPercent = Math.min(matchPercent, capVal);
  }

  const confidence = confidenceFrom({
    scorableCount: keys.length,
    textLength: signals.textLength || String(cvText || "").length,
    usedAiParse,
    flags,
  });

  const scoreBreakdown = buildScoreBreakdownDetail({
    breakdown,
    active,
    baseWeights,
    mustHaveCap: mustHaveCapApplied ? capVal : tiers.c3,
    mustHaveCapTiers: tiers,
    mustHaveCapApplied,
    missingShare,
    signals,
  });

  const infoNote = signals.formExperienceNote || "";
  const combinedNote = [note, infoNote].filter(Boolean).join(" · ");

  const relatedSkills = [...must.related, ...niceMatch.related];

  return {
    matchPercent,
    matchStatus: "done",
    matchStatusReason: "",
    confidence,
    matchedSkills: [...must.matched, ...niceMatch.matched],
    relatedSkills,
    missingSkills: must.missing,
    flags,
    note: combinedNote,
    formExperienceNote: infoNote,
    breakdown,
    activeWeights: active,
    scoreBreakdown,
  };
}

export { normalizeSkillToken };
