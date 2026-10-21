import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MUST_HAVE_CAP_TIERS,
  normalizeMustHaveCapTiers,
  validateMustHaveCapTiers,
  resolveMustHaveCap,
  tiersFromSettings,
} from "../src/services/ai/matching/mustHaveCapTiers.js";
import { scoreApplicationMatch } from "../src/services/ai/matching/score.js";

test("validateMustHaveCapTiers: accepts defaults", () => {
  const r = validateMustHaveCapTiers(DEFAULT_MUST_HAVE_CAP_TIERS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.tiers, DEFAULT_MUST_HAVE_CAP_TIERS);
});

test("validateMustHaveCapTiers: rejects non-increasing boundaries", () => {
  const r = validateMustHaveCapTiers({
    ...DEFAULT_MUST_HAVE_CAP_TIERS,
    b1: 30,
    b2: 25,
    b3: 50,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /increasing/i);
});

test("validateMustHaveCapTiers: rejects non-decreasing caps", () => {
  const r = validateMustHaveCapTiers({
    ...DEFAULT_MUST_HAVE_CAP_TIERS,
    c1: 70,
    c2: 80,
    c3: 60,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /decreasing/i);
});

test("validateMustHaveCapTiers: rejects out-of-range", () => {
  const r = validateMustHaveCapTiers({
    ...DEFAULT_MUST_HAVE_CAP_TIERS,
    c1: 120,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /0 and 100/);
});

test("backward compat: legacy mustHaveCap maps to c3", () => {
  const fromNumber = normalizeMustHaveCapTiers(55);
  assert.equal(fromNumber.c3, 55);
  assert.equal(fromNumber.b1, 10);
  assert.equal(fromNumber.c1, 85);

  const fromDoc = tiersFromSettings({ mustHaveCap: 55 });
  assert.equal(fromDoc.c3, 55);
  assert.equal(fromDoc.b2, 25);

  const fromPartial = tiersFromSettings({
    mustHaveCap: 40,
    mustHaveCapTiers: { b1: 10, b2: 25, b3: 50, c1: 85, c2: 75 },
  });
  assert.equal(fromPartial.c3, 40);
});

test("resolveMustHaveCap uses default tiers (unchanged math)", () => {
  assert.equal(resolveMustHaveCap(0), null);
  assert.equal(resolveMustHaveCap(0.05), null); // below 10%
  assert.equal(resolveMustHaveCap(0.1), 85);
  assert.equal(resolveMustHaveCap(0.24), 85);
  assert.equal(resolveMustHaveCap(0.25), 75);
  assert.equal(resolveMustHaveCap(0.49), 75);
  assert.equal(resolveMustHaveCap(0.5), 60);
  assert.equal(resolveMustHaveCap(0.9, 50), 50); // legacy number → c3
});

test("resolveMustHaveCap reads custom saved tiers", () => {
  const tiers = { b1: 5, b2: 20, b3: 40, c1: 90, c2: 80, c3: 55 };
  assert.equal(resolveMustHaveCap(0.04, tiers), null);
  assert.equal(resolveMustHaveCap(0.1, tiers), 90);
  assert.equal(resolveMustHaveCap(0.3, tiers), 80);
  assert.equal(resolveMustHaveCap(0.5, tiers), 55);
});

test("scorer applies saved mustHaveCapTiers", () => {
  const job = {
    title: "Dev",
    skills: ["Node.js", "React", "AWS", "Docker"],
    experienceMin: 0,
    experienceMax: 0,
    education: "",
    responsibilities: "",
  };
  // 2 of 4 missing → share 0.5 → default c3=60; custom c3=50
  const custom = scoreApplicationMatch({
    job,
    candidate: {},
    parsedProfile: {
      skills: ["Node.js", "React"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 400,
      flags: [],
    },
    mustHaveCapTiers: { b1: 10, b2: 25, b3: 50, c1: 85, c2: 75, c3: 50 },
    usedAiParse: true,
  });
  assert.equal(custom.scoreBreakdown.mustHaveCapApplied, true);
  assert.equal(custom.scoreBreakdown.mustHaveCap, 50);
  assert.equal(custom.scoreBreakdown.mustHaveCapTiers.c3, 50);
  assert.ok(custom.matchPercent <= 50);

  // 1 of 4 missing → share 0.25 → c2
  const mid = scoreApplicationMatch({
    job,
    candidate: {},
    parsedProfile: {
      skills: ["Node.js", "React", "AWS"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 400,
      flags: [],
    },
    mustHaveCapTiers: { b1: 10, b2: 25, b3: 50, c1: 85, c2: 70, c3: 50 },
    usedAiParse: true,
  });
  assert.equal(mid.scoreBreakdown.mustHaveCap, 70);
  assert.ok(mid.matchPercent <= 70);
});

test("audit meta shape includes old and new tiers", () => {
  // Mirrors settings.controller before/after payload for AI matching saves
  const before = {
    mustHaveCap: 60,
    mustHaveCapTiers: { ...DEFAULT_MUST_HAVE_CAP_TIERS },
  };
  const afterTiers = { b1: 10, b2: 25, b3: 50, c1: 90, c2: 80, c3: 55 };
  const after = {
    mustHaveCap: afterTiers.c3,
    mustHaveCapTiers: afterTiers,
  };
  const meta = { before, after };
  assert.equal(meta.before.mustHaveCapTiers.c3, 60);
  assert.deepEqual(meta.after.mustHaveCapTiers, afterTiers);
  assert.equal(meta.after.mustHaveCap, 55);
  const checked = validateMustHaveCapTiers(meta.after.mustHaveCapTiers);
  assert.equal(checked.ok, true);
});
