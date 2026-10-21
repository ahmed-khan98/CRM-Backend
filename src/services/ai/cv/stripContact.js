/**
 * Strip likely contact-header lines (name, email, phone, CNIC, address, links)
 * from the top of a CV before the text is sent to an LLM.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}\b/;
const CNIC_RE = /\b\d{5}[-\s]?\d{7}[-\s]?\d\b/;
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const LINKEDIN_RE = /linkedin\.com\/\S+/i;
const LABEL_RE =
  /^(?:name|email|e-mail|phone|mobile|tel|contact|address|cnic|nic|location|linkedin|portfolio|github|website)\s*[:\-]/i;
const ADDRESS_HINT_RE =
  /\b(?:street|st\.|road|rd\.|avenue|ave\.|block|phase|house\s*#?|flat\s*#?|apartment|sector|city|pakistan|karachi|lahore|islamabad)\b/i;

function isContactLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.length > 160) return false;
  if (EMAIL_RE.test(t)) return true;
  if (CNIC_RE.test(t)) return true;
  if (URL_RE.test(t) || LINKEDIN_RE.test(t)) return true;
  if (LABEL_RE.test(t)) return true;
  if (PHONE_RE.test(t) && t.replace(/\D/g, "").length >= 10) return true;
  if (ADDRESS_HINT_RE.test(t) && t.length < 120) return true;
  // Short all-caps / title-case name-only line at the very top is handled by caller index
  return false;
}

function looksLikeNameOnly(line) {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  if (/[^A-Za-z\s'.-]/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5;
}

/**
 * Normalize whitespace and strip a leading contact block.
 */
export function stripContactHeader(text, { maxChars } = {}) {
  let normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = normalized.split("\n");
  let i = 0;
  let strippedName = false;

  // Drop blank / contact lines from the top; optionally one name line first
  while (i < lines.length && i < 25) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (!strippedName && looksLikeNameOnly(line) && i < 3) {
      strippedName = true;
      i += 1;
      continue;
    }
    if (isContactLine(line)) {
      i += 1;
      continue;
    }
    break;
  }

  let body = lines.slice(i).join("\n").trim();

  // Safety: remove remaining emails / CNICs / phones anywhere (rare mid-doc)
  body = body
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(CNIC_RE, "[redacted-cnic]")
    .replace(URL_RE, "[redacted-url]");

  body = body.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  if (maxChars && body.length > maxChars) {
    body = body.slice(0, maxChars);
  }
  return body;
}
