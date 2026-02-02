import { Brand } from "../models/brand.model.js";
import { EmailList } from "../models/emailList.model.js";
import { SentEmail } from "../models/sentEmail.model.js";
import { TmEmailList } from "../models/tmEmailList.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadBase64Image } from "../utils/cloudinary.js";
import { createSpoofing } from "../utils/email.js";
import { sendEmail } from "../utils/mailgun.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import formData from "form-data";
import Mailgun from "mailgun.js";
import { extractDomainName } from "../utils/extractDomainName.js";
import { Lead } from "../models/lead.model.js";

const DOMAIN = process.env.MAILGUN_DOMAIN;
const API_KEY = process.env.MAILGUN_API_KEY;
const BATCH_SIZE = 1000;

const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: "api", key: API_KEY });

  const capitalizeName = (str) => {
    if (!str || typeof str !== 'string') return "";
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

const sentSingleEmail = asyncHandler(async (req, res) => {  
  const { fromemail, email, subject, body, leadId, brandId } = req.body;

  if ([fromemail, email, subject, body, brandId].some((field) => !field)) {
    throw new ApiError(400, "All fields are required");
  }

  const existBrand = await Brand?.findById(brandId);

  const lead = await Lead?.findById(leadId);

  if (!existBrand) {
    throw new ApiError(409, "Brand not found");
  }
  console.log(lead,'lead')

  let updatedBody = body;
  const regex = /<img[^>]+src="data:image\/[^;]+;base64,([^">]+)"/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const base64 = match[1];
    const uploadRes = await uploadBase64Image(base64);
    if (uploadRes) {
      updatedBody = updatedBody.replace(
        new RegExp(`data:image/[^;]+;base64,${base64}`, "g"),
        uploadRes.secure_url,
      );
    }
  }

  let personalizedSubject = subject;
  let personalizedBody = updatedBody;

  if (lead) {
    const lName = lead.name || "Valued Customer";
    const lSerial = lead.serialNo || "";
    const lPhone = lead.phoneNo || "";
    const lBrand = lead.brandMark || "";

    const initials = capitalizeName(lName);

    const nameRegex = /\[(name|clientname|customer\s*name|fullname|username)\]/gi;

    personalizedSubject = personalizedSubject.replace(nameRegex, initials);
    personalizedBody = personalizedBody.replace(nameRegex, initials);

    const brandRegex = /\[(mark|brand\s*mark|brandmark|businessname|business|business\s*name)\]/gi;
    personalizedBody = personalizedBody.replace(brandRegex, lBrand);

    const brandNameRegex = /\[(brand|brand\s*name|brandname)\]/gi;
    personalizedBody = personalizedBody.replace(brandNameRegex, existBrand?.name);

    const serialRegex =
      /\[(serialno|serial\s*no|serial\s*number|serialnumber)\]/gi;
    personalizedBody = personalizedBody.replace(serialRegex, lSerial);

    const phoneRegex =
      /\[(phoneno|phone\s*no|phone\s*number|phonenumber|phoneo)\]/gi;
    personalizedBody = personalizedBody.replace(phoneRegex, lPhone);

    const emailRegex = /\[(email|email\s*address)\]/gi;
    personalizedBody = personalizedBody.replace(emailRegex, email || "");
  }

  let sendStatus = "failed";
  try {
    
    const fromField = `${existBrand?.name} <${fromemail}>`;

    await sendEmail(fromField,fromemail, email, personalizedSubject, personalizedBody);
    sendStatus = "sent";
  } catch (error) {
    console.error("Error sending single email:", error);
    throw new ApiError(500, `Failed to send email: ${error.message}`);
  }

  const sentEmailRecord = await SentEmail.create({
    recipients: [email],
    leadId,
    brandId,
    subject: personalizedSubject, // Personalized subject save karein
    body: personalizedBody, // Personalized body save karein
    from: fromemail,
    status: sendStatus,
    type: "SOLO",
    senderId: req?.user?._id,
    departmentId: existBrand?.departmentId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, sentEmailRecord, "Email Sent Successfully"));
});

const getSendEmailByLeadId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 200);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    SentEmail.find({ leadId: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("brandId", "name")
      .populate("senderId", "fullName"),
    SentEmail.countDocuments({ leadId: id }),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const meta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };

  if (!items) {
    throw new ApiError(404, "sending email not found");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, { items, meta }, "All sending email Found"));
});

const getAllBulkEmails = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 200);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    SentEmail.find({ type: "BULK", ...req?.roleFilter })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("listId", "listName")
      .populate("senderId", "fullName")
      .populate("brandId", "name"),
    SentEmail.countDocuments({ type: "BULK", ...req?.roleFilter }),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const meta = {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };

  if (!items) {
    throw new ApiError(404, "Bulk email not found");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, { items, meta }, "All bulk email found"));
});

