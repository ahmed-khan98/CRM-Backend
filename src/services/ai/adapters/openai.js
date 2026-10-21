const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Models that support response_format json_schema (Structured Outputs).
 * Older chat models fall back to json_object mode.
 */
export function supportsStructuredOutputs(model) {
  const m = String(model || "").toLowerCase();
  if (!m) return false;
  if (m.includes("gpt-3.5")) return false;
  if (/gpt-4-turbo/.test(m) && !/gpt-4-turbo-2024-/.test(m)) return false;
  if (/gpt-4o/.test(m)) return true;
  if (/gpt-4\.1/.test(m)) return true;
  if (/gpt-5/.test(m)) return true;
  if (/^o[0-9]/.test(m) || /[/:-]o[0-9]/.test(m)) return true;
  if (/chatgpt-4o/.test(m)) return true;
  return false;
}

/** Reasoning models that accept reasoning_effort (omit for classic chat models). */
export function supportsReasoningEffort(model) {
  const m = String(model || "").toLowerCase();
  if (!m) return false;
  if (/^o[0-9]/.test(m) || /[/:-]o[0-9]/.test(m)) return true;
  if (/gpt-5/.test(m)) return true;
  return false;
}

/**
 * Best-effort Zod → OpenAI strict JSON Schema.
 * Returns null when the schema is too complex (caller uses json_object).
 */
export function zodToOpenAiJsonSchema(zodSchema) {
  if (!zodSchema || typeof zodSchema !== "object" || !zodSchema._def) {
    return null;
  }
  try {
    const converted = convertZod(zodSchema, { strictRoot: true });
    if (!converted || converted.type !== "object") return null;
    return converted;
  } catch {
    return null;
  }
}

function convertZod(schema, { strictRoot = false } = {}) {
  let current = schema;
  // Unwrap optional / default / nullable / effects
  for (let i = 0; i < 8; i += 1) {
    const typeName = current?._def?.typeName;
    if (typeName === "ZodOptional" || typeName === "ZodDefault") {
      current = current._def.innerType;
      continue;
    }
    if (typeName === "ZodNullable") {
      const inner = convertZod(current._def.innerType);
      return nullableSchema(inner);
    }
    if (typeName === "ZodEffects") {
      current = current._def.schema;
      continue;
    }
    break;
  }

  const typeName = current?._def?.typeName;
  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodLiteral": {
      const v = current._def.value;
      return { type: typeof v, enum: [v] };
    }
    case "ZodEnum":
      return { type: "string", enum: [...(current._def.values || [])] };
    case "ZodArray":
      return {
        type: "array",
        items: convertZod(current._def.type),
      };
    case "ZodUnion": {
      const options = (current._def.options || []).map((o) => convertZod(o));
      // number | string | null style
      const types = options.map((o) => o.type).filter(Boolean);
      if (options.every((o) => o.type && !o.properties && !o.items && !o.enum)) {
        return { type: [...new Set(types.flat())] };
      }
      return { anyOf: options };
    }
    case "ZodObject": {
      const shape = typeof current._def.shape === "function"
        ? current._def.shape()
        : current._def.shape;
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape || {})) {
        properties[key] = convertZod(value);
        // OpenAI strict mode: every key listed in required
        required.push(key);
      }
      const out = {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      };
      if (strictRoot) return out;
      return out;
    }
    default:
      throw new Error(`unsupported_zod:${typeName || "unknown"}`);
  }
}

function nullableSchema(inner) {
  if (!inner) return { type: "null" };
  if (inner.type === "object" || inner.type === "array" || inner.anyOf) {
    return { anyOf: [inner, { type: "null" }] };
  }
  const types = Array.isArray(inner.type) ? inner.type : [inner.type];
  const next = { ...inner, type: [...new Set([...types, "null"])] };
  return next;
}

export function buildOpenAiResponseFormat(model, zodSchema) {
  if (supportsStructuredOutputs(model) && zodSchema) {
    const schema = zodToOpenAiJsonSchema(zodSchema);
    if (schema) {
      return {
        type: "json_schema",
        json_schema: {
          name: "result",
          strict: true,
          schema,
        },
      };
    }
  }
  return { type: "json_object" };
}

export function extractOpenAiUsage(usage = {}) {
  const inputTokens =
    Number(usage.prompt_tokens ?? usage.input_tokens) || 0;
  const completion =
    Number(usage.completion_tokens ?? usage.output_tokens) || 0;
  const reasoning =
    Number(
      usage.completion_tokens_details?.reasoning_tokens ??
        usage.output_tokens_details?.reasoning_tokens
    ) || 0;
  // Chat Completions: completion_tokens already includes reasoning_tokens.
  // If completion is missing but reasoning is present, still count reasoning as output.
  const outputTokens = completion > 0 ? completion : reasoning;
  return { inputTokens, outputTokens };
}

function mapOpenAiError(status, body) {
  const errObj = body?.error || {};
  const apiCode = String(errObj.code || errObj.type || "").toLowerCase();
  const message = String(errObj.message || `OpenAI HTTP ${status}`).slice(0, 300);

  let code = status === 429 ? "AI_RATE_LIMIT" : `AI_HTTP_${status}`;
  let retryable = status === 429 || status >= 500;

  if (
    apiCode === "invalid_api_key" ||
    apiCode === "authentication_error" ||
    status === 401
  ) {
    code = "AI_INVALID_KEY";
    retryable = false;
  } else if (
    apiCode === "insufficient_quota" ||
    /quota|billing/i.test(message)
  ) {
    code = "AI_QUOTA_EXCEEDED";
    retryable = false;
  } else if (
    apiCode === "model_not_found" ||
    /model .* not found|does not exist|invalid model/i.test(message)
  ) {
    code = "AI_MODEL_NOT_FOUND";
    retryable = false;
  } else if (status === 400) {
    code = "AI_BAD_REQUEST";
    retryable = false;
  }

  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.retryable = retryable;
  return err;
}

/**
 * OpenAI Chat Completions adapter (plain fetch, no SDK).
 * Same return shape as Anthropic: { text, inputTokens, outputTokens }.
 */
export async function openaiGenerate({
  apiKey,
  model,
  system,
  user,
  timeoutMs,
  fetchImpl = fetch,
  maxCompletionTokens = 4096,
  schema = null,
}) {
  const responseFormat = buildOpenAiResponseFormat(model, schema);
  const body = {
    model,
    messages: [
      { role: "system", content: String(system || "") },
      { role: "user", content: String(user || "") },
    ],
    response_format: responseFormat,
    max_completion_tokens: maxCompletionTokens,
  };

  // Low reasoning effort for extraction when the model supports it (cost/latency).
  // Do not send temperature — many reasoning models reject it.
  if (supportsReasoningEffort(model)) {
    body.reasoning_effort = "low";
  }

  let res;
  try {
    res = await fetchImpl(OPENAI_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const wrapped = new Error("OpenAI request failed");
    wrapped.code = "AI_NETWORK";
    wrapped.retryable = true;
    wrapped.cause = err;
    throw wrapped;
  }

  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    throw mapOpenAiError(res.status, parsed);
  }

  const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
  const content = choice?.message?.content;
  let outText = "";
  if (typeof content === "string") {
    outText = content;
  } else if (Array.isArray(content)) {
    // Some models return content parts
    outText = content
      .filter((part) => part?.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }

  const { inputTokens, outputTokens } = extractOpenAiUsage(parsed.usage);

  return {
    text: outText,
    inputTokens,
    outputTokens,
  };
}
