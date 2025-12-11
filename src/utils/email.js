import nodemailer from "nodemailer";

const sendEmail = async (fromemail, email, subject, body) => {
  const domain = fromemail.split("@")[1]; 
  console.log(domain,'domain')
  const transporter = nodemailer.createTransport({
    // host: 'mail.lbuc.education',
    host: `mail.${domain}`,  
    // 68.181.111.28
    port: 465, 
    auth: {
      // user: 'admission@lbuc.education',
      user: fromemail,
      pass: process.env.PASSWORD,
    },
    tls:{rejectUnauthorized:false}
  });

  const mailOptions = {
    from: fromemail,
    to: email,
    subject,
    html: body,
  };

  return transporter.sendMail(mailOptions);
};

export { sendEmail };

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
