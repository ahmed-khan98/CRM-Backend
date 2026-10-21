import { aliasSetForSkill, normalizeSkillToken } from "./aliases.js";
import {
  scoreApplicationMatch,
  DEFAULT_MATCH_WEIGHTS,
  DEFAULT_MUST_HAVE_CAP,
} from "./score.js";

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract skills from CV text using alias-aware presence (never form skills).
 */
export function extractSkillsFromText(text, skillList = []) {
  const raw = String(text || "");
  const hayNorm = ` ${normalizeSkillToken(raw)} `;
  const found = [];
  for (const skill of skillList) {
    const s = String(skill || "").trim();
    if (!s) continue;
    let hit = false;
    for (const alias of aliasSetForSkill(s)) {
      if (!alias) continue;
      const re = new RegExp(
        `(?:^|[^a-z0-9])${escapeRe(alias)}(?:[^a-z0-9]|$)`,
        "i"
      );
      if (re.test(raw) || hayNorm.includes(` ${alias} `)) {
        hit = true;
        break;
      }
    }
    if (hit) found.push(s);
  }
  return found;
}

export function extractYearsFromText(text) {
  const m = String(text || "").match(
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp\.?)/i
  );
  return m ? Number(m[1]) : null;
}

/** Light job-title hints from CV text for rule-based path (CV only). */
export function extractJobTitlesFromText(text) {
  const lines = String(text || "").split(/\n+/);
  const titles = [];
  const titleRe =
    /\b(full\s*stack|mern|mean|software\s+engineer|web\s+developer|frontend|backend|full\s*stack\s+developer)\b/i;
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 4 || t.length > 80) continue;
    if (titleRe.test(t)) titles.push(t.slice(0, 80));
  }
  return [...new Set(titles)].slice(0, 5);
}

/**
 * Rule-based scoring when AI parse is unavailable — CV text only.
 */
export function scoreWithRuleBasedFallback({
  job,
  candidate,
  cvText = "",
  weights = DEFAULT_MATCH_WEIGHTS,
  mustHaveCap = DEFAULT_MUST_HAVE_CAP,
  mustHaveCapTiers = null,
}) {
  const text = String(cvText || "").trim();
  if (!text) {
    return {
      matchPercent: null,
      matchStatus: "not_analyzed",
      matchStatusReason: "no_cv_text",
      confidence: "low",
      matchedSkills: [],
      relatedSkills: [],
      missingSkills: [],
      flags: [],
      note: "Rule-based (AI unavailable)",
      formExperienceNote: "",
      parsedProfile: null,
      scoreBreakdown: null,
    };
  }

  const wanted = [
    ...(job?.skills || []),
    ...(job?.niceToHaveSkills || []),
  ];
  const fromText = extractSkillsFromText(text, wanted);
  const years = extractYearsFromText(text);
  const jobTitles = extractJobTitlesFromText(text);
  const parsedProfile = {
    skills: fromText,
    totalExperienceYears: years,
    jobTitles,
    companies: [],
    education: [],
    certifications: [],
    languages: [],
    summary: "",
    flags: [],
    textLength: text.length,
  };

  const scored = scoreApplicationMatch({
    job,
    candidate,
    parsedProfile,
    cvText: text,
    weights,
    mustHaveCap,
    mustHaveCapTiers,
    usedAiParse: false,
    note: "Rule-based (AI unavailable)",
  });

  return { ...scored, parsedProfile, confidence: "low" };
}

/**
 * Legacy helper — never scores from form fields.
 * Without CV text there is nothing to score.
 */
export function calculateMatchPercent(job, candidate) {
  void job;
  void candidate;
  return {
    matchPercent: null,
    matchStatus: "not_analyzed",
    matchStatusReason: "no_cv_text",
    confidence: "low",
    note: "Rule-based (AI unavailable)",
    matchedSkills: [],
    relatedSkills: [],
    missingSkills: [],
  };
}