const sendBulkEmails = asyncHandler(async (req, res) => {
  const { listId, fromemail, subject, body, compaignName, brandId } = req.body;

  if ([fromemail, subject, body, listId].some((field) => !field)) {
    throw new ApiError(400, "All fields are required");
  }

  const existBrand = await Brand?.findById(brandId);

  if (!existBrand) {
    throw new ApiError(409, "Brand not found");
  }

  // --- 1. Image Upload Logic (Jaisa aapka hai) ---
  const imagesToUpload = [];
  const regex = /<img[^>]+src="data:image\/[^;]+;base64,([^">]+)"/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    imagesToUpload.push(match[1]);
  }

  let updatedBody = body;
  for (const base64 of imagesToUpload) {
    const uploadRes = await uploadBase64Image(base64);
    if (uploadRes) {
      // Replace the base64 string with the new Cloudinary URL
      // Ensure you match the original data type (e.g., data:image/jpeg;base64,)
      updatedBody = updatedBody.replace(
        new RegExp(`data:image/[^;]+;base64,${base64}`, "g"),
        uploadRes.secure_url,
      );
    } else {
      // Log or handle failed upload
    }
  }

  // --- 2. Fetch Email List and Prepare Recipients ---
  const emailList = await EmailList.findById(listId);

  if (!emailList) {
    throw new ApiError(404, "List not found");
  }

  // Only unique, valid emails (jo EmailList mein store hain)
  const recipients = Array.from(
    new Set(emailList.emails.map((e) => String(e).trim()).filter(Boolean)),
  );

  if (recipients.length === 0) {
    throw new ApiError(400, "No recipients found in the list.");
  }

  // --- 3. Mailgun Bulk Sending Logic ---
  let allSent = true;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    const recipientVars = batch.reduce((acc, email) => {
      acc[email] = { id: email }; // Example variable
      return acc;
    }, {});

    const domain = fromemail.split("@")[1];

    const senderDisplayName = capitalizeName(existBrand?.name);
    const fromField = `${senderDisplayName} <${fromemail}>`;

    const messageData = {
      from: fromField,
      to: batch.join(","),
      subject: subject,
      html: updatedBody,
      "recipient-variables": JSON.stringify(recipientVars),
      "o:campaign": compaignName || "general-bulk-campaign",
    };
    console.log(batch.join(","), "batch.join(", ")");

    try {
      await mg.messages.create(domain, messageData);
      console.log(
        `Successfully sent batch ${i / BATCH_SIZE + 1} to ${batch.length} recipients.`,
      );
    } catch (error) {
      console.error(
        `Mailgun failed to send batch starting at index ${i}:`,
        error,
      );
      allSent = false;
    }

    // Small delay between large batches (optional, but good practice for huge lists)
    if (i + BATCH_SIZE < recipients.length) await sleep(1000); // 1 second delay
  }

  const sentEmailRecord = await SentEmail.create({
    recipients: emailList.emails,
    from: fromemail,
    compaignName,
    subject: subject,
    body: updatedBody,
    status: allSent ? "sent" : "failed",
    type: "BULK",
    senderId: req?.user?._id,
    listId,
    brandId,
    departmentId: existBrand?.departmentId,
  });

  if (!sentEmailRecord) {
    throw new ApiError(
      500,
      "Failed to create sent email record for bulk campaign",
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sentEmailRecord,
        "Bulk email campaign initiated successfully",
      ),
    );
});

const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const usingSpoofing = asyncHandler(async (req, res) => {
  const { email, subject, body, fromemail } = req.body;
  console.log(email, subject, " to, from, subject, body");
  // Validation
  if (!email || !subject || !body) {
    throw new ApiError(
      400,
      "Missing required fields: to, subject, and body are required",
    );
  }

  if (!validateEmail(email)) {
    throw new ApiError(400, "Invalid recipient email address");
  }

  if (fromemail && !validateEmail(fromemail)) {
    throw new ApiError(400, "Invalid sender email addres");
  }

  const sentALL = await createSpoofing(fromemail, email, subject, body);
  //  createSpoofing(fromemail,email, subject, body);
  if (!sentALL) {
    throw new ApiError(500, "Failed to send email. Please try again later.");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, sentALL, "Email sent successfully"));
});

export {
  sentSingleEmail,
  getSendEmailByLeadId,
  getAllBulkEmails,
  sendBulkEmails,
  usingSpoofing,
};

// const sendBulkEmails = asyncHandler(async (req, res) => {
//   const { listId, fromemail, subject, body, compaignName, brandId } = req.body;

//   if ([fromemail, subject, body, listId].some((field) => !field)) {
//     throw new ApiError(400, "All fields are required");
//   }

//   const imagesToUpload = [];
//   const regex = /<img[^>]+src="data:image\/[^;]+;base64,([^">]+)"/g;
//   let match;
//   while ((match = regex.exec(body)) !== null) {
//     imagesToUpload.push(match[1]);
//   }

//   // Upload each base64 image and replace it with a Cloudinary URL
//   let updatedBody = body;
//   for (const base64 of imagesToUpload) {
//     const uploadRes = await uploadBase64Image(base64);
//     if (uploadRes) {
//       // Replace the base64 string with the new Cloudinary URL
//       updatedBody = updatedBody.replace(
//         `data:image/jpeg;base64,${base64}`,
//         uploadRes.secure_url
//       );
//     } else {
//       // Handle the failed upload (e.g., remove the image tag or show an error)
//     }
//   }

//   const emailList = await EmailList.findById(listId);

//   if (!emailList) {
//     throw new ApiError(404, "List not found");
//   }
//   const recipients = Array.from(
//     new Set(emailList.emails.map((e) => String(e).trim()).filter(Boolean))
//   );

//   let allSent = true;
//   for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
//     const batch = recipients.slice(i, i + BATCH_SIZE);

//     for (const email of batch) {
//       try {
//         await sendEmail(fromemail, email, subject, updatedBody);
//       } catch (error) {
//         console.log(`Failed to send email to ${email}:`, error);
//         allSent = false;
//       }
//     }

//     if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
//   }

//   const sentEmailRecord = await SentEmail.create({
//     recipients: emailList.emails,
//     from: fromemail,
//     compaignName,
//     subject: subject,
//     body: updatedBody,
//     status: allSent ? "sent" : "failed",
//     type: "BULK",
//     listId,
//     brandId,
//   });

//   if (!sentEmailRecord) {
//     throw new ApiError(
//       500,
//       "Failed to create sent email record for bulk campaign"
//     );
//   }

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(200, sentEmailRecord, "Bulk email send successfully")
//     );
// });
