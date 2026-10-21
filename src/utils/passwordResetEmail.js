import nodemailer from "nodemailer";

// ---- Mailgun (disabled) ----
// import formData from "form-data";
// import Mailgun from "mailgun.js";
// const API_KEY = process.env.MAILGUN_API_KEY;
// const DOMAIN = process.env.MAILGUN_DOMAIN;
// const FROM = process.env.MAILGUN_FROM || ...
// return mg.messages.create(DOMAIN, { from: FROM, to, subject, html });

const SMTP_USER =
  process.env.SMTP_USER ||
  process.env.CAREERS_SMTP_USER ||
  process.env.RECRUITMENT_FROM_EMAIL ||
  "careers@zytronworld.com";
const SMTP_PASS =
  process.env.SMTP_PASS ||
  process.env.CAREERS_SMTP_PASS ||
  process.env.PASSWORD ||
  "";
const SMTP_HOST =
  process.env.SMTP_HOST ||
  process.env.CAREERS_SMTP_HOST ||
  "mail.zytronworld.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

export async function sendPasswordResetEmail(toEmail, code) {
  if (!SMTP_PASS) {
    console.warn(
      `[password-reset] SMTP not configured. Reset code for ${toEmail}: ${code}`
    );
    return { skipped: true };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0f172a;margin:0 0 12px;">Reset your password</h2>
      <p style="color:#475569;line-height:1.5;">Use this code on the reset page. It expires in 15 minutes.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0f172a;margin:24px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:12px;">If you did not request this, ignore this email.</p>
    </div>
  `;

  return transporter.sendMail({
    from: `"Zytron CRM" <${SMTP_USER}>`,
    sender: SMTP_USER,
    to: toEmail,
    subject: "Zytron CRM — Password reset code",
    html,
  });
}
