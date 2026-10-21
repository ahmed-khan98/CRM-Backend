import { createRequire } from "module";

const require = createRequire(import.meta.url);
const RAW = require("../../../config/skillAliases.json");

/** canonical -> Set of normalized aliases */
let CANONICAL_TO_ALIASES = null;
/** normalized alias -> canonical */
let ALIAS_TO_CANONICAL = null;

const KEEP_PLURAL = new Set([
  "js",
  "ts",
  "css",
  "aws",
  "ios",
  "api",
  "sql",
  "php",
  "css3",
  "html5",
  "ci",
  "cd",
]);

function stripTrailingPlural(word) {
  const w = String(word || "");
  if (!w || KEEP_PLURAL.has(w)) return w;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * Normalize for matching: lowercase, strip punctuation, collapse spaces,
 * drop trailing "authentication", strip simple plurals (apis → api).
 */
export function normalizeSkillToken(value) {
  let s = String(value || "")
    .toLowerCase()
    .replace(/[#]/g, (ch) => (ch === "#" ? "#" : ch === "+" ? "+" : " "))
    .replace(/[^a-z0-9.#+/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  s = s.replace(/\s+authentication$/i, "").trim();
  s = s
    .split(" ")
    .map((w) => stripTrailingPlural(w))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function rebuildMaps(raw = RAW) {
  CANONICAL_TO_ALIASES = new Map();
  ALIAS_TO_CANONICAL = new Map();
  for (const [canonical, list] of Object.entries(raw || {})) {
    const canon = normalizeSkillToken(canonical);
    const set = new Set([canon]);
    for (const item of list || []) {
      const n = normalizeSkillToken(item);
      if (!n) continue;
      set.add(n);
      ALIAS_TO_CANONICAL.set(n, canon);
    }
    ALIAS_TO_CANONICAL.set(canon, canon);
    CANONICAL_TO_ALIASES.set(canon, set);
  }
}

rebuildMaps();

export function canonicalSkill(value) {
  const n = normalizeSkillToken(value);
  if (!n) return "";
  return ALIAS_TO_CANONICAL.get(n) || n;
}

/** All normalized surface forms for a skill (canonical + aliases). */
export function aliasSetForSkill(skill) {
  const canon = canonicalSkill(skill);
  if (!canon) return new Set();
  const fromMap = CANONICAL_TO_ALIASES.get(canon);
  if (fromMap) return new Set(fromMap);
  return new Set([canon]);
}

/**
 * Exact / alias match only — no loose substring (e.g. "java" must not match "javascript").
 */
export function skillsMatch(a, b) {
  const ca = canonicalSkill(a);
  const cb = canonicalSkill(b);
  if (!ca || !cb) return false;
  return ca === cb;
}

export function skillInList(skill, list = []) {
  return (list || []).some((item) => skillsMatch(skill, item));
}

export function matchSkillsAgainst(required = [], candidateSkills = []) {
  const matched = [];
  const missing = [];
  for (const req of required) {
    if (skillInList(req, candidateSkills)) matched.push(req);
    else missing.push(req);
  }
  return { matched, missing };
}

/** Test helper to reload alias map from an object (or defaults). */
export function _reloadAliasesForTests(raw = RAW) {
  rebuildMaps(raw);
}

export { RAW as DEFAULT_SKILL_ALIASES };
