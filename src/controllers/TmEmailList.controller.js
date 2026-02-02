import { TmEmailList } from "../models/tmEmailList.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { promises as fsp } from "node:fs";
import xlsx from "xlsx";


const getAllTmEmailLists = asyncHandler(async (req, res) => {
  const emailLists = await TmEmailList.aggregate([
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

const importTmEmailList = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  
  const { listName } = req.body;
  if (!listName) throw new ApiError(400, "List name is required");
  
  const existedlistName = await TmEmailList.findOne({ listName });
  if (existedlistName) throw new ApiError(409, "List name already exists");

  let buffer;
  try {
    buffer = await fsp.readFile(req.file.path);
  } catch (e) {
    throw new ApiError(400, "Unable to read uploaded file");
  }

  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Header: 1 ka matlab hai humein arrays ka array milega
  const sheetData = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (sheetData.length === 0) throw new ApiError(400, "No data found");

  // --- 1. Header Mapping Logic ---
  const headerRow = sheetData[0].map((h) => String(h).toLowerCase().trim());

  const getColIndex = (keywords) => 
    headerRow.findIndex((h) => keywords.some(k => h.includes(k)));

  // Mapping columns based on your keywords
  const emailIdx = getColIndex(["email", "email address","user email address","user email","customer email","Customer Email","Customer email","CustomerEmail"]);
  const nameIdx = getColIndex(["username", "Name",, "name", "fullname","FullName", "customer name","Customer Name","CustomerName","Customer name","Customer"]);
  const serialIdx = getColIndex(["serialno", "serial no", "serial number","serialNo","Serialno","Serial No","Serial Number","SerialNumber"]);
  const phoneIdx = getColIndex(["phoneno","phoneNo", "phone no","PhoneNo", "phone number","Phone Number","PhoneNumber", "phone","mobile","mobile no","mobile number","number"]);
  const brandIdx = getColIndex(["brandmark","Brandmark", "brand","brand","brandmarks","brand name","Brand Name","BrandName","Brand name"]);

  if (emailIdx === -1) {
    throw new ApiError(400, "Email column is mandatory and was not found.");
  }

  // --- 2. Data Extraction ---
  const formattedData = sheetData
    .slice(1) // Skip header row
    .map((row) => {
      const email = String(row[emailIdx]).trim();
      if (!email) return null;

      return {
        email: email,
        name: nameIdx !== -1 ? String(row[nameIdx]).trim() : "",
        serialno: serialIdx !== -1 ? String(row[serialIdx]).trim() : "",
        phoneno: phoneIdx !== -1 ? String(row[phoneIdx]).trim() : "",
        brandmark: brandIdx !== -1 ? String(row[brandIdx]).trim() : "",
      };
    })
    .filter((item) => item !== null);

  // --- 3. Remove Duplicates based on Email ---
  const uniqueData = Array.from(new Map(formattedData.map(item => [item.email, item])).values());

  if (uniqueData.length === 0) {
    throw new ApiError(400, "No valid data found in the file");
  }

  //     const r = await TmEmailList.bulkWrite(bulkOps, { ordered: false });
  
  // // Database mein store karein
  const newList = await TmEmailList.create({ 
    listName, 
    emails: uniqueData 
  });

  if (req.file?.path) await fsp.unlink(req.file.path);

  return res.status(201).json(new ApiResponse(201, "TM List imported successfully"));
});

const deleteTmEmailList = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existEmailList = await TmEmailList.findById(id);

  if (!existEmailList) {
    throw new ApiError(409, "Email list not found");
  }
  const emailList = await TmEmailList.findByIdAndDelete(id);

  if (!emailList) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, emailList, "TmM Email list Deleted Successfully"));
});

const getTmEmailListById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const emailList = await TmEmailList.findById(id);

  if (!emailList) {
    throw new ApiError(409, "Email list not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, emailList, "TM Email list found"));
});

export { getAllTmEmailLists, deleteTmEmailList, getTmEmailListById,importTmEmailList };
