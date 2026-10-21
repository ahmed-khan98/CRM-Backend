import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreApplicationMatch,
  tokenSimilarity,
  experienceScore,
  normalizeRoleTitle,
  roleRelevanceScore,
  DEFAULT_MUST_HAVE_CAP,
} from "../src/services/ai/matching/score.js";
import {
  skillsMatch,
  matchSkillsAgainst,
  normalizeSkillToken,
  _reloadAliasesForTests,
} from "../src/services/ai/matching/aliases.js";
import {
  educationLevelFromText,
  educationScore,
} from "../src/services/ai/matching/education.js";
import { filterEvidenceSnippets } from "../src/services/ai/matching/explain.js";
import {
  scoreWithRuleBasedFallback,
  calculateMatchPercent,
} from "../src/services/ai/matching/fallback.js";

test("alias matching: Node = Node.js = NodeJS; no loose substring", () => {
  assert.equal(skillsMatch("Node", "Node.js"), true);
  assert.equal(skillsMatch("NodeJS", "node.js"), true);
  assert.equal(skillsMatch("React", "ReactJS"), true);
  assert.equal(skillsMatch("JS", "JavaScript"), true);
  assert.equal(skillsMatch("java", "javascript"), false);
  const { matched, missing } = matchSkillsAgainst(
    ["Node.js", "Java"],
    ["NodeJS", "JavaScript"]
  );
  assert.deepEqual(matched, ["Node.js"]);
  assert.deepEqual(missing, ["Java"]);
});

test("alias: REST / RESTful APIs, JWT Authentication, TypeScript/TS", () => {
  assert.equal(skillsMatch("REST API", "RESTful APIs"), true);
  assert.equal(skillsMatch("restful api", "REST"), true);
  assert.equal(skillsMatch("JWT", "JWT Authentication"), true);
  assert.equal(skillsMatch("JSON Web Token", "jwt"), true);
  assert.equal(skillsMatch("TypeScript", "TS"), true);
  assert.equal(
    normalizeSkillToken("JWT Authentication"),
    normalizeSkillToken("jwt")
  );
});

test("role title normalization groups MERN / full stack / seniority stripped", () => {
  assert.equal(
    normalizeRoleTitle("Senior MERN Stack Developer"),
    "full stack engineer"
  );
  assert.equal(
    normalizeRoleTitle("Principal Software Engineer"),
    "full stack engineer"
  );
  assert.equal(normalizeRoleTitle("Jr. Web Developer"), "full stack engineer");
  const pct = roleRelevanceScore(
    {
      title: "Full Stack Developer",
      responsibilities: "Build MERN apps and REST APIs",
    },
    ["Senior MERN Stack Developer"]
  );
  assert.ok(pct >= 70);
});

test("scoring math with all criteria present", () => {
  const job = {
    title: "Full Stack Developer",
    responsibilities: "Build APIs with Node and React",
    skills: ["Node.js", "React"],
    niceToHaveSkills: ["Docker"],
    experienceMin: 3,
    experienceMax: 6,
    education: "Bachelor",
  };
  const result = scoreApplicationMatch({
    job,
    candidate: { experienceYears: 2, skills: ["PHP"] },
    parsedProfile: {
      skills: ["NodeJS", "React", "Docker"],
      totalExperienceYears: 4,
      jobTitles: ["Full Stack Developer"],
      education: [{ degree: "BS Computer Science" }],
      flags: [],
      textLength: 800,
    },
    cvText: "x".repeat(800),
    usedAiParse: true,
  });
  assert.equal(result.matchStatus, "done");
  assert.ok(result.matchPercent >= 85);
  assert.equal(result.missingSkills.length, 0);
});

test("form skills are ignored in scoring", () => {
  const result = scoreApplicationMatch({
    job: {
      title: "Dev",
      responsibilities: "React",
      skills: ["React", "Node.js"],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
    },
    candidate: {
      skills: ["React", "Node.js", "AWS"],
      tags: ["Docker"],
      experienceYears: 10,
    },
    parsedProfile: {
      skills: [],
      totalExperienceYears: null,
      jobTitles: ["Dev"],
      education: [],
      flags: [],
      textLength: 400,
    },
    cvText: "x".repeat(400),
    usedAiParse: true,
  });
  assert.equal(result.matchStatus, "done");
  // Form had all skills; CV had none → 0% must-have, capped
  assert.equal(result.matchedSkills.length, 0);
  assert.ok(result.missingSkills.includes("React"));
  assert.ok(result.matchPercent <= DEFAULT_MUST_HAVE_CAP);
  // Experience from form must not activate experience criterion
  assert.equal(result.scoreBreakdown.criteria.experience.scored, false);
});

