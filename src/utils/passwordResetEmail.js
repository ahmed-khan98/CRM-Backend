import formData from "form-data";
import Mailgun from "mailgun.js";

const API_KEY = process.env.MAILGUN_API_KEY;
const DOMAIN = process.env.MAILGUN_DOMAIN;
const FROM =
  process.env.MAILGUN_FROM ||
  (DOMAIN ? `Zytron CRM <noreply@${DOMAIN}>` : null);

export async function sendPasswordResetEmail(toEmail, code) {
  if (!API_KEY || !DOMAIN || !FROM) {
    console.warn(
      `[password-reset] Mailgun not configured. Reset code for ${toEmail}: ${code}`,
    );
    return { skipped: true };
  }

  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({ username: "api", key: API_KEY });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0f172a;margin:0 0 12px;">Reset your password</h2>
      <p style="color:#475569;line-height:1.5;">Use this code on the reset page. It expires in 15 minutes.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0f172a;margin:24px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:12px;">If you did not request this, ignore this email.</p>
    </div>
  `;

  return mg.messages.create(DOMAIN, {
    from: FROM,
    to: toEmail,
    subject: "Zytron CRM — Password reset code",
    html,
  });
}
