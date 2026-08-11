/** Lightweight XSS / control-char sanitization for chat text */
export function sanitizeChatText(input = "", max = 10000) {
  return String(input)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, max);
}
