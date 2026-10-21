/**
 * Graduated must-have score caps by missing-share (%).
 * Defaults match existing scorer behavior — do not change lightly.
 *
 *   share < b1          → no cap
 *   b1 ≤ share < b2     → c1
 *   b2 ≤ share < b3     → c2
 *   share ≥ b3          → c3
 */
export const DEFAULT_MUST_HAVE_CAP_TIERS = {
  b1: 10,
  b2: 25,
  b3: 50,
  c1: 85,
  c2: 75,
  c3: 60,
};

/** Hard floor default (= c3). Kept for legacy callers. */
export const DEFAULT_MUST_HAVE_CAP = DEFAULT_MUST_HAVE_CAP_TIERS.c3;

export const RELATED_SKILLS_CONFIG_PATH = "src/config/relatedSkills.json";

function roundPct(n) {
  return Math.round(Number(n));
}

/**
 * Normalize settings / legacy number into a full tiers object.
 * Old single `mustHaveCap` maps to c3; other fields use defaults.
 */
export function normalizeMustHaveCapTiers(input, legacyCap = null) {
  const base = { ...DEFAULT_MUST_HAVE_CAP_TIERS };

  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    const out = {
      b1: input.b1 != null ? roundPct(input.b1) : base.b1,
      b2: input.b2 != null ? roundPct(input.b2) : base.b2,
      b3: input.b3 != null ? roundPct(input.b3) : base.b3,
      c1: input.c1 != null ? roundPct(input.c1) : base.c1,
      c2: input.c2 != null ? roundPct(input.c2) : base.c2,
      c3:
        input.c3 != null
          ? roundPct(input.c3)
          : legacyCap != null && Number.isFinite(Number(legacyCap))
            ? roundPct(legacyCap)
            : base.c3,
    };
    return out;
  }

  if (input != null && input !== "" && Number.isFinite(Number(input))) {
    return { ...base, c3: roundPct(input) };
  }

  if (legacyCap != null && legacyCap !== "" && Number.isFinite(Number(legacyCap))) {
    return { ...base, c3: roundPct(legacyCap) };
  }

  return base;
}

/**
 * Resolve tiers from a settings document (new field or legacy mustHaveCap).
 */
export function tiersFromSettings(doc = {}) {
  if (doc?.mustHaveCapTiers && typeof doc.mustHaveCapTiers === "object") {
    return normalizeMustHaveCapTiers(doc.mustHaveCapTiers, doc.mustHaveCap);
  }
  return normalizeMustHaveCapTiers(null, doc?.mustHaveCap);
}

/**
 * Validate editable tiers. Boundaries: 0 < b1 < b2 < b3 ≤ 100.
 * Caps: 0–100 and strictly decreasing c1 > c2 > c3.
 * Returns { ok: true, tiers } or { ok: false, message }.
 */
export function validateMustHaveCapTiers(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "mustHaveCapTiers is required" };
  }

  const keys = ["b1", "b2", "b3", "c1", "c2", "c3"];
  const vals = {};
  for (const key of keys) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) {
      return { ok: false, message: `mustHaveCapTiers.${key} must be a number` };
    }
    vals[key] = roundPct(n);
  }

  for (const key of keys) {
    if (vals[key] < 0 || vals[key] > 100) {
      return {
        ok: false,
        message: `mustHaveCapTiers.${key} must be between 0 and 100`,
      };
    }
  }

  if (!(vals.b1 > 0 && vals.b1 < vals.b2 && vals.b2 < vals.b3 && vals.b3 <= 100)) {
    return {
      ok: false,
      message:
        "Share boundaries must be increasing: 0 < b1 < b2 < b3 ≤ 100 (e.g. 10, 25, 50)",
    };
  }

  if (!(vals.c1 > vals.c2 && vals.c2 > vals.c3)) {
    return {
      ok: false,
      message:
        "Cap values must be decreasing: c1 > c2 > c3 (e.g. 85, 75, 60)",
    };
  }

  return { ok: true, tiers: vals };
}

/**
 * Cap for a missingShare in 0–1. Returns null when no cap applies.
 * Second arg may be a tiers object or a legacy hard-cap number.
 */
export function resolveMustHaveCap(
  missingShare,
  tiersOrCap = DEFAULT_MUST_HAVE_CAP_TIERS
) {
  const tiers = normalizeMustHaveCapTiers(tiersOrCap);
  const sharePct = (Number(missingShare) || 0) * 100;
  if (sharePct <= 0) return null;
  if (sharePct < tiers.b1) return null;
  if (sharePct < tiers.b2) return tiers.c1;
  if (sharePct < tiers.b3) return tiers.c2;
  return tiers.c3;
}
