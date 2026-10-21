import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreApplicationMatch,
  buildScoreBreakdownDetail,
  DEFAULT_MATCH_WEIGHTS,
  DEFAULT_MUST_HAVE_CAP,
  MATCH_CRITERIA_KEYS,
} from "../src/services/ai/matching/score.js";

test("scoreBreakdown includes all criteria; unscored when redistributed", () => {
  const result = scoreApplicationMatch({
    job: {
      title: "",
      responsibilities: "",
      skills: ["React"],
      niceToHaveSkills: [],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
    },
    candidate: { experienceYears: 3, skills: ["React"] },
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: 3,
      jobTitles: [],
      education: [],
      flags: [],
      textLength: 500,
    },
    cvText: "x".repeat(500),
    usedAiParse: true,
  });
  assert.equal(result.matchStatus, "done");
  assert.ok(result.scoreBreakdown);
  assert.ok(result.scoreBreakdown.criteria.mustHaveSkills.scored);
  assert.equal(result.scoreBreakdown.criteria.experience.scored, false);
  assert.equal(result.scoreBreakdown.criteria.education.scored, false);
  assert.equal(result.scoreBreakdown.criteria.experience.score, null);
  assert.equal(result.scoreBreakdown.criteria.mustHaveSkills.score, 100);
});

test("must-have cap flag on scoreBreakdown", () => {
  const result = scoreApplicationMatch({
    job: {
      title: "Dev",
      responsibilities: "Build apps",
      skills: ["React", "Node.js"],
      niceToHaveSkills: [],
      experienceMin: 2,
      experienceMax: 5,
      education: "Bachelor",
    },
    candidate: { experienceYears: 4 },
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: 4,
      jobTitles: ["Developer"],
      education: [{ degree: "BS" }],
      flags: [],
      textLength: 600,
    },
    cvText: "x".repeat(600),
    mustHaveCap: 60,
    usedAiParse: true,
  });
  // 1 of 2 hard-missing → missingShare 0.5 → hard mustHaveCap tier
  assert.equal(result.scoreBreakdown.mustHaveCapApplied, true);
  assert.equal(result.scoreBreakdown.mustHaveCap, 60);
  assert.ok(result.matchPercent <= 60);
  assert.ok(result.missingSkills.includes("Node.js"));
  assert.equal(result.relatedSkills.length, 0);
});

test("form vs CV years stored as informational note (no score effect)", () => {
  const result = scoreApplicationMatch({
    job: {
      title: "Dev",
      responsibilities: "Dev",
      skills: ["React"],
      experienceMin: 1,
      experienceMax: 10,
    },
    candidate: { experienceYears: 2, skills: [] },
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: 5,
      jobTitles: ["Dev"],
      education: [],
      flags: [],
      textLength: 400,
    },
    cvText: "x".repeat(400),
    usedAiParse: true,
  });
  assert.ok(!result.flags.includes("mismatch"));
  assert.equal(result.scoreBreakdown.cvYears, 5);
  assert.equal(result.scoreBreakdown.formYears, 2);
  assert.match(
    result.scoreBreakdown.formExperienceNote,
    /Form says 2 years, CV says 5 years/
  );
});

test("buildScoreBreakdownDetail marks inactive criteria not scored", () => {
  const detail = buildScoreBreakdownDetail({
    breakdown: { mustHaveSkills: 80 },
    active: { mustHaveSkills: 100 },
    baseWeights: DEFAULT_MATCH_WEIGHTS,
    mustHaveCap: DEFAULT_MUST_HAVE_CAP,
    mustHaveCapApplied: false,
    signals: { years: 3, formYears: 3 },
  });
  for (const key of MATCH_CRITERIA_KEYS) {
    assert.ok(detail.criteria[key]);
  }
  assert.equal(detail.criteria.mustHaveSkills.scored, true);
  assert.equal(detail.criteria.education.scored, false);
  assert.equal(detail.criteria.education.score, null);
});

test("weights validation helper — total must be 100", () => {
  const WEIGHT_KEYS = [
    "mustHaveSkills",
    "experience",
    "roleRelevance",
    "education",
    "niceToHaveSkills",
  ];
  function validate(raw) {
    let total = 0;
    for (const key of WEIGHT_KEYS) {
      const n = Number(raw[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(key);
      total += Math.round(n);
    }
    if (total !== 100) throw new Error(`total ${total}`);
    return true;
  }
  assert.equal(validate({ ...DEFAULT_MATCH_WEIGHTS }), true);
  assert.throws(() =>
    validate({
      mustHaveSkills: 50,
      experience: 25,
      roleRelevance: 15,
      education: 10,
      niceToHaveSkills: 10,
    })
  );
});
