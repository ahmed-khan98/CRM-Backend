import { Brand } from "../models/brand.model.js";
import { Employee } from "../models/employee.model.js";
import { Lead } from "../models/lead.model.js";
import { LeadComment } from "../models/leadComment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapLastAction, mapPaid } from "../utils/map.js";
import { loose, norm } from "../utils/normalize.js";
import { promises as fsp } from "node:fs";
import { normalizeLastAction } from "../utils/normalizeLastAction.js";
import xlsx from "xlsx";

function findAgentId(agentName, employees, empStrict, empLoose) {
  if (!agentName) return null;
  const s = norm(agentName),
    l = loose(agentName);
  let id = empStrict.get(s) || empLoose.get(l);
  if (id) return id;

  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length) {
    // startsWith / contains on first token
    const t = tokens[0];
    const c1 = employees.filter((e) => {
      const en = norm(e.name);
      return en.startsWith(t) || en.includes(` ${t}`);
    });
    if (c1.length === 1) return c1[0]._id.toString();

    // all tokens must appear
    const c2 = employees.filter((e) => {
      const en = norm(e.name);
      return tokens.every((tt) => en.includes(tt));
    });
    if (c2.length === 1) return c2[0]._id.toString();
  }
  return null;
}

function findBrandInfo(brandName, brands, brandStrict, brandLoose) {
  if (!brandName) return null;
  const s = norm(brandName),
    l = loose(brandName);
  let info = brandStrict.get(s) || brandLoose.get(l);
  if (info) return info;

  // partial contains both ways
  const c = brands.filter((b) => {
    const bn = norm(b.name);
    return bn.includes(s) || s.includes(bn);
  });
  if (c.length === 1) {
    const b = c[0];
    return {
      brandId: b._id.toString(),
      departmentId: b.departmentId?.toString(),
    };
  }
  return null;
}

function buildLeadListFilter(req) {
  const base = { ...req.roleFilter };
  const { search, lastAction, paidStatus, brandId } = req.query;

  if (brandId && brandId !== "all") {
    base.brandId = brandId;
  }

  if (paidStatus && paidStatus !== "all") {
    base.paidStatus = paidStatus;
  }

  if (lastAction && lastAction !== "all") {
    base.lastAction = normalizeLastAction(lastAction);
  }

  if (search?.trim()) {
    const term = search.trim();
    base.$or = [
      { name: { $regex: term, $options: "i" } },
      { email: { $regex: term, $options: "i" } },
      { phoneNo: { $regex: term, $options: "i" } },
      { serialNo: { $regex: term, $options: "i" } },
      { brandMark: { $regex: term, $options: "i" } },
    ];
  }

  return base;
}

const createLead = asyncHandler(async (req, res) => {
  const { name, phoneNo, email, departmentId, brandId, serialNo, brandMark } =
    req.body;
  if (
    [name, phoneNo, email, departmentId, serialNo, brandMark].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existLead = await Lead.findOne({ email });
  if (existLead) {
    throw new ApiError(409, "Lead email already exists");
  }

  const lead = await Lead.create({
    name,
    phoneNo,
    email,
    departmentId,
    agent: req.user._id,
    brandId,
    serialNo,
    brandMark,
  });

  if (!lead) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead Created Successfully"));
});

const importLeadFromExcel = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  let buffer;
  try {
    buffer = await fsp.readFile(req.file.path);
  } catch (e) {
    throw new ApiError(400, "Unable to read uploaded file");
  }

  const wb = xlsx.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });


  const bulkOps = [];
  const skipped = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Excel column names (exact headers)
    const name = r["Customer Name"] || r["Customer name"]|| r["Name"] || r["name"];
    const brandMark = r["Brand Mark"] ||  r["Brand mark"] || r["BrandMark"] || r["mark"] || r["Mark"] || r["brand mark"] || r["brandmark"] || r["company"] || r["companyName"] || r["Company"]  || r["company name"] || r["Company Name"]|| "";
    const serialNo = r["Serial Number"] || r["serial number"] || r["Serial No"] || r["SerialNo"] || r["Serialno"] || r["serialno"]|| r["serial no"] || "";
    const phoneNo = r["Phone Number"] || r["Phone (UI)"] || r["phone number"] ||r["PhoneNo"] ||r["Phone no"] ||r["Phoneno"] ||r["phone no"];
    const email = r["Email"] || r["Email (UI)"] || r["email"];
    const brandName = r["Brand Name"] ||r["BrandName"] || r["Brand"] || r["brand"];

    // const brandInfo = await Brand.findOne({ name: brandName });
    // console.log(brandInfo, 'brandInfo');
   

    const missing = [];
    if (!name) missing.push("Customer Name");
    if (!phoneNo) missing.push("Phone Number");
    if (!brandInfo) missing.push(`Brand not found: "${brandName}"`);

    if (missing.length) {
      skipped.push({ rowNumber: i + 2, reason: missing.join(", "), row: r });
      continue;
    }

    const doc = {
      name,
      brandMark,
      serialNo,
      phoneNo,
      email: email ? norm(email) : undefined,
      agent: req.user._id,
      // brandId: brandInfo.brandId,
      departmentId: req.user.departmentId, 
    };
    if (email) {
      bulkOps.push({
        updateOne: {
          filter: { email: norm(email) },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      });
    } else {
      bulkOps.push({
        updateOne: {
          filter: { serialNo: doc.serialNo, phoneNo: doc.phoneNo },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      });
    }
  }

  let result = { upsertedCount: 0, matchedCount: 0 };

  if (!bulkOps.length) {
    console.warn("All rows skipped. Reasons (first 5):", skipped.slice(0, 5));
  } else {
    const r = await Lead.bulkWrite(bulkOps, { ordered: false });
    console.log(r, "===------------->>>>>r");
    result = {
      upsertedCount: r.upsertedCount ?? 0,
      matchedCount: r.nMatched ?? 0,
    };
  }

  if (req.file?.path) await fsp.unlink(req.file.path);

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Excel File Uploaded Successfully"));
};

const updateActionLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const {
    lastAction,
    lastActionDate,
    scheduleDate,
    lastComment,
    loopFromDate,
    loopToDate,
  } = req.body;

  const existLead = await Lead.findById(leadId);

  if (!existLead) {
    throw new ApiError(409, "Lead not found");
  }

  const LeadData = {
    agent: req.user._id,
    lastAction,
    lastActionDate,
    scheduleDate,
    lastComment,
  };


  const lead = await Lead.findByIdAndUpdate(
    leadId,
    {
      $set: LeadData,
    },
    { new: true }
  );

  if (!lead) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead updated Successfully"));
});

const updateLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    phoneNo,
    email,
    departmentId,
    brandId,
    serialNo,
    brandMark,
    paidStatus,
  } = req.body;

  const existLead = await Lead.findById(id);
  if (!existLead) {
    throw new ApiError(404, "Lead not found");
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phoneNo !== undefined) updates.phoneNo = phoneNo;
  if (email !== undefined) updates.email = email;
  if (departmentId !== undefined) updates.departmentId = departmentId;
  if (brandId !== undefined) updates.brandId = brandId;
  if (serialNo !== undefined) updates.serialNo = serialNo;
  if (brandMark !== undefined) updates.brandMark = brandMark;
  if (paidStatus !== undefined) updates.paidStatus = paidStatus;

  const lead = await Lead.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  )
    .populate("departmentId", "name")
    .populate("brandId", "name")
    .populate("agent", "fullName");

  return res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead updated successfully"));
});

const deleteLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existLead = await Lead.findById(id);

  if (!existLead) {
    throw new ApiError(409, "Lead not found");
  }
  const lead = await Lead.findByIdAndDelete(id);

  if (!lead) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead deleted Successfully"));
});

// const getAllLeads = asyncHandler(async (req, res) => {
//   const leads = await Lead.find()
//     .sort({ createdAt: -1 })
//     .populate("departmentId", "name")
//     .populate("brandId", "name")
//     .populate("agent", "fullName");
//   if (!leads) {
//     throw new ApiError("404", "Lead not found");
//   }
//   return res.status(200).json(new ApiResponse(200, leads, "All Leads found"));
// });

const getAllLeads = asyncHandler(async (req, res) => {

    
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
  const skip = (page - 1) * limit;

  const listFilter = buildLeadListFilter(req);

  const [items, total] = await Promise.all([
    Lead.find(listFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("departmentId", "name")
      .populate("brandId", "name")
      .populate("agent", "fullName")
      .lean(),
    Lead.countDocuments(listFilter),
  ]);

  const leadsWithLastComment = await Promise.all(
    items.map(async (lead) => {
      const lastComment = await LeadComment.findOne({ leadId: lead._id })
        .select("lastComment lastAction createdAt scheduleDate userId")
        .sort({ createdAt: -1 })
        .populate("userId", "fullName")
        .lean();
      return {
        ...lead,
        lastComment: lastComment ? lastComment.lastComment : null,
        lastAction: lastComment ? lastComment.lastAction : lead.lastAction,
        scheduleDate: lastComment ? lastComment.scheduleDate : null,
        lastActionCreateAt: lastComment ? lastComment.createdAt : null,
        userId: lastComment ? lastComment.userId?.fullName : null,
      };
    })
  );

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

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { items: leadsWithLastComment, meta },
        "Leads fetched"
      )
    );
});

const getAllLeadsByBrandId = asyncHandler(async (req, res) => {
  const { brandId } = req?.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
  const skip = (page - 1) * limit;

  const listFilter = buildLeadListFilter(req);
  listFilter.brandId = brandId;

  const [items, total] = await Promise.all([
    Lead.find(listFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("departmentId", "name")
      .populate("brandId", "name")
      .populate("agent", "fullName")
      .lean(),
    Lead.countDocuments(listFilter),
  ]);

  const leadsWithLastComment = await Promise.all(
    items.map(async (lead) => {
      const lastComment = await LeadComment.findOne({ leadId: lead._id })
        .select("lastComment lastAction createdAt")
        .sort({ createdAt: -1 })
        .populate("userId", "username")
        .lean();
      return {
        ...lead,
        lastComment: lastComment ? lastComment.lastComment : null,
        lastAction: lastComment ? lastComment.lastAction : null,
        lastActionCreateAt: lastComment ? lastComment.createdAt : null,
      };
    })
  );

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

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { items: leadsWithLastComment, meta },
        "Leads fetched"
      )
    );
});

const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await Lead.findById(id)
    .populate("departmentId", "name")
    .populate("brandId", "name")
    .populate("agent", "fullName")
    .lean();

  const leadComment = await LeadComment.find({ leadId: id })
    .sort({ createdAt: -1 })
    .populate("userId", "fullName")
    .lean();

  if (!lead) {
    throw new ApiError(404, "Lead not found");
    // return res.status(404).json({ error: 'Lead not found' });
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { ...lead, leadComment }, "Lead Found"));
});

const getLeadByDepartId = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;
  const lead = await Lead.find({ departmentId });
  if (!lead) {
    throw new ApiError(404, "Lead not found");
    // return res.status(404).json({ error: 'Lead not found' });
  }
  return res.status(200).json(new ApiResponse(200, lead, "Lead Found"));
});

export {
  createLead,
  getAllLeads,
  updateLead,
  updateActionLead,
  deleteLead,
  getLeadById,
  getLeadByDepartId,
  importLeadFromExcel,
  getAllLeadsByBrandId,
};
