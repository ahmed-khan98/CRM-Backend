import {
  Application,
  Candidate,
  Job,
  RecruitmentSettings,
} from "../../../models/recruitment/index.js";
import { getAiConfig } from "../aiService.js";
import { parseCandidateCv } from "../cv/parseCv.js";
import { downloadResumeBuffer } from "../cv/downloadResume.js";
import { extractCvText } from "../cv/extractText.js";
import { stripContactHeader } from "../cv/stripContact.js";
import {
  scoreApplicationMatch,
  DEFAULT_MATCH_WEIGHTS,
} from "./score.js";
import { explainMatch } from "./explain.js";
import { scoreWithRuleBasedFallback } from "./fallback.js";
import { PARSER_VERSION } from "../cv/parseSchema.js";
import { tiersFromSettings } from "./mustHaveCapTiers.js";

async function loadMatchSettings() {
  const doc = await RecruitmentSettings.findOne().lean();
  const weights = {
    ...DEFAULT_MATCH_WEIGHTS,
    ...(doc?.matchWeights || {}),
  };
  const mustHaveCapTiers = tiersFromSettings(doc || {});
  const aiMatchingEnabled = doc?.aiMatchingEnabled !== false;
  return {
    weights,
    mustHaveCapTiers,
    mustHaveCap: mustHaveCapTiers.c3,
    aiMatchingEnabled,
  };
}

/**
 * Full pipeline for one application: parse (cached) → score → explain → save.
 * Idempotent when cvHash + job.version unchanged (unless force).
 */
