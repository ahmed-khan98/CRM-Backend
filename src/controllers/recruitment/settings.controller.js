import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  RecruitmentEmailTemplate,
} from "../../models/recruitment/index.js";
import {
  getOrCreateSettings,
  ensureRecruitmentDefaults,
  logActivity,
} from "../../utils/recruitmentHelpers.js";
import { getAiConfig } from "../../services/ai/config.js";
import { DEFAULT_MATCH_WEIGHTS } from "../../services/ai/matching/score.js";
import {
  DEFAULT_MUST_HAVE_CAP_TIERS,
  RELATED_SKILLS_CONFIG_PATH,
  normalizeMustHaveCapTiers,
  tiersFromSettings,
  validateMustHaveCapTiers,
} from "../../services/ai/matching/mustHaveCapTiers.js";

const WEIGHT_KEYS = [
  "mustHaveSkills",
  "experience",
  "roleRelevance",
  "education",
  "niceToHaveSkills",
];

function validateMatchWeights(raw) {
  if (!raw || typeof raw !== "object") {
    throw new ApiError(400, "matchWeights is required");
  }
  const weights = {};
  let total = 0;
  for (const key of WEIGHT_KEYS) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new ApiError(400, `matchWeights.${key} must be 0–100`);
    }
    weights[key] = Math.round(n);
    total += weights[key];
  }
  if (total !== 100) {
    throw new ApiError(400, `matchWeights must total 100 (got ${total})`);
  }
  return weights;
}

function tiersSnapshot(settings) {
  return tiersFromSettings(
    settings?.toObject ? settings.toObject() : settings || {}
  );
}

function settingsPublicShape(settings) {
  const env = getAiConfig();
  const doc = settings?.toObject ? settings.toObject() : settings;
  const mustHaveCapTiers = tiersFromSettings(doc);
  return {
    ...doc,
    mustHaveCapTiers,
    mustHaveCap: mustHaveCapTiers.c3,
    relatedSkillsConfigPath: RELATED_SKILLS_CONFIG_PATH,
    /** Env master switch — never expose key/models */
    aiEnvEnabled: Boolean(env.enabled),
    aiProviderConfigured: Boolean(env.provider && env.apiKey),
  };
}

