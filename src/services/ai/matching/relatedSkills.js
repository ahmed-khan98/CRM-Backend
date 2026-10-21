import { createRequire } from "module";
import {
  canonicalSkill,
  skillInList,
  normalizeSkillToken,
} from "./aliases.js";

const require = createRequire(import.meta.url);
const RAW = require("../../../config/relatedSkills.json");

/** canonical job skill → [{ skill, credit }] (related skill also canonical) */
let RELATED_MAP = null;

function clampCredit(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function rebuildRelatedMap(raw = RAW) {
  RELATED_MAP = new Map();
  for (const [jobSkill, list] of Object.entries(raw || {})) {
    const key = canonicalSkill(jobSkill) || normalizeSkillToken(jobSkill);
    if (!key) continue;
    const entries = [];
    for (const item of list || []) {
      const skill =
        canonicalSkill(item?.skill) || normalizeSkillToken(item?.skill);
      const credit = clampCredit(item?.credit);
      if (!skill || credit <= 0) continue;
      entries.push({ skill, credit });
    }
    if (entries.length) RELATED_MAP.set(key, entries);
  }
}

rebuildRelatedMap();

/** Related entries for a job skill (canonical keys). */
export function relatedEntriesFor(jobSkill) {
  const key = canonicalSkill(jobSkill) || normalizeSkillToken(jobSkill);
  if (!key) return [];
  return RELATED_MAP.get(key) || [];
}

/**
 * Best related-skill hit in the CV skill list.
 * Returns { basedOn, credit } or null. Highest credit wins.
 */
export function bestRelatedMatch(jobSkill, candidateSkills = []) {
  const entries = relatedEntriesFor(jobSkill);
  let best = null;
  for (const entry of entries) {
    if (!skillInList(entry.skill, candidateSkills)) continue;
    if (!best || entry.credit > best.credit) {
      best = { basedOn: entry.skill, credit: entry.credit };
    }
  }
  return best;
}

/**
 * Match required skills against CV skills only.
 * Order: (a) direct/alias = 1.0 → matched; (b) related = partial → related;
 * (c) else missing.
 */
export function matchSkillsWithRelated(required = [], candidateSkills = []) {
  const matched = [];
  const related = [];
  const missing = [];
  const credits = [];

  for (const req of required) {
    if (skillInList(req, candidateSkills)) {
      matched.push(req);
      credits.push(1);
      continue;
    }
    const rel = bestRelatedMatch(req, candidateSkills);
    if (rel) {
      related.push({
        skill: req,
        basedOn: rel.basedOn,
        credit: rel.credit,
      });
      credits.push(rel.credit);
    } else {
      missing.push(req);
      credits.push(0);
    }
  }

  return { matched, related, missing, credits };
}

/** Credit-weighted skill % (0–100). */
export function skillMatchPercent(credits = []) {
  if (!credits.length) return 0;
  const sum = credits.reduce((s, c) => s + Number(c || 0), 0);
  return Math.round((sum / credits.length) * 100);
}

/**
 * Missing share for graduated must-have cap: Σ(1 − credit) / n.
 * Related at 0.5 credit → 0.5 missing weight (half-missing).
 */
export function missingShareFromCredits(credits = []) {
  if (!credits.length) return 0;
  const miss = credits.reduce((s, c) => s + (1 - Number(c || 0)), 0);
  return miss / credits.length;
}

export function _reloadRelatedForTests(raw = RAW) {
  rebuildRelatedMap(raw);
}

export { RAW as DEFAULT_RELATED_SKILLS };
export {
  DEFAULT_MUST_HAVE_CAP_TIERS,
  DEFAULT_MUST_HAVE_CAP,
  resolveMustHaveCap,
  normalizeMustHaveCapTiers,
  validateMustHaveCapTiers,
  tiersFromSettings,
} from "./mustHaveCapTiers.js";
