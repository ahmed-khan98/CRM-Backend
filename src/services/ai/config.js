const PROVIDERS = ["anthropic", "openai", "gemini"];

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * AI settings come only from the environment.
 * API key and model names must never be sent to the frontend.
 */
export function getAiConfig(env = process.env) {
  const provider = String(env.AI_PROVIDER || "anthropic")
    .trim()
    .toLowerCase();
  return {
    enabled: String(env.AI_ENABLED || "").trim().toLowerCase() === "true",
    provider: PROVIDERS.includes(provider) ? provider : "",
    apiKey: String(env.AI_API_KEY || "").trim(),
    parseModel: String(env.AI_PARSE_MODEL || "").trim(),
    explainModel: String(env.AI_EXPLAIN_MODEL || "").trim(),
    maxCvChars: positiveInt(env.AI_MAX_CV_CHARS, 12000),
    monthlyCallLimit: positiveInt(env.AI_MONTHLY_CALL_LIMIT, 0),
    timeoutMs: 30000,
  };
}

export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export { PROVIDERS };
