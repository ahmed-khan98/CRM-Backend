import crypto from "crypto";

/**
 * Generate an RFC5322 Message-ID before SMTP so scheduled sends are idempotent.
 * @param {string} [fromAddress]
 * @returns {string} e.g. `<abc@domain>`
 */
export function generateMailboxMessageId(fromAddress = "") {
  const domain =
    String(fromAddress || "")
      .split("@")[1]
      ?.replace(/[>\s]/g, "") || "mailbox.local";
  const id = crypto.randomBytes(16).toString("hex");
  return `<${id}@${domain}>`;
}

/**
 * Constant-time string compare for cron secrets (pads to equal length).
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) {
    // Still run compare against self to reduce timing oracle on length
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
