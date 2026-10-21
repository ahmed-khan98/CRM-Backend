/**
 * HRMS / shared sendEmail helper.
 * Mailgun disabled — emails go via SMTP (careers@zytronworld.com).
 * Signature kept for existing callers: (fromField, fromemail, to, subject, body)
 */
import nodemailer from "nodemailer";
import { ApiError } from "./ApiError.js";

// ---- Mailgun (disabled) ----
// import formData from "form-data";
// import Mailgun from "mailgun.js";
// const API_KEY = process.env.MAILGUN_API_KEY;
// const mailgun = new Mailgun(formData);
// const mg = mailgun.client({ username: "api", key: API_KEY });
// const sendEmailMailgun = async (fromField, fromemail, email, subject, body) => {
//   const domain = fromemail.split("@")[1];
//   const result = await mg.messages.create(domain, {
//     from: fromField,
//     to: email,
//     subject,
//     html: body,
//   });
//   return result;
// };

function getCareersSmtpConfig() {
  const user =
    process.env.SMTP_USER ||
    process.env.CAREERS_SMTP_USER ||
    process.env.RECRUITMENT_FROM_EMAIL ||
    "careers@zytronworld.com";
  const pass =
    process.env.SMTP_PASS ||
    process.env.CAREERS_SMTP_PASS ||
    process.env.PASSWORD ||
    "";
  const domain = user.includes("@") ? user.split("@")[1] : "zytronworld.com";
  const host =
    process.env.SMTP_HOST ||
    process.env.CAREERS_SMTP_HOST ||
    `mail.${domain}`;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    process.env.SMTP_SECURE != null
      ? process.env.SMTP_SECURE !== "false"
      : port === 465;

  return { user, pass, host, port, secure };
}

const sendEmail = async (fromField, fromemail, email, subject, body) => {
  const { user, pass, host, port, secure } = getCareersSmtpConfig();

  if (!pass) {
    throw new ApiError(
      500,
      "SMTP password not configured (SMTP_PASS / CAREERS_SMTP_PASS)"
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  // Always send as authenticated careers mailbox (host rejects other Froms)
  const from = `"Zytron Careers" <${user}>`;

  try {
    const result = await transporter.sendMail({
      from,
      to: email,
      sender: user,
      replyTo: fromemail || user,
      subject,
      html: body,
    });
    return result;
  } catch (error) {
    console.error("SMTP send error:", error?.message || error);
    throw new ApiError(500, `Failed to send email: ${error.message}`);
  }
};

export { sendEmail };
