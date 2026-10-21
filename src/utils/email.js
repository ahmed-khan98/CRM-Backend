import nodemailer from "nodemailer";

/**
 * HRMS SMTP (careers@zytronworld.com). Mailgun not used here.
 */
function getCareersSmtpConfig(fromemail) {
  const user =
    process.env.SMTP_USER ||
    process.env.CAREERS_SMTP_USER ||
    fromemail ||
    "careers@zytronworld.com";
  const pass =
    process.env.SMTP_PASS ||
    process.env.CAREERS_SMTP_PASS ||
    process.env.PASSWORD ||
    "";
  const domain = (user.includes("@") ? user.split("@")[1] : null) ||
    (fromemail && fromemail.includes("@") ? fromemail.split("@")[1] : null) ||
    "zytronworld.com";
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

/**
 * @param {string} fromemail
 * @param {string} email
 * @param {string} subject
 * @param {string} body - HTML body
 * @param {Array<{ filename: string, content: Buffer|string, contentType?: string }>} [attachments]
 */
const sendEmail = async (fromemail, email, subject, body, attachments = []) => {
  const { user, pass, host, port, secure } = getCareersSmtpConfig(fromemail);

  if (!pass) {
    throw new Error("SMTP password not configured (SMTP_PASS)");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  const displayFrom = fromemail || user;
  const mailOptions = {
    from: `"Zytron Payroll" <${displayFrom}>`,
    sender: user,
    replyTo: displayFrom,
    to: email,
    subject,
    html: body,
  };

  if (Array.isArray(attachments) && attachments.length) {
    mailOptions.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || "application/octet-stream",
    }));
  }

  return transporter.sendMail(mailOptions);
};

const generateRandomSender = () => {
  const randomString = Math.random().toString(36).substring(2, 10);
  return `anonymous-${randomString}@anonymousemail.me`;
};

/** Legacy spoof helper — kept but unused by HRMS */
const createSpoofing = async (fromemail, email, subject, body) => {
  console.warn("createSpoofing is deprecated; use careers SMTP sendEmail");
  return sendEmail(
    fromemail || "careers@zytronworld.com",
    email,
    subject,
    body
  );
};

export { sendEmail, createSpoofing, generateRandomSender };
