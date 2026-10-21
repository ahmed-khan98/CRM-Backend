export function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    const err = new Error("Empty model response");
    err.code = "AI_INVALID_JSON";
    throw err;
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    const err = new Error("Model response was not a JSON object");
    err.code = "AI_INVALID_JSON";
    throw err;
  }
  try {
    const value = JSON.parse(body.slice(start, end + 1));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      const err = new Error("Model response was not a JSON object");
      err.code = "AI_INVALID_JSON";
      throw err;
    }
    return value;
  } catch (e) {
    if (e?.code === "AI_INVALID_JSON") throw e;
    const err = new Error("Model response was not valid JSON");
    err.code = "AI_INVALID_JSON";
    throw err;
  }
}

export function validateWithSchema(value, schema) {
  if (!schema) return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const err = new Error("Model JSON failed schema validation");
    err.code = "AI_INVALID_JSON";
    throw err;
  }
  return parsed.data;
}