export const getSettings = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const settings = await getOrCreateSettings();
  return res
    .status(200)
    .json(new ApiResponse(200, settingsPublicShape(settings), "Settings"));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const before = {
    matchWeights: settings.matchWeights
      ? { ...(settings.matchWeights.toObject?.() || settings.matchWeights) }
      : null,
    mustHaveCap: settings.mustHaveCap,
    mustHaveCapTiers: tiersSnapshot(settings),
    aiMatchingEnabled: settings.aiMatchingEnabled,
    defaultMinMatchScore: settings.defaultMinMatchScore,
  };

  const allowed = [
    "companyName",
    "careersLogoUrl",
    "careersBannerUrl",
    "careersHeadline",
    "careersSubheadline",
    "careersPublicBaseUrl",
    "pipelineStages",
    "rejectionReasons",
    "applicationSources",
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  if (req.body.joiningLinkExpiryDays !== undefined) {
    const days = Number(req.body.joiningLinkExpiryDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      throw new ApiError(400, "joiningLinkExpiryDays must be 1–90");
    }
    settings.joiningLinkExpiryDays = days;
  }

  if (req.body.matchWeights !== undefined) {
    settings.matchWeights = validateMatchWeights(req.body.matchWeights);
  }
  if (req.body.resetMatchWeights === true) {
    settings.matchWeights = { ...DEFAULT_MATCH_WEIGHTS };
    settings.mustHaveCapTiers = { ...DEFAULT_MUST_HAVE_CAP_TIERS };
    settings.mustHaveCap = DEFAULT_MUST_HAVE_CAP_TIERS.c3;
  }

  if (req.body.mustHaveCapTiers !== undefined) {
    const checked = validateMustHaveCapTiers(req.body.mustHaveCapTiers);
    if (!checked.ok) throw new ApiError(400, checked.message);
    settings.mustHaveCapTiers = checked.tiers;
    settings.mustHaveCap = checked.tiers.c3;
  } else if (req.body.mustHaveCap !== undefined) {
    // Legacy single-field update → last tier (c3); other tiers keep defaults
    const cap = Math.round(Number(req.body.mustHaveCap));
    if (!Number.isFinite(cap) || cap < 0 || cap > 100) {
      throw new ApiError(400, "mustHaveCap must be 0–100");
    }
    const existing = settings.mustHaveCapTiers?.b1 != null
      ? normalizeMustHaveCapTiers(settings.mustHaveCapTiers, cap)
      : { ...DEFAULT_MUST_HAVE_CAP_TIERS, c3: cap };
    let candidate = { ...existing, c3: cap };
    let checked = validateMustHaveCapTiers(candidate);
    if (!checked.ok) {
      candidate = {
        ...DEFAULT_MUST_HAVE_CAP_TIERS,
        c3: cap,
        c2: Math.min(100, Math.max(cap + 1, DEFAULT_MUST_HAVE_CAP_TIERS.c2)),
        c1: Math.min(100, Math.max(cap + 2, DEFAULT_MUST_HAVE_CAP_TIERS.c1)),
      };
      if (!(candidate.c1 > candidate.c2 && candidate.c2 > candidate.c3)) {
        candidate = {
          b1: 10,
          b2: 25,
          b3: 50,
          c1: Math.min(100, cap + 20),
          c2: Math.min(100, cap + 10),
          c3: cap,
        };
      }
      checked = validateMustHaveCapTiers(candidate);
    }
    if (!checked.ok) throw new ApiError(400, checked.message);
    settings.mustHaveCapTiers = checked.tiers;
    settings.mustHaveCap = checked.tiers.c3;
  }

  if (req.body.defaultMinMatchScore !== undefined) {
    const min = Number(req.body.defaultMinMatchScore);
    if (!Number.isFinite(min) || min < 0 || min > 100) {
      throw new ApiError(400, "defaultMinMatchScore must be 0–100");
    }
    settings.defaultMinMatchScore = Math.round(min);
  }
  if (req.body.aiMatchingEnabled !== undefined) {
    const env = getAiConfig();
    if (!env.enabled) {
      throw new ApiError(
        400,
        "AI is disabled in server environment (AI_ENABLED). Matching stays rule-based."
      );
    }
    settings.aiMatchingEnabled = Boolean(req.body.aiMatchingEnabled);
  }

  settings.updatedBy = req.user._id;
  await settings.save();

  const after = {
    matchWeights: settings.matchWeights,
    mustHaveCap: settings.mustHaveCap,
    mustHaveCapTiers: tiersSnapshot(settings),
    aiMatchingEnabled: settings.aiMatchingEnabled,
    defaultMinMatchScore: settings.defaultMinMatchScore,
  };
  await logActivity({
    entityType: "settings",
    entityId: settings._id,
    action: "updated",
    actorId: req.user._id,
    meta: { before, after },
  });
  return res
    .status(200)
    .json(new ApiResponse(200, settingsPublicShape(settings), "Updated"));
});

export const listEmailTemplates = asyncHandler(async (req, res) => {
  await ensureRecruitmentDefaults();
  const items = await RecruitmentEmailTemplate.find().sort({ key: 1 });
  return res.status(200).json(new ApiResponse(200, items, "Email templates"));
});

export const updateEmailTemplate = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const tpl = await RecruitmentEmailTemplate.findOne({ key });
  if (!tpl) throw new ApiError(404, "Template not found");
  if (req.body.name !== undefined) tpl.name = req.body.name;
  if (req.body.subject !== undefined) tpl.subject = req.body.subject;
  if (req.body.bodyHtml !== undefined) tpl.bodyHtml = req.body.bodyHtml;
  if (req.body.isActive !== undefined) tpl.isActive = Boolean(req.body.isActive);
  tpl.updatedBy = req.user._id;
  await tpl.save();
  return res.status(200).json(new ApiResponse(200, tpl, "Updated"));
});
