/** Slot only. Implement when AI_PROVIDER=gemini is needed. */
export async function geminiGenerate() {
  const err = new Error("Gemini adapter is not implemented");
  err.code = "AI_PROVIDER_NOT_IMPLEMENTED";
  err.retryable = false;
  throw err;
}
