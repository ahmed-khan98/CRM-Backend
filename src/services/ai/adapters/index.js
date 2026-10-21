import { anthropicGenerate } from "./anthropic.js";
import { openaiGenerate } from "./openai.js";
import { geminiGenerate } from "./gemini.js";

const ADAPTERS = {
  anthropic: anthropicGenerate,
  openai: openaiGenerate,
  gemini: geminiGenerate,
};

export function getAdapter(provider) {
  return ADAPTERS[provider] || null;
}
