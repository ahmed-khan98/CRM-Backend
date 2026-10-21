const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export async function anthropicGenerate({
  apiKey,
  model,
  system,
  user,
  timeoutMs,
  fetchImpl = fetch,
  maxTokens = 4096,
}) {
  let res;
  try {
    res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    const wrapped = new Error("Anthropic request failed");
    wrapped.code = "AI_NETWORK";
    wrapped.retryable = true;
    wrapped.cause = err;
    throw wrapped;
  }

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!res.ok) {
    const err = new Error(`Anthropic HTTP ${res.status}`);
    err.status = res.status;
    err.code = res.status === 429 ? "AI_RATE_LIMIT" : `AI_HTTP_${res.status}`;
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }

  const content = Array.isArray(body.content)
    ? body.content
        .filter((block) => block?.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n")
    : "";

  return {
    text: content,
    inputTokens: Number(body.usage?.input_tokens) || 0,
    outputTokens: Number(body.usage?.output_tokens) || 0,
  };
}
