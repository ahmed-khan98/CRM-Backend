import nodemailer from "nodemailer";

const sendEmail = async (fromemail, email, subject, body) => {
  const domain = fromemail.split("@")[1];
  console.log(domain, "domain");
  const transporter = nodemailer.createTransport({
    // host: 'mail.lbuc.education',
    host: `mail.${domain}`,
    port: 465,
    secure: true,
    auth: {
      // user: 'admission@lbuc.education',
      user: fromemail,
      pass: process.env.PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });

  const mailOptions = {
    from: fromemail,
    to: email,
    subject,
    html: body,
  };

  return transporter.sendMail(mailOptions);
};

const generateRandomSender = () => {
  const randomString = Math.random().toString(36).substring(2, 10);
  return `anonymous-${randomString}@anonymousemail.me`;
};

const createSpoofing = async (fromemail,email, subject, body) => {
console.log(fromemail,email, subject, body,'fromemail,email, subject, body')
  const senderEmail = fromemail || generateRandomSender();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: "ahmedkhn015@gmail.com",
      pass: "qlyh fuvv epwa nyia",
    },
  });

  // Email options
  const mailOptions = {
    from: `"Anonymous Sender" <${senderEmail}>`,
    to: email,
    subject: subject,
    text: body,
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="color: white; margin: 0;">Anonymous Email</h2>
          </div>
        </div>
      `,
  };
  return transporter.sendMail(mailOptions);
};

export { sendEmail, createSpoofing };

// user: 'ahmedkhn015@gmail.com',
// pass: "qlyh fuvv epwa nyia",

// user: "info@hnhsofttechsolutions.com",
// pass: "etab ehjp xzrb qnux",

// pass: process.env.PASSWORD,
// pass: process.env.PASSWORD,

// import nodemailer from "nodemailer";

// const sendEmail = async (fromemail, email, subject, body) => {
//  const transporter = nodemailer.createTransport({
//   host: 'smtp.sendgrid.net',
//   port: 587,
//   secure: false,
//   auth: {
//    user: 'apikey',
//    pass: process.env.SENDGRID_API_KEY, // CRITICAL: Use an environment variable
//   },
//  });
//  // ------------------------------------

//  const mailOptions = {
//   from: fromemail,
//   to: email,
//   subject,
//   html: body,
//  };

//  return transporter.sendMail(mailOptions);
// };

// export { sendEmail };

// for sending email from different and dynamic emial address
// import nodemailer from "nodemailer";

// const sendEmail = async (fromemail, email, subject, body, password) => {
//   const domain = fromemail.split("@")[1]; // Extract domain e.g. brandmark-consultancy.com

//   const transporter = nodemailer.createTransport({
//     host: `mail.${domain}`,
//     port: 465, // SSL port
//     secure: true,
//     auth: {
//       user: fromemail,
//       pass: password,
//     },
//     tls: {
//       rejectUnauthorized: false,
//     },
//   });

//   const mailOptions = {
//     from: fromemail,
//     to: email,
//     subject,
//     html: body,
//   };

//   return transporter.sendMail(mailOptions);
// };

// export { sendEmail };