test("null CV experience redistributes weight", () => {
  const result = scoreApplicationMatch({
    job: {
      title: "FE",
      responsibilities: "React apps",
      skills: ["React"],
      niceToHaveSkills: [],
      experienceMin: 3,
      experienceMax: 6,
      education: "",
    },
    candidate: { experienceYears: 5 },
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: null,
      jobTitles: ["Frontend Developer"],
      education: [],
      flags: [],
      textLength: 500,
    },
    cvText: "Built React apps. No years stated.",
    usedAiParse: true,
  });
  assert.equal(result.matchStatus, "done");
  assert.equal(result.scoreBreakdown.criteria.experience.scored, false);
  assert.ok(result.activeWeights.experience == null);
  assert.ok(result.activeWeights.mustHaveSkills > 40);
  // Must-have 100% after redistributing experience weight; role may be partial
  assert.equal(result.scoreBreakdown.criteria.mustHaveSkills.score, 100);
  assert.ok(result.matchPercent >= 70);
});

test("weight redistribution when job data is missing", () => {
  const job = {
    title: "",
    responsibilities: "",
    skills: ["React"],
    niceToHaveSkills: [],
    experienceMin: 0,
    experienceMax: 0,
    education: "",
  };
  const result = scoreApplicationMatch({
    job,
    candidate: {},
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 500,
      flags: [],
    },
    usedAiParse: true,
  });
  assert.equal(result.matchStatus, "done");
  assert.equal(result.matchPercent, 100);
  assert.ok(result.activeWeights.mustHaveSkills > 90);
  assert.equal(result.activeWeights.experience, undefined);
});

test("insufficient job criteria → not_analyzed", () => {
  const result = scoreApplicationMatch({
    job: { skills: [], title: "", responsibilities: "", education: "" },
    candidate: {},
    parsedProfile: { skills: ["x"], textLength: 100 },
  });
  assert.equal(result.matchStatus, "not_analyzed");
  assert.equal(result.matchPercent, null);
});

