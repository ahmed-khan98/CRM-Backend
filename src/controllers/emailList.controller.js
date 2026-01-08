import { EmailList } from "../models/emailList.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { promises as fsp } from "node:fs";
import xlsx from "xlsx";

import formData from "form-data";
import Mailgun from "mailgun.js";

// const DOMAIN = process.env.MAILGUN_DOMAIN;
// const API_KEY = process.env.MAILGUN_API_KEY;

// Ensure both are set
// if (!DOMAIN || !API_KEY) {
//     console.error("Mailgun environment variables are not set!");
// }

// const mailgun = new Mailgun(formData);
// const mg = mailgun.client({ username: "api", key: API_KEY });

// const importEmailList = asyncHandler(async (req, res) => {
//   if (!req.file) {
//     throw new ApiError(400, "No file uploaded");
//   }

//   const listName = req.body.listName;
//   if (!listName) {
//     throw new ApiError(400, "List name is required");
//   }

//   let buffer;
//   let filePath = req.file.path; // Multer ne file yahan save ki hai

//   try {
//     buffer = await fsp.readFile(filePath);
//   } catch (e) {
//     console.error(e, "Error reading uploaded file");
//     throw new ApiError(400, "Unable to read uploaded file");
//   }

//   // --- File Reading and Extraction (Same as your original code) ---
//   const workbook = xlsx.read(buffer, { type: "buffer" });
//   const sheetName = workbook.SheetNames[0];
//   const sheet = workbook.Sheets[sheetName];

//   const sheetData = xlsx.utils.sheet_to_json(sheet, {
//     header: 1,
//     defval: "",
//     blankrows: false,
//   });

//   if (sheetData.length === 0) {
//     throw new ApiError(400, "No data found in the file");
//   }

//   const headerRow = sheetData[0].map((header) =>
//     typeof header === "string" ? header.toLowerCase().trim() : ""
//   );
//   const emailColIndex = headerRow.findIndex(
//     (h) => h === "email" || h === "email address"
//   );

//   if (emailColIndex === -1) {
//     throw new ApiError(
//       400,
//       "Email or Email Address column not found in the file"
//     );
//   }

//   const rawEmails = sheetData
//     .slice(1)
//     .map((row) => row[emailColIndex])
//     .filter((email) => typeof email === "string" && email.trim() !== "");

//   // --- Duplicate Removal Logic ---
//   const uniqueEmails = [...new Set(rawEmails)];

//   if (uniqueEmails.length === 0) {
//     throw new ApiError(400, "No valid emails found in the file");
//   }

// let validatedEmails = [];
// const MAX_BATCH_SIZE = 50;

// for (let i = 0; i < uniqueEmails.length; i += MAX_BATCH_SIZE) {
//   const batch = uniqueEmails.slice(i, i + MAX_BATCH_SIZE);

//   const validationPromises = batch.map(email =>
//     mg.validate.get(email)
//       .then(result => {
//           return result;
//       })
//       .catch(e => {
//         console.warn(`Validation failed for email ${email}:`, e.message);
//         return null;
//       })
//   );

//   const validationResults = await Promise.all(validationPromises);
//   console.log(validationResults,'validationResults')

//   const validEmailsInBatch = validationResults
//     .filter(item =>
//         item &&
//         item.is_valid &&
//         (item.risk === 'low' || item.risk === 'medium')
//     )
//     .map(item => item.address);

//   validatedEmails.push(...validEmailsInBatch);
// }

//   if (validatedEmails.length === 0) {
//     throw new ApiError(400, "No deliverable emails found after validation.");
//   }

//   const newList = await EmailList.create({
//     listName,
//     emails: validatedEmails
//   });

//   if (filePath) await fsp.unlink(filePath);

//   return res
//     .status(201)
//     .json(
//       new ApiResponse(
//         201,
//         newList,
//         `${validatedEmails.length} emails imported and validated successfully!`
//       )
//     );
// });

const getAllEmailLists = asyncHandler(async (req, res) => {
  const emailLists = await EmailList.aggregate([
    {
      $project: {
        listName: 1,
        emailCount: { $size: "$emails" },
      },
    },
  ]);

  if (!emailLists) {
    throw new ApiError(404, "Email lists not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, emailLists, "All email lists found"));
});

const importEmailList = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }
  
  const {listName} = req.body;
  if (!listName) {
    throw new ApiError(400, "List name is required");
  }
  
  const existedlistName = await EmailList.findOne({ listName });

  if (existedlistName) {
    throw new ApiError(409, "List name already exists");
  }

  let buffer;

  try {
    buffer = await fsp.readFile(req.file.path);
  } catch (e) {
    console.error(e, "Error reading uploaded file");
    throw new ApiError(400, "Unable to read uploaded file");
  }

  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const sheetData = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (sheetData.length === 0) {
    throw new ApiError(400, "No data found in the file");
  }

  const headerRow = sheetData[0].map((header) =>
    typeof header === "string" ? header.toLowerCase().trim() : ""
  );
  const emailColIndex = headerRow.findIndex(
    (h) => h === "email" || h === "email address"
  );

  if (emailColIndex === -1) {
    throw new ApiError(
      400,
      "Email or Email Address column not found in the file"
    );
  }

  const rawEmails = sheetData
    .slice(1)
    .map((row) => row[emailColIndex])
    .filter((email) => typeof email === "string" && email.trim() !== "");

  // --- Duplicate Removal Logic ---
  const uniqueEmails = [...new Set(rawEmails)];

  if (uniqueEmails.length === 0) {
    throw new ApiError(400, "No valid emails found in the file");
  }

  const newList = await EmailList.create({ listName, emails: uniqueEmails });

  if (req.file?.path) await fsp.unlink(req.file.path);

  return res
    .status(201)
    .json(new ApiResponse(201, newList, "Email list imported successfully"));
});

const deleteEmailList = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existEmailList = await EmailList.findById(id);

  if (!existEmailList) {
    throw new ApiError(409, "Email list not found");
  }
  const emailList = await EmailList.findByIdAndDelete(id);

  if (!emailList) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, emailList, "Email list Deleted Successfully"));
});

const getEmailListById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const emailList = await EmailList.findById(id);

  if (!emailList) {
    throw new ApiError(409, "Email list not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, emailList, "Email list found"));
});

export { getAllEmailLists, importEmailList, deleteEmailList, getEmailListById };