export async function runMatchForApplication(
  applicationId,
  {
    force = false,
    generate,
    download = downloadResumeBuffer,
    extract = extractCvText,
    parseCv = parseCandidateCv,
  } = {}
) {
  const app = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  });
  if (!app) {
    const err = new Error("Application not found");
    err.code = "APPLICATION_NOT_FOUND";
    throw err;
  }

  const [job, candidate, settings] = await Promise.all([
    Job.findById(app.jobId),
    Candidate.findById(app.candidateId),
    loadMatchSettings(),
  ]);
  if (!job || !candidate) {
    await Application.updateOne(
      { _id: app._id },
      {
        $set: {
          matchStatus: "failed",
          matchStatusReason: "missing_job_or_candidate",
        },
      }
    );
    return { ok: false, reason: "missing_job_or_candidate" };
  }

  const jobVersion = Number(job.version) || 1;
  const existingHash = candidate.parsedProfile?.cvHash || "";

  // Skip re-score if unchanged
  if (
    !force &&
    app.matchStatus === "done" &&
    app.jobVersion === jobVersion &&
    existingHash &&
    app.scoredAt &&
    candidate.parsedProfile?.parserVersion === PARSER_VERSION
  ) {
    return { ok: true, skipped: true, reason: "unchanged" };
  }

  await Application.updateOne(
    { _id: app._id },
    { $set: { matchStatus: "processing", matchStatusReason: "" } }
  );

  let cvText = "";
  let parseResult = null;
  const cfg = getAiConfig();
  // Settings soft-toggle: when off, skip AI path even if env AI_ENABLED is on
  const aiAllowed = Boolean(cfg.enabled && settings.aiMatchingEnabled);

  try {
    const downloaded = await download(candidate);
    const extracted = await extract(downloaded.buffer, {
      filename: downloaded.filename,
    });

    if (!extracted.ok) {
      const reason = extracted.reason || "extract_failed";
      await Application.updateOne(
        { _id: app._id },
        {
          $set: {
            matchPercent: null,
            matchStatus: "not_analyzed",
            matchStatusReason: reason,
            confidence: "low",
            scoreBreakdown: null,
            jobVersion,
            scoredAt: new Date(),
          },
        }
      );
      return { ok: false, reason };
    }

    cvText = stripContactHeader(extracted.text, {
      maxChars: cfg.maxCvChars,
    });

    // Skip re-parse if hash unchanged
    const skipParse =
      !force &&
      candidate.parsedProfile?.cvHash === downloaded.cvHash &&
      candidate.parsedProfile?.parserVersion === PARSER_VERSION;

    if (!skipParse && aiAllowed) {
      parseResult = await parseCv(candidate._id, {
        applicationId: app._id,
        force: true,
        generate,
        download: async () => downloaded,
        extract: async () => extracted,
        config: cfg,
      });
    } else if (skipParse && candidate.parsedProfile) {
      parseResult = {
        ok: true,
        cached: true,
        parsedProfile: candidate.parsedProfile,
        status: "done",
      };
    } else {
      parseResult = {
        ok: false,
        reason: aiAllowed ? "parse_skipped" : "AI_DISABLED",
        status: "failed",
      };
    }

    // Refresh candidate after parse
    const freshCandidate = await Candidate.findById(candidate._id);
    let usedAiParse = Boolean(
      aiAllowed && parseResult?.ok && parseResult?.parsedProfile
    );
    let scored;

    if (
      !usedAiParse ||
      !parseResult?.ok ||
      parseResult?.status === "not_analyzed" ||
      parseResult?.status === "failed" ||
      !parseResult?.parsedProfile
    ) {
      // Fallback rule-based from CV text
      scored = scoreWithRuleBasedFallback({
        job,
        candidate: freshCandidate,
        cvText,
        weights: settings.weights,
        mustHaveCap: settings.mustHaveCap,
        mustHaveCapTiers: settings.mustHaveCapTiers,
      });
      usedAiParse = false;
      if (parseResult?.reason && parseResult.reason !== "AI_DISABLED") {
        // Keep not_analyzed for unreadable/scanned
        if (
          ["scanned_cv", "unreadable_pdf", "unsupported_format", "download_failed"].includes(
            parseResult.reason
          )
        ) {
          await Application.updateOne(
            { _id: app._id },
            {
              $set: {
                matchPercent: null,
                matchStatus: "not_analyzed",
                matchStatusReason: parseResult.reason,
                confidence: "low",
                flags: freshCandidate?.parsedProfile?.flags || [],
                scoreBreakdown: null,
                jobVersion,
                scoredAt: new Date(),
              },
            }
          );
          return { ok: false, reason: parseResult.reason };
        }
      }
    } else {
      scored = scoreApplicationMatch({
        job,
        candidate: freshCandidate,
        parsedProfile: parseResult.parsedProfile,
        cvText,
        weights: settings.weights,
        mustHaveCap: settings.mustHaveCap,
        mustHaveCapTiers: settings.mustHaveCapTiers,
        usedAiParse: true,
      });
    }

    if (scored.matchStatus === "not_analyzed") {
      await Application.updateOne(
        { _id: app._id },
        {
          $set: {
            matchPercent: null,
            matchStatus: "not_analyzed",
            matchStatusReason: scored.matchStatusReason || "insufficient_job_criteria",
            confidence: scored.confidence || "low",
            matchedSkills: [],
            relatedSkills: [],
            missingSkills: [],
            strengths: [],
            concerns: [],
            evidence: [],
            summary: "",
            flags: scored.flags || [],
            matchNote: scored.note || "",
            scoreBreakdown: scored.scoreBreakdown || null,
            jobVersion,
            scoredAt: new Date(),
          },
        }
      );
      return { ok: false, reason: scored.matchStatusReason };
    }

    let explanation = {
      strengths: [],
      concerns: [],
      summary: "",
      evidence: [],
      explainNote: scored.note || "",
    };

    if (usedAiParse && scored.matchPercent != null) {
      explanation = await explainMatch({
        job,
        parsedProfile: parseResult.parsedProfile || freshCandidate.parsedProfile,
        cvText,
        matchPercent: scored.matchPercent,
        applicationId: app._id,
        generate,
        config: cfg,
      });
    } else if (!explanation.explainNote) {
      explanation.explainNote = "Rule-based (AI unavailable)";
    }

    const confidence =
      explanation.explainNote && !usedAiParse
        ? "low"
        : scored.confidence || "medium";

    await Application.updateOne(
      { _id: app._id },
      {
        $set: {
          matchPercent: scored.matchPercent,
          matchStatus: "done",
          matchStatusReason: "",
          confidence,
          matchedSkills: scored.matchedSkills || [],
          relatedSkills: scored.relatedSkills || [],
          missingSkills: scored.missingSkills || [],
          strengths: explanation.strengths || [],
          concerns: explanation.concerns || [],
          evidence: explanation.evidence || [],
          summary: explanation.summary || "",
          flags: scored.flags || [],
          matchNote: explanation.explainNote || scored.note || "",
          scoreBreakdown: scored.scoreBreakdown || null,
          jobVersion,
          scoredAt: new Date(),
        },
      }
    );

    return {
      ok: true,
      matchPercent: scored.matchPercent,
      confidence,
      skipped: false,
    };
  } catch (err) {
    await Application.updateOne(
      { _id: app._id },
      {
        $set: {
          matchStatus: "failed",
          matchStatusReason: err?.code || "match_pipeline_error",
        },
      }
    );
    throw err;
  }
}
