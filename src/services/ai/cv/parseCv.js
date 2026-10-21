import { Candidate, Application } from "../../../models/recruitment/index.js";
import { generateJSON, getAiConfig } from "../aiService.js";
import { downloadResumeBuffer } from "./downloadResume.js";
import { extractCvText } from "./extractText.js";
import { stripContactHeader } from "./stripContact.js";
import { detectSuspiciousCvFlags } from "./suspicious.js";
import {
  PARSER_VERSION,
  parsedCvSchema,
  CV_PARSE_SYSTEM_PROMPT,
  buildCvParseUserPrompt,
} from "./parseSchema.js";

const MATCH_NOT_ANALYZED = "not_analyzed";

function emptyParsed(partial = {}) {
  return {
    skills: [],
    totalExperienceYears: null,
    jobTitles: [],
    companies: [],
    education: [],
    certifications: [],
    languages: [],
    summary: "",
    ...partial,
  };
}

async function defaultLoadCandidate(id) {
  return Candidate.findOne({ _id: id, isDeleted: false });
}

async function defaultSaveCandidate(candidate) {
  return candidate.save();
}

async function maybeUpdateApplication(applicationId, patch, updateApp) {
  if (!applicationId) return;
  await updateApp(
    { _id: applicationId, isDeleted: false },
    { $set: patch }
  );
}

/**
 * Parse a candidate CV into candidate.parsedProfile.
 * Does not run on application submit — call manually / from a later queue.
 *
 * Never includes Cloudinary URLs or raw CV text in the return value.
 */
export async function parseCandidateCv(
  candidateId,
  {
    applicationId = null,
    force = false,
    generate = generateJSON,
    download = downloadResumeBuffer,
    extract = extractCvText,
    config = null,
    loadCandidate = defaultLoadCandidate,
    saveCandidate = defaultSaveCandidate,
    updateApplication = (filter, update) =>
      Application.updateOne(filter, update),
  } = {}
) {
  const cfg = config || getAiConfig();
  const candidate = await loadCandidate(candidateId);
  if (!candidate) {
    const err = new Error("Candidate not found");
    err.code = "CANDIDATE_NOT_FOUND";
    throw err;
  }

  let downloaded;
  try {
    downloaded = await download(candidate);
  } catch (err) {
    await maybeUpdateApplication(
      applicationId,
      { matchStatus: MATCH_NOT_ANALYZED, matchStatusReason: "download_failed" },
      updateApplication
    );
    return {
      ok: false,
      cached: false,
      status: MATCH_NOT_ANALYZED,
      reason: "download_failed",
      flags: [],
      textLength: 0,
      parsedProfile: candidate.parsedProfile || null,
      cvHash: null,
      parserVersion: PARSER_VERSION,
      parserModel: cfg.parseModel || null,
      message: err?.message || "Resume download failed",
    };
  }

  const { buffer, filename, cvHash } = downloaded;
  const existing = candidate.parsedProfile || {};

  if (
    !force &&
    existing.cvHash &&
    existing.cvHash === cvHash &&
    existing.parserVersion === PARSER_VERSION &&
    existing.parsedAt
  ) {
    return {
      ok: true,
      cached: true,
      status: "done",
      reason: null,
      flags: existing.flags || [],
      textLength: existing.textLength || 0,
      parsedProfile: existing,
      cvHash,
      parserVersion: PARSER_VERSION,
      parserModel: existing.parserModel || cfg.parseModel || null,
    };
  }

  const extracted = await extract(buffer, { filename, mimetype: "" });

  if (!extracted.ok) {
    const reason = extracted.reason || "extract_failed";
    await maybeUpdateApplication(
      applicationId,
      { matchStatus: MATCH_NOT_ANALYZED, matchStatusReason: reason },
      updateApplication
    );
    return {
      ok: false,
      cached: false,
      status: MATCH_NOT_ANALYZED,
      reason,
      flags: [],
      textLength: 0,
      parsedProfile: null,
      cvHash,
      parserVersion: PARSER_VERSION,
      parserModel: cfg.parseModel || null,
    };
  }

  const flags = detectSuspiciousCvFlags(extracted.text);
  const stripped = stripContactHeader(extracted.text, {
    maxChars: cfg.maxCvChars,
  });

  if (!stripped) {
    await maybeUpdateApplication(
      applicationId,
      { matchStatus: MATCH_NOT_ANALYZED, matchStatusReason: "scanned_cv" },
      updateApplication
    );
    return {
      ok: false,
      cached: false,
      status: MATCH_NOT_ANALYZED,
      reason: "scanned_cv",
      flags,
      textLength: 0,
      parsedProfile: null,
      cvHash,
      parserVersion: PARSER_VERSION,
      parserModel: cfg.parseModel || null,
    };
  }

  const ai = await generate({
    feature: "cv_parse",
    model: cfg.parseModel,
    system: CV_PARSE_SYSTEM_PROMPT,
    user: buildCvParseUserPrompt(stripped),
    schema: parsedCvSchema,
    applicationId: applicationId || null,
  });

  if (!ai.ok) {
    await maybeUpdateApplication(
      applicationId,
      {
        matchStatus: "failed",
        matchStatusReason: ai.code || "ai_parse_failed",
      },
      updateApplication
    );
    return {
      ok: false,
      cached: false,
      status: "failed",
      reason: ai.code || "ai_parse_failed",
      flags,
      textLength: stripped.length,
      parsedProfile: null,
      cvHash,
      parserVersion: PARSER_VERSION,
      parserModel: cfg.parseModel || null,
    };
  }

  const data = emptyParsed(ai.data);
  if (typeof data.summary === "string" && data.summary.length > 280) {
    data.summary = data.summary.slice(0, 280);
  }

  const parsedProfile = {
    ...data,
    cvHash,
    parsedAt: new Date(),
    parserModel: ai.model || cfg.parseModel || "",
    parserVersion: PARSER_VERSION,
    flags,
    textLength: stripped.length,
  };

  candidate.parsedProfile = parsedProfile;
  await saveCandidate(candidate);

  await maybeUpdateApplication(
    applicationId,
    { matchStatus: "done", matchStatusReason: "" },
    updateApplication
  );

  return {
    ok: true,
    cached: false,
    status: "done",
    reason: null,
    flags,
    textLength: stripped.length,
    parsedProfile,
    cvHash,
    parserVersion: PARSER_VERSION,
    parserModel: parsedProfile.parserModel,
  };
}

export { PARSER_VERSION };
