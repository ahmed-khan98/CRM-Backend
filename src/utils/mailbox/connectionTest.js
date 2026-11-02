import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

/**
 * Resolve effective IMAP/SMTP settings from defaults + optional overrides.
 * @param {object} defaults
 * @param {object} [overrides]
 */
export function resolveServerSettings(defaults, overrides = {}) {
  return {
    imapHost: overrides.imapHost || defaults.imapHost,
    imapPort: overrides.imapPort ?? defaults.imapPort,
    imapSecure: overrides.imapSecure ?? defaults.imapSecure,
    smtpHost: overrides.smtpHost || defaults.smtpHost,
    smtpPort: overrides.smtpPort ?? defaults.smtpPort,
    smtpSecure: overrides.smtpSecure ?? defaults.smtpSecure,
  };
}

/**
 * Test IMAP login + SMTP verify. Never logs the password.
 * @param {{
 *   loginUsername: string,
 *   password: string,
 *   imapHost: string,
 *   imapPort: number,
 *   imapSecure: boolean,
 *   smtpHost: string,
 *   smtpPort: number,
 *   smtpSecure: boolean,
 * }} opts
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function testMailboxConnection(opts) {
  const {
    loginUsername,
    password,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure,
  } = opts;

  if (!loginUsername || !password) {
    return { ok: false, error: "Username and password are required" };
  }

  let imapError = null;
  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: { user: loginUsername, pass: password },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await client.connect();
    await client.logout().catch(() => {});
  } catch (err) {
    imapError = sanitizeConnError(err);
    try {
      client.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: `IMAP: ${imapError}` };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: loginUsername, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    await transporter.verify();
  } catch (err) {
    return { ok: false, error: `SMTP: ${sanitizeConnError(err)}` };
  }

  return { ok: true };
}

/**
 * Strip credentials from error messages.
 * @param {unknown} err
 */
function sanitizeConnError(err) {
  let msg = String(err?.message || err || "Connection failed");
  msg = msg.replace(/pass(?:word)?[=:]\s*\S+/gi, "password=[redacted]");
  msg = msg.replace(/auth(?:entication)?[^\n]{0,80}/gi, (m) =>
    /fail|invalid|reject/i.test(m) ? m : "authentication error",
  );
  if (msg.length > 240) msg = `${msg.slice(0, 240)}…`;
  return msg;
}
