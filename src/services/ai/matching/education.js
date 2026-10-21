/** Simple education level ranking for match scoring. */
export const EDUCATION_LEVELS = [
  { level: 1, keys: ["matric", "ssc", "o level", "olevel", "grade 10"] },
  {
    level: 2,
    keys: [
      "intermediate",
      "hssc",
      "fa",
      "fsc",
      "f.sc",
      "a level",
      "alevel",
      "grade 12",
      "high school",
      "higher secondary",
    ],
  },
  {
    level: 3,
    keys: [
      "bachelor",
      "bachelors",
      "bs",
      "b.s",
      "ba",
      "b.a",
      "bsc",
      "b.sc",
      "bcom",
      "b.com",
      "be",
      "b.e",
      "btech",
      "b.tech",
      "undergraduate",
      "llb",
      "mbbs",
    ],
  },
  {
    level: 4,
    keys: [
      "master",
      "masters",
      "ms",
      "m.s",
      "ma",
      "m.a",
      "msc",
      "m.sc",
      "mba",
      "mphil",
      "m.phil",
      "graduate",
      "postgraduate",
    ],
  },
  {
    level: 5,
    keys: ["phd", "ph.d", "doctorate", "doctoral"],
  },
];

export function educationLevelFromText(text) {
  const raw = String(text || "").toLowerCase();
  if (!raw.trim()) return 0;
  let best = 0;
  for (const row of EDUCATION_LEVELS) {
    for (const key of row.keys) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(key)}(?:[^a-z0-9]|$)`, "i");
      if (re.test(raw)) best = Math.max(best, row.level);
    }
  }
  return best;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Candidate education entries [{degree, field, institute, year}] or free text.
 * Returns highest level found.
 */
export function candidateEducationLevel(education) {
  if (Array.isArray(education)) {
    return education.reduce((max, row) => {
      const blob = [row?.degree, row?.field, row?.institute]
        .filter(Boolean)
        .join(" ");
      return Math.max(max, educationLevelFromText(blob));
    }, 0);
  }
  return educationLevelFromText(education);
}

/**
 * Score 0–100: meet or exceed required level → 100; one below → 60; two → 30; else 0.
 * Unknown required/candidate → 0 (caller should skip criterion).
 */
export function educationScore(jobEducation, candidateEducation) {
  const required = educationLevelFromText(jobEducation);
  if (!required) return null;
  const have = candidateEducationLevel(candidateEducation);
  if (!have) return 0;
  if (have >= required) return 100;
  const gap = required - have;
  if (gap === 1) return 60;
  if (gap === 2) return 30;
  return 0;
}