test("must-have cap tiers use missing-share weighting", () => {
  // 1 of 3 hard-missing → share ≈ 0.333 → tier 75
  const oneOfThree = scoreApplicationMatch({
    job: {
      title: "Dev",
      skills: ["Node.js", "React", "AWS"],
      experienceMin: 2,
      experienceMax: 5,
      education: "",
      responsibilities: "Dev",
    },
    candidate: {},
    parsedProfile: {
      skills: ["Node.js", "React"],
      totalExperienceYears: 3,
      jobTitles: ["Dev"],
      education: [],
      textLength: 500,
      flags: [],
    },
    mustHaveCap: 60,
    usedAiParse: true,
  });
  assert.ok(oneOfThree.missingSkills.includes("AWS"));
  assert.equal(oneOfThree.scoreBreakdown.mustHaveCapApplied, true);
  assert.equal(oneOfThree.scoreBreakdown.mustHaveCap, 75);
  assert.ok(oneOfThree.matchPercent <= 75);

  // 2 of 3 hard-missing → share ≈ 0.667 → hard mustHaveCap 60
  const twoOfThree = scoreApplicationMatch({
    job: {
      title: "Dev",
      skills: ["Node.js", "React", "AWS"],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
      responsibilities: "",
    },
    candidate: {},
    parsedProfile: {
      skills: ["Node.js"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 500,
      flags: [],
    },
    mustHaveCap: 60,
    usedAiParse: true,
  });
  assert.equal(twoOfThree.missingSkills.length, 2);
  assert.equal(twoOfThree.scoreBreakdown.mustHaveCap, 60);
  assert.ok(twoOfThree.matchPercent <= DEFAULT_MUST_HAVE_CAP);

  // 1 of 10 related @0.5 → share 0.05 → no hard cap
  const relatedOnly = scoreApplicationMatch({
    job: {
      title: "Dev",
      skills: [
        "Node.js",
        "React",
        "MongoDB",
        "Express",
        "HTML",
        "CSS",
        "Git",
        "REST",
        "JWT",
        "TypeScript",
      ],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
      responsibilities: "",
    },
    candidate: {},
    parsedProfile: {
      skills: [
        "Node.js",
        "React",
        "MongoDB",
        "Express",
        "HTML",
        "CSS",
        "Git",
        "REST",
        "JWT",
        "JavaScript",
      ],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 500,
      flags: [],
    },
    mustHaveCap: 60,
    usedAiParse: true,
  });
  assert.equal(relatedOnly.missingSkills.length, 0);
  assert.equal(relatedOnly.relatedSkills.length, 1);
  assert.equal(relatedOnly.scoreBreakdown.mustHaveCapApplied, false);
  assert.ok(relatedOnly.matchPercent > DEFAULT_MUST_HAVE_CAP);
});

test("related skills: TypeScript←JavaScript partial; direct TypeScript full; no related stays missing", () => {
  const partial = scoreApplicationMatch({
    job: {
      title: "FE",
      skills: ["TypeScript", "React"],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
      responsibilities: "",
    },
    candidate: { skills: ["TypeScript", "React", "AWS"] },
    parsedProfile: {
      skills: ["JavaScript", "React"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 400,
      flags: [],
    },
    usedAiParse: true,
  });
  assert.deepEqual(partial.matchedSkills, ["React"]);
  assert.equal(partial.relatedSkills.length, 1);
  assert.equal(partial.relatedSkills[0].skill, "TypeScript");
  assert.equal(partial.relatedSkills[0].basedOn, "javascript");
  assert.equal(partial.relatedSkills[0].credit, 0.5);
  assert.equal(partial.missingSkills.length, 0);
  assert.equal(partial.breakdown.mustHaveSkills, 75); // (1 + 0.5) / 2
  // Form had TypeScript; CV did not — form ignored
  assert.ok(!partial.matchedSkills.includes("TypeScript"));

  const direct = scoreApplicationMatch({
    job: {
      title: "FE",
      skills: ["TypeScript"],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
      responsibilities: "",
    },
    candidate: {},
    parsedProfile: {
      skills: ["TypeScript"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 400,
      flags: [],
    },
    usedAiParse: true,
  });
  assert.deepEqual(direct.matchedSkills, ["TypeScript"]);
  assert.equal(direct.relatedSkills.length, 0);
  assert.equal(direct.breakdown.mustHaveSkills, 100);

  const none = scoreApplicationMatch({
    job: {
      title: "FE",
      skills: ["AWS"],
      experienceMin: 0,
      experienceMax: 0,
      education: "",
      responsibilities: "",
    },
    candidate: { skills: ["AWS"] },
    parsedProfile: {
      skills: ["JavaScript"],
      totalExperienceYears: null,
      jobTitles: [],
      education: [],
      textLength: 400,
      flags: [],
    },
    usedAiParse: true,
  });
  assert.deepEqual(none.missingSkills, ["AWS"]);
  assert.equal(none.relatedSkills.length, 0);
  assert.equal(none.matchedSkills.length, 0);
});

test("education ranking", () => {
  assert.ok(educationLevelFromText("Bachelor of Science") >= 3);
  assert.ok(educationLevelFromText("PhD Computer Science") >= 5);
  assert.equal(educationScore("Master", [{ degree: "BS" }]), 60);
  assert.equal(educationScore("Bachelor", [{ degree: "MS" }]), 100);
  assert.equal(educationScore("", [{ degree: "BS" }]), null);
});

test("form vs CV experience is informational note only (no mismatch flag)", () => {
  const result = scoreApplicationMatch({
    job: {
      skills: ["React"],
      experienceMin: 2,
      experienceMax: 8,
      title: "FE",
      responsibilities: "React",
    },
    candidate: { experienceYears: 2 },
    parsedProfile: {
      skills: ["React"],
      totalExperienceYears: 5,
      jobTitles: ["Frontend"],
      flags: [],
      textLength: 400,
    },
    usedAiParse: true,
  });
  assert.ok(!result.flags.includes("mismatch"));
  assert.match(result.formExperienceNote, /Form says 2 years, CV says 5 years/);
  assert.equal(result.scoreBreakdown.formYears, 2);
  assert.equal(result.scoreBreakdown.cvYears, 5);
});

test("evidence verification drops invented snippets", () => {
  const cv = "Built REST APIs with Node.js and MongoDB for five years.";
  const kept = filterEvidenceSnippets(
    [
      "REST APIs with Node.js",
      "Won a Nobel prize in quantum computing",
      "MongoDB for five years",
    ],
    cv
  );
  assert.deepEqual(kept, [
    "REST APIs with Node.js",
    "MongoDB for five years",
  ]);
});

test("fallback when AI unavailable still scores CV text only", () => {
  const result = scoreWithRuleBasedFallback({
    job: {
      skills: ["Node.js"],
      experienceMin: 2,
      experienceMax: 5,
      title: "Backend",
      responsibilities: "APIs",
    },
    candidate: { skills: ["Python"], experienceYears: 20 },
    cvText: "Senior engineer with 4 years of experience using Node.js and Express.",
  });
  assert.equal(result.confidence, "low");
  assert.match(result.note, /Rule-based/);
  assert.ok(result.matchPercent > 0);
  assert.ok(result.matchedSkills.includes("Node.js"));
});

test("unreadable / empty CV → not_analyzed (never form-based score)", () => {
  const empty = scoreWithRuleBasedFallback({
    job: {
      skills: ["React"],
      experienceMin: 2,
      experienceMax: 5,
      title: "FE",
      responsibilities: "React",
    },
    candidate: { skills: ["React", "Node.js"], experienceYears: 8 },
    cvText: "",
  });
  assert.equal(empty.matchStatus, "not_analyzed");
  assert.equal(empty.matchPercent, null);
  assert.equal(empty.matchStatusReason, "no_cv_text");

  const r = calculateMatchPercent(
    { skills: ["React"], experienceMin: 1 },
    { skills: ["React"], experienceYears: 5 }
  );
  assert.equal(r.matchStatus, "not_analyzed");
  assert.equal(r.matchPercent, null);
});

test("token similarity is deterministic", () => {
  assert.ok(
    tokenSimilarity("Full Stack Developer", "Full Stack Engineer") > 40
  );
  assert.equal(experienceScore(3, 2, 5), 100);
  assert.equal(experienceScore(null, 2, 5), null);
});

test("reload aliases for tests does not break default map", () => {
  _reloadAliasesForTests({
    go: ["go", "golang"],
  });
  assert.equal(skillsMatch("golang", "Go"), true);
  _reloadAliasesForTests();
  assert.equal(skillsMatch("Node", "Node.js"), true);
});
