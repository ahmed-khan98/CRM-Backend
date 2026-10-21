const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /you\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|jailbroken)/i,
  /system\s+prompt/i,
  /give\s+(me\s+)?(a\s+)?100\s*%?\s*match/i,
  /always\s+(return|give|score)\s+100/i,
  /override\s+(the\s+)?(scoring|match|rules?)/i,
  /do\s+not\s+follow\s+(your\s+)?(system|original)\s+(prompt|instructions?)/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+have\s+)?no\s+restrictions?/i,
];

/**
 * Flags prompt-injection style phrases in CV text.
 * Returns unique flag keys (e.g. "suspicious_cv").
 */
export function detectSuspiciousCvFlags(text) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(raw)) return ["suspicious_cv"];
  }
  return [];
}

export { SUSPICIOUS_PATTERNS };
