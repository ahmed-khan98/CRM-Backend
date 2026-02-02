import formData from "form-data";
import Mailgun from "mailgun.js";
import { ApiError } from "./ApiError.js";

// const DOMAIN = process.env.MAILGUN_DOMAIN;
const API_KEY = process.env.MAILGUN_API_KEY;

const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: "api", key: API_KEY });

const sendEmail = async (fromField,fromemail, email, subject, body) => {

  const domain = fromemail.split("@")[1];
  
  const data = {
    from: fromField,
    to: email,
    subject: subject,
    html: body,
  };

  try {
    const result = await mg.messages.create(domain, data);

    // console.log("Mailgun API Success:", result.id);
    return result;
  } catch (error) {
    console.error("Mailgun API Error:", error.details || error.message);
    // Error ko throw karein taaki controller use catch kar sake
    throw new ApiError(500, `Failed to send email: ${error.message}`);
    // throw new Error(
    //   `Mailgun sending failed: ${error.details || error.message}`
    // );
  }
};

export { sendEmail };
// *Is function ko apne controller file mein import karna na bhulein*
