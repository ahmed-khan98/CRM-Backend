import { Brand } from "../models/brand.model.js";
import { SentEmail } from "../models/sentEmail.model.js";
import { TmEmailList } from "../models/tmEmailList.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadBase64Image } from "../utils/cloudinary.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import formData from "form-data";
import Mailgun from "mailgun.js";
import { extractDomainName } from "../utils/extractDomainName.js";

const DOMAIN = process.env.MAILGUN_DOMAIN;
const API_KEY = process.env.MAILGUN_API_KEY;
const BATCH_SIZE = 1000;

const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: "api", key: API_KEY });

const getAllTmBulkEmails = asyncHandler(async (req, res) => {
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

const sendTmBulkEmails = asyncHandler(async (req, res) => {
  const { listId, fromemail, subject, body, compaignName, brandId } = req.body;

  if ([fromemail, subject, body, listId].some((field) => !field)) {
    throw new ApiError(400, "All fields are required");
  }

  const existBrand = await Brand?.findById(brandId);
  if (!existBrand) {
    throw new ApiError(409, "Brand not found");
  }
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper Function: Name Capitalize karne ke liye (e.g. "ahmed khan" -> "Ahmed Khan")
  const capitalizeName = (str) => {
    if (!str || typeof str !== "string") return "";
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // --- 1. Image Upload Logic ---
  let updatedBody = body;
  const imgRegex = /<img[^>]+src="data:image\/[^;]+;base64,([^">]+)"/g;
  let match;
  while ((match = imgRegex.exec(body)) !== null) {
    const base64 = match[1];
    const uploadRes = await uploadBase64Image(base64);
    if (uploadRes) {
      updatedBody = updatedBody.replace(
        new RegExp(`data:image/[^;]+;base64,${base64}`, "g"),
        uploadRes.secure_url,
      );
    }
  }

  const emailList = await TmEmailList.findById(listId);
  if (!emailList || !emailList.emails || emailList.emails.length === 0) {
    throw new ApiError(404, "List not found or empty.");
  }

  let allSent = true;
  const domain = fromemail.split("@")[1];

  // Sender Display Name Fix: Capitalize Brand Name
  const fromField = `${existBrand?.name} <${fromemail}>`;

  // Regex Patterns
  const nameRegex =
    /\[(name|clientname|customer\s*name|custumer\s*name|fullname|username)\]/gi;
  const brandRegex =
    /\[(brand\s*mark|brandmark|mark|businessname|business|business\s*name)\]/gi;
  const brandNameRegex = /\[(brand\s*name|brandname|brand)\]/gi;
  const serialRegex =
    /\[(serialno|serial\s*no|serial\s*number|serialnumber)\]/gi;
  const phoneRegex =
    /\[(phoneno|phone\s*no|phone\s*number|phonenumber|phoneo)\]/gi;
  const emailRegex = /\[(email|email\s*address)\]/gi;

  let sentCount = 0;
  let failCount = 0;

  for (const recipient of emailList.emails) {

    if (!recipient.email) continue;

    const { name, email, phoneno, serialno, brandmark } = recipient;

    if (!email) continue;

    // Personalization: Capitalize Customer Name
    const formattedName = name ? capitalizeName(name) : "Valued Customer";

    // Replace in Subject
    let personalizedSubject = subject
      .replace(nameRegex, formattedName)
      .replace(brandRegex, brandmark)
      .replace(serialRegex, serialno);

    // Replace in Body
    let personalizedBody = updatedBody
      .replace(nameRegex, formattedName)
      .replace(brandRegex, brandmark || "")
      .replace(brandNameRegex, existBrand?.name || "")
      .replace(serialRegex, serialno || "")
      .replace(phoneRegex, phoneno || "")
      .replace(emailRegex, email || "");

    const messageData = {
      from: fromField,
      to: email.trim(),
      subject: personalizedSubject,
      html: personalizedBody,
      "o:campaign": compaignName || "bulk-campaign",
    };

    try {
      await mg.messages.create(domain, messageData);
      sentCount++;
      console.log(`[${sentCount}] Sent to: ${recipient.email}`);

      await delay(5000);

      console.log(`Email sent to: ${email}`);
    } catch (error) {

      console.error(`Failed for ${recipient.email}:`, error.message);
      failCount++;
      // Agar Mailgun bilkul hi block kar de (420), toh loop rok do
      if (error.status === 420) break;

      console.error(`Mailgun failed for ${email}:`, error);
      allSent = false;
    }
  }

  // --- 4. Create Record ---
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

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sentEmailRecord,
        "Bulk campaign processed successfully",
      ),
    );
});

export { getAllTmBulkEmails, sendTmBulkEmails };
