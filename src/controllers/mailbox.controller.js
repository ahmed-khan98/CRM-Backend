import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Brand } from "../models/brand.model.js";
import { Department } from "../models/department.model.js";
import { Domain } from "../models/brandEmail.model.js";
import { Employee } from "../models/employee.model.js";
import { MailboxServerDefaults } from "../models/mailboxServerDefaults.model.js";
import { MailboxAccount } from "../models/mailboxAccount.model.js";
import { MailboxUserAccess } from "../models/mailboxUserAccess.model.js";
import { MailboxScheduled } from "../models/mailboxScheduled.model.js";
import { MailboxSent } from "../models/mailboxSent.model.js";
import { MailboxActivity } from "../models/mailboxActivity.model.js";
import {
  encryptMailboxPassword,
  decryptMailboxPassword,
  sanitizeMailboxDoc,
} from "../utils/mailbox/crypto.js";
import {
  loadActorFromDb,
  requireMappingAccess,
  canAccessMapping,
  canManageCredentials,
  canManageServerSettings,
  canMapAllDepartments,
  scopedBrandIds,
  assertBrandInScope,
  loadMailboxInMappingScope,
  assertCanAssignUser,
  listAssignableUsers,
  isAssignmentDeptAligned,
  actorDepartmentId,
  brandMailboxFilter,
} from "../utils/mailbox/permissions.js";
import { writeMailboxAudit } from "../utils/mailbox/audit.js";
import {
  resolveServerSettings,
  testMailboxConnection,
} from "../utils/mailbox/connectionTest.js";
import {
  serverDefaultsSchema,
  createMailboxSchema,
  updateMailboxSchema,
  testConnectionSchema,
  assignUsersSchema,
  updateAssignmentSchema,
  upsertPersonalMailboxSchema,
} from "../utils/mailbox/schemas.js";
import {
  brandDepartmentEntries,
  brandDepartmentIds,
  brandHasDepartment,
  brandPrimaryDepartmentId,
} from "../utils/brandDepartments.js";

async function getActor(req) {
  return loadActorFromDb(req.user._id);
}

function parseOrThrow(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new ApiError(400, msg || "Invalid input");
  }
  return parsed.data;
}

/**
 * Compare brandEmail.departmentId vs Brand linked departments (report-only).
 * OK when Domain.departmentId is any of the brand's departments (usually primary).
 */
async function findBrandEmailDeptMismatches() {
  const rows = await Domain.find({}).select("email name brandId departmentId").lean();
  const brandIds = [...new Set(rows.map((r) => String(r.brandId)))];
  const brands = await Brand.find({ _id: { $in: brandIds } })
    .select("departmentId departmentIds name")
    .lean();
  const brandMap = new Map(brands.map((b) => [String(b._id), b]));
  const mismatches = [];
  for (const row of rows) {
    const brand = brandMap.get(String(row.brandId));
    if (!brand) continue;
    if (!brandHasDepartment(brand, row.departmentId)) {
      mismatches.push({
        brandEmailId: String(row._id),
        email: row.email,
        brandEmailDepartmentId: String(row.departmentId),
        brandId: String(row.brandId),
        brandName: brand.name,
        brandDepartmentId: String(brandPrimaryDepartmentId(brand) || ""),
      });
    }
  }
  return mismatches;
}

// ─── Server defaults ─────────────────────────────────────────────

export const listServerDefaults = asyncHandler(async (req, res) => {
  // Any logged-in user may read domains (needed for personal mailbox setup).
  // Write/delete remain admin-only.
  await getActor(req);
  const rows = await MailboxServerDefaults.find({}).sort({ domain: 1 }).lean();
  return res
    .status(200)
    .json(new ApiResponse(200, rows, "Server defaults fetched"));
});

export const upsertServerDefaults = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageServerSettings(actor)) {
    throw new ApiError(403, "Only admin can save server settings");
  }
  const data = parseOrThrow(serverDefaultsSchema, req.body);
  const row = await MailboxServerDefaults.findOneAndUpdate(
    { domain: data.domain },
    { $set: data },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await writeMailboxAudit({
    action: "server_defaults_upsert",
    actor,
    meta: { domain: data.domain },
  });
  return res
    .status(200)
    .json(new ApiResponse(200, row, "Server defaults saved"));
});

export const deleteServerDefaults = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageServerSettings(actor)) {
    throw new ApiError(403, "Only admin can delete server settings");
  }

  // Prefer id (path dots in domain names break Express :param matching)
  const id = String(req.params.id || req.query.id || "").trim();
  const domainQ = String(req.query.domain || req.params.domain || "")
    .trim()
    .toLowerCase();

  let row = null;
  if (id) {
    row = await MailboxServerDefaults.findById(id);
  } else if (domainQ) {
    row = await MailboxServerDefaults.findOne({ domain: domainQ });
  }
  if (!row) throw new ApiError(404, "Domain settings not found");

  const domain = row.domain;
  const inUse = await MailboxAccount.countDocuments({
    serverDefaultsId: row._id,
  });
  if (inUse > 0) {
    throw new ApiError(
      409,
      `Cannot delete "${domain}" — ${inUse} mailbox(es) still use it. Reassign or delete those mailboxes first.`,
    );
  }

  await MailboxServerDefaults.deleteOne({ _id: row._id });
  await writeMailboxAudit({
    action: "server_defaults_delete",
    actor,
    meta: { domain, id: String(row._id) },
  });
  return res
    .status(200)
    .json(new ApiResponse(200, { domain, id: String(row._id) }, "Server defaults deleted"));
});

// ─── Mapping list ────────────────────────────────────────────────

export const listMailboxesGrouped = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);

  const brandIds = await scopedBrandIds(actor);
  const mailboxQuery = { ...brandMailboxFilter() };
  if (brandIds) {
    mailboxQuery.brandId = { $in: brandIds };
  }

  const mailboxes = await MailboxAccount.find(mailboxQuery)
    .populate({
      path: "brandId",
      select: "name departmentId departmentIds",
      populate: [
        { path: "departmentId", select: "name" },
        { path: "departmentIds", select: "name" },
      ],
    })
    .populate("serverDefaultsId")
    .sort({ emailAddress: 1 })
    .lean();

  const mailboxIds = mailboxes.map((m) => m._id);
  const accessRows = await MailboxUserAccess.find({
    mailboxId: { $in: mailboxIds },
  })
    .populate("userId", "fullName email departmentId status role")
    .lean();

  const byMailbox = new Map();
  for (const a of accessRows) {
    const key = String(a.mailboxId);
    if (!byMailbox.has(key)) byMailbox.set(key, []);
    const brand = mailboxes.find((m) => String(m._id) === key)?.brandId;
    const aligned = isAssignmentDeptAligned(a.userId, brand);
    byMailbox.get(key).push({
      ...a,
      outOfScope: !aligned,
    });
  }

  // DEP_ADMIN / scoped users: only show under their own department section.
  // ADMIN/SUBADMIN: show shared brand under each linked department (for per-team assign).
  const actorDept = actorDepartmentId(actor);
  const mapAllDepts = canMapAllDepartments(actor);

  const deptMap = new Map();
  for (const m of mailboxes) {
    const brand = m.brandId;
    const entries = brandDepartmentEntries(brand);
    let targets =
      entries.length > 0
        ? entries.map((e) => ({ deptId: e.id, deptName: e.name }))
        : [{ deptId: "unknown", deptName: "Unknown" }];

    if (!mapAllDepts) {
      targets = actorDept
        ? targets.filter((t) => t.deptId === String(actorDept))
        : [];
      // Shared brand in scope but department list empty/mismatch — still show under actor dept
      if (!targets.length && actorDept) {
        const own = entries.find((e) => e.id === String(actorDept));
        targets = [
          {
            deptId: String(actorDept),
            deptName: own?.name || "My department",
          },
        ];
      }
    }

    for (const { deptId, deptName } of targets) {
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          departmentId: deptId,
          departmentName: deptName,
          brands: new Map(),
        });
      }
      const d = deptMap.get(deptId);
      const brandId = String(brand?._id || m.brandId);
      if (!d.brands.has(brandId)) {
        d.brands.set(brandId, {
          brandId,
          brandName: brand?.name || "Unknown",
          departmentIds: entries.map((e) => e.id),
          departmentNames: entries.map((e) => e.name),
          mailboxes: [],
        });
      }
      let assignments = byMailbox.get(String(m._id)) || [];
      // DEP_ADMIN counts / lists only own-department assignees on shared brands
      if (!mapAllDepts && actorDept) {
        assignments = assignments.filter((a) => {
          const ud =
            a.userId?.departmentId?._id || a.userId?.departmentId;
          return String(ud) === String(actorDept);
        });
      }
      // Avoid duplicating same mailbox object reference issues — push once per dept group
      if (
        !d.brands
          .get(brandId)
          .mailboxes.some((mb) => String(mb._id) === String(m._id))
      ) {
        d.brands.get(brandId).mailboxes.push({
          ...sanitizeMailboxDoc(m),
          assignedCount: assignments.length,
          outOfScopeCount: assignments.filter((a) => a.outOfScope).length,
          status: !m.isActive
            ? "disabled"
            : m.lastError
              ? "error"
              : m.lastConnectedAt
                ? "connected"
                : "unknown",
        });
      }
    }
  }

  const grouped = [...deptMap.values()].map((d) => ({
    departmentId: d.departmentId,
    departmentName: d.departmentName,
    brands: [...d.brands.values()],
  }));

  const mismatches = await findBrandEmailDeptMismatches();
  if (mismatches.length) {
    console.warn(
      `[mailbox] brandEmail.departmentId mismatches vs Brand.departmentId: ${mismatches.length}`,
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { grouped, brandEmailDeptMismatches: mismatches },
      "Mailboxes fetched",
    ),
  );
});

export const listBrandEmailsForPicker = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can pick Brand Email rows for mailboxes");
  }

  const rows = await Domain.find({})
    .populate("brandId", "name departmentId departmentIds")
    .select("name email brandId departmentId")
    .lean();

  const brandIds = await scopedBrandIds(actor);
  const filtered = brandIds
    ? rows.filter((r) => brandIds.includes(String(r.brandId?._id || r.brandId)))
    : rows;

  const mismatches = [];
  const data = filtered.map((r) => {
    const brand = r.brandId;
    const brandDept = brandPrimaryDepartmentId(brand);
    const mismatch = brand && !brandHasDepartment(brand, r.departmentId);
    if (mismatch) {
      mismatches.push({
        brandEmailId: String(r._id),
        email: r.email,
        brandEmailDepartmentId: String(r.departmentId),
        brandDepartmentId: String(brandDept || ""),
      });
    }
    return {
      _id: r._id,
      name: r.name,
      email: r.email,
      brandId: brand?._id || r.brandId,
      brandName: brand?.name,
      brandDepartmentId: brandDept,
      brandDepartmentIds: brandDepartmentIds(brand).map(String),
      brandEmailDepartmentId: r.departmentId,
      departmentMismatch: Boolean(mismatch),
    };
  });

  return res.status(200).json(
    new ApiResponse(200, { rows: data, mismatches }, "Brand emails for picker"),
  );
});

export const listBrandsForMapping = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const brandIds = await scopedBrandIds(actor);
  const query = brandIds ? { _id: { $in: brandIds } } : {};
  const brands = await Brand.find(query)
    .select("name departmentId departmentIds")
    .populate("departmentId", "name")
    .populate("departmentIds", "name")
    .sort({ name: 1 })
    .lean();
  return res.status(200).json(new ApiResponse(200, brands, "Brands fetched"));
});

export const listDepartmentsForMapping = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canMapAllDepartments(actor)) {
    const deptId = actorDepartmentId(actor);
    const dept = await Department.findById(deptId).select("name").lean();
    return res
      .status(200)
      .json(new ApiResponse(200, dept ? [dept] : [], "Departments fetched"));
  }
  const depts = await Department.find({}).select("name").sort({ name: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, depts, "Departments fetched"));
});

// ─── Create / update / test mailbox ──────────────────────────────

async function resolveDefaultsFromBody(data) {
  if (data.serverDefaultsId) {
    const d = await MailboxServerDefaults.findById(data.serverDefaultsId);
    if (!d) throw new ApiError(404, "Server defaults not found");
    return d;
  }
  const domain =
    data.domain ||
    String(data.emailAddress || "")
      .split("@")[1]
      ?.toLowerCase();
  if (!domain) throw new ApiError(400, "domain is required");
  let d = await MailboxServerDefaults.findOne({ domain });
  if (!d) {
    throw new ApiError(
      400,
      `No server defaults for domain "${domain}". Save server settings first.`,
    );
  }
  return d;
}

export const testConnection = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  const data = parseOrThrow(testConnectionSchema, req.body);

  let password = data.password;
  let loginUsername = data.loginUsername;
  let defaults;

  if (data.mailboxId) {
    const mailbox = await MailboxAccount.findById(data.mailboxId).select(
      "+encryptedPassword",
    );
    if (!mailbox) throw new ApiError(404, "Mailbox not found");

    if (mailbox.kind === "personal") {
      const isOwner = String(mailbox.ownerUserId) === String(actor._id);
      if (!isOwner && !canManageCredentials(actor)) {
        throw new ApiError(403, "Not allowed to test this company email");
      }
    } else {
      requireMappingAccess(actor);
      if (!canManageCredentials(actor)) {
        throw new ApiError(403, "Only admin can test mailbox connections");
      }
      await assertBrandInScope(actor, mailbox.brandId);
    }

    defaults = await MailboxServerDefaults.findById(mailbox.serverDefaultsId);
    loginUsername = data.loginUsername || mailbox.loginUsername;
    if (!password) {
      password = decryptMailboxPassword(mailbox.encryptedPassword);
    }
    const settings = resolveServerSettings(defaults, {
      imapHost: data.imapHost ?? mailbox.imapHost,
      imapPort: data.imapPort ?? mailbox.imapPort,
      imapSecure: data.imapSecure ?? mailbox.imapSecure,
      smtpHost: data.smtpHost ?? mailbox.smtpHost,
      smtpPort: data.smtpPort ?? mailbox.smtpPort,
      smtpSecure: data.smtpSecure ?? mailbox.smtpSecure,
    });
    const result = await testMailboxConnection({
      loginUsername,
      password,
      ...settings,
    });
    if (result.ok) {
      await MailboxAccount.updateOne(
        { _id: mailbox._id },
        { $set: { lastError: null, lastConnectedAt: new Date() } },
      );
    } else {
      await MailboxAccount.updateOne(
        { _id: mailbox._id },
        { $set: { lastError: result.error } },
      );
    }
    return res
      .status(200)
      .json(new ApiResponse(200, result, result.ok ? "Connection OK" : "Connection failed"));
  }

  // Ad-hoc test (new brand mailbox OR new personal company email)
  const canMapCreds = canManageCredentials(actor);
  const canAccessMap = canAccessMapping(actor);
  if (!canMapCreds) {
    // Regular users may only ad-hoc-test when providing domain+password (personal setup)
    if (!data.domain || !data.password) {
      throw new ApiError(403, "Only admin can test mailbox connections");
    }
  } else if (!canAccessMap) {
    throw new ApiError(403, "Only admin can test mailbox connections");
  }

  defaults = await resolveDefaultsFromBody(data);
  const settings = resolveServerSettings(defaults, data);
  const result = await testMailboxConnection({
    loginUsername,
    password,
    ...settings,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, result.ok ? "Connection OK" : "Connection failed"));
});

export const createMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can create mailboxes");
  }
  const data = parseOrThrow(createMailboxSchema, req.body);
  await assertBrandInScope(actor, data.brandId);

  const brand = await Brand.findById(data.brandId).select(
    "departmentId departmentIds name",
  );
  if (!brand) throw new ApiError(404, "Brand not found");

  if (data.brandEmailId) {
    const be = await Domain.findById(data.brandEmailId).lean();
    if (!be) throw new ApiError(404, "Brand Email row not found");
  }

  const defaults = await resolveDefaultsFromBody(data);
  const loginUsername = data.loginUsername || data.emailAddress;

  const test = await testMailboxConnection({
    loginUsername,
    password: data.password,
    ...resolveServerSettings(defaults, data),
  });
  if (!test.ok) {
    throw new ApiError(400, `Connection test failed: ${test.error}`);
  }

  const encryptedPassword = encryptMailboxPassword(data.password);
  let created;
  try {
    created = await MailboxAccount.create({
      kind: "brand",
      ownerUserId: null,
      brandId: data.brandId,
      brandEmailId: data.brandEmailId || null,
      emailAddress: data.emailAddress,
      loginUsername,
      displayName: data.displayName || "",
      serverDefaultsId: defaults._id,
      imapHost: data.imapHost ?? null,
      imapPort: data.imapPort ?? null,
      imapSecure: data.imapSecure ?? null,
      smtpHost: data.smtpHost ?? null,
      smtpPort: data.smtpPort ?? null,
      smtpSecure: data.smtpSecure ?? null,
      encryptedPassword,
      isActive: true,
      lastError: null,
      lastConnectedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, "Mailbox already exists for this brand/address");
    }
    throw err;
  }

  await writeMailboxAudit({
    action: "mailbox_create",
    actor,
    mailboxId: created._id,
    meta: { emailAddress: created.emailAddress },
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, sanitizeMailboxDoc(created), "Mailbox created"),
    );
});

export const updateMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can edit mailboxes");
  }
  const data = parseOrThrow(updateMailboxSchema, req.body);
  const { mailbox } = await loadMailboxInMappingScope(actor, req.params.id, {
    forCredentials: true,
  });

  const full = await MailboxAccount.findById(mailbox._id).select(
    "+encryptedPassword",
  );
  if (data.displayName !== undefined) full.displayName = data.displayName;
  if (data.loginUsername !== undefined) full.loginUsername = data.loginUsername;
  if (data.isActive !== undefined) full.isActive = data.isActive;
  if (data.brandEmailId !== undefined) full.brandEmailId = data.brandEmailId;
  for (const k of [
    "imapHost",
    "imapPort",
    "imapSecure",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
  ]) {
    if (data[k] !== undefined) full[k] = data[k];
  }

  if (data.password) {
    full.encryptedPassword = encryptMailboxPassword(data.password);
  }

  if (data.password || data.loginUsername) {
    const defaults = await MailboxServerDefaults.findById(full.serverDefaultsId);
    const pwd = data.password
      ? data.password
      : decryptMailboxPassword(full.encryptedPassword);
    const test = await testMailboxConnection({
      loginUsername: full.loginUsername,
      password: pwd,
      ...resolveServerSettings(defaults, full),
    });
    if (!test.ok) {
      full.lastError = test.error;
      throw new ApiError(400, `Connection test failed: ${test.error}`);
    }
    full.lastError = null;
    full.lastConnectedAt = new Date();
  }

  await full.save();
  await writeMailboxAudit({
    action: data.password ? "mailbox_password_replace" : "mailbox_update",
    actor,
    mailboxId: full._id,
    meta: { isActive: full.isActive },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, sanitizeMailboxDoc(full), "Mailbox updated"));
});

export const deleteMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can delete mailboxes");
  }
  const { mailbox } = await loadMailboxInMappingScope(actor, req.params.id, {
    forCredentials: true,
  });

  const mailboxId = mailbox._id;
  const emailAddress = mailbox.emailAddress;

  await Promise.all([
    MailboxUserAccess.deleteMany({ mailboxId }),
    MailboxScheduled.deleteMany({ mailboxId }),
    MailboxSent.deleteMany({ mailboxId }),
    MailboxActivity.deleteMany({ mailboxId }),
  ]);
  await MailboxAccount.deleteOne({ _id: mailboxId });

  await writeMailboxAudit({
    action: "mailbox_delete",
    actor,
    mailboxId,
    meta: { emailAddress },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { id: String(mailboxId), emailAddress }, "Mailbox deleted"));
});

// ─── Assignments ─────────────────────────────────────────────────

export const getMailboxAssignments = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const { mailbox, brand } = await loadMailboxInMappingScope(
    actor,
    req.params.id,
  );

  const rows = await MailboxUserAccess.find({ mailboxId: mailbox._id })
    .populate("userId", "fullName email departmentId role status designation")
    .populate("assignedBy", "fullName")
    .lean();

  let data = rows.map((r) => ({
    ...r,
    outOfScope: !isAssignmentDeptAligned(r.userId, brand),
  }));

  // DEP_ADMIN: only see assignees from own department (shared brand mailboxes)
  if (!canMapAllDepartments(actor)) {
    const actorDept = actorDepartmentId(actor);
    data = data.filter((r) => {
      const ud = r.userId?.departmentId?._id || r.userId?.departmentId;
      return actorDept && String(ud) === String(actorDept);
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, data, "Assignments fetched"));
});

export const assignUsersToMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const data = parseOrThrow(assignUsersSchema, req.body);
  const { mailbox, brand } = await loadMailboxInMappingScope(
    actor,
    req.params.id,
  );

  const results = [];
  for (const item of data.assignments) {
    const target = await Employee.findById(item.userId);
    assertCanAssignUser(actor, brand, target);

    const row = await MailboxUserAccess.findOneAndUpdate(
      { userId: item.userId, mailboxId: mailbox._id },
      {
        $set: {
          permission: item.permission,
          assignedBy: actor._id,
        },
        $setOnInsert: {
          userId: item.userId,
          mailboxId: mailbox._id,
        },
      },
      { upsert: true, new: true },
    );

    await writeMailboxAudit({
      action: "mailbox_assign",
      actor,
      mailboxId: mailbox._id,
      targetUserId: item.userId,
      meta: { permission: item.permission },
    });
    results.push(row);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Users assigned"));
});

export const updateAssignment = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const data = parseOrThrow(updateAssignmentSchema, req.body);
  const { mailbox, brand } = await loadMailboxInMappingScope(
    actor,
    req.params.id,
  );

  const access = await MailboxUserAccess.findOne({
    mailboxId: mailbox._id,
    userId: req.params.userId,
  });
  if (!access) throw new ApiError(404, "Assignment not found");

  const target = await Employee.findById(req.params.userId);
  assertCanAssignUser(actor, brand, target);

  access.permission = data.permission;
  access.assignedBy = actor._id;
  await access.save();

  await writeMailboxAudit({
    action: "mailbox_assignment_update",
    actor,
    mailboxId: mailbox._id,
    targetUserId: req.params.userId,
    meta: { permission: data.permission },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, access, "Assignment updated"));
});

export const removeAssignment = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const { mailbox, brand } = await loadMailboxInMappingScope(
    actor,
    req.params.id,
  );

  const target = await Employee.findById(req.params.userId);
  // Admin/subadmin: can remove anyone. DEP_ADMIN: only own-department users.
  if (!canMapAllDepartments(actor)) {
    const actorDept = actorDepartmentId(actor);
    if (!brandHasDepartment(brand, actorDept)) {
      throw new ApiError(403, "Outside your department scope");
    }
    const targetDept = target?.departmentId?._id || target?.departmentId;
    if (!target || String(targetDept) !== String(actorDept)) {
      throw new ApiError(
        403,
        "You can only remove users from your own department",
      );
    }
  }

  const deleted = await MailboxUserAccess.findOneAndDelete({
    mailboxId: mailbox._id,
    userId: req.params.userId,
  });
  if (!deleted) throw new ApiError(404, "Assignment not found");

  await writeMailboxAudit({
    action: "mailbox_unassign",
    actor,
    mailboxId: mailbox._id,
    targetUserId: req.params.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { removed: true }, "Assignment removed"));
});

export const listUsersForAssign = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);
  const users = await listAssignableUsers(actor, {
    departmentId: req.query.departmentId,
    search: req.query.search,
  });
  return res.status(200).json(new ApiResponse(200, users, "Users fetched"));
});

/** By-user view: all assignments for one user within actor scope */
export const getAssignmentsByUser = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);

  const target = await Employee.findById(req.params.userId)
    .select("fullName email departmentId role status")
    .populate("departmentId", "name")
    .lean();
  if (!target) throw new ApiError(404, "User not found");

  if (!canMapAllDepartments(actor)) {
    if (String(target.departmentId?._id || target.departmentId) !== actorDepartmentId(actor)) {
      throw new ApiError(403, "User is outside your department scope");
    }
  }

  const brandIds = await scopedBrandIds(actor);
  const mailboxQuery = { ...brandMailboxFilter() };
  if (brandIds) mailboxQuery.brandId = { $in: brandIds };
  const scopedMailboxes = await MailboxAccount.find(mailboxQuery)
    .select("_id")
    .lean();
  const scopedIds = scopedMailboxes.map((m) => m._id);

  const rows = await MailboxUserAccess.find({
    userId: target._id,
    mailboxId: { $in: scopedIds },
  })
    .populate({
      path: "mailboxId",
      populate: {
        path: "brandId",
        select: "name departmentId departmentIds",
        populate: [
          { path: "departmentId", select: "name" },
          { path: "departmentIds", select: "name" },
        ],
      },
    })
    .lean();

  const data = rows.map((r) => ({
    ...r,
    outOfScope: !isAssignmentDeptAligned(target, r.mailboxId?.brandId),
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      { user: target, assignments: data },
      "User assignments fetched",
    ),
  );
});

export const setUserAssignments = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  requireMappingAccess(actor);

  const raw = req.body?.assignments;
  if (!Array.isArray(raw) || !raw.length) {
    throw new ApiError(400, "assignments required");
  }

  const target = await Employee.findById(req.params.userId);
  if (!target) throw new ApiError(404, "User not found");

  const results = [];
  for (const item of raw) {
    if (
      !item.mailboxId ||
      !["read", "read_send", "manage"].includes(item.permission)
    ) {
      throw new ApiError(400, "Each assignment needs mailboxId and permission");
    }
    const { mailbox, brand } = await loadMailboxInMappingScope(
      actor,
      item.mailboxId,
    );
    assertCanAssignUser(actor, brand, target);

    const row = await MailboxUserAccess.findOneAndUpdate(
      { userId: target._id, mailboxId: mailbox._id },
      {
        $set: { permission: item.permission, assignedBy: actor._id },
        $setOnInsert: { userId: target._id, mailboxId: mailbox._id },
      },
      { upsert: true, new: true },
    );
    await writeMailboxAudit({
      action: "mailbox_assign",
      actor,
      mailboxId: mailbox._id,
      targetUserId: target._id,
      meta: { permission: item.permission, via: "by_user" },
    });
    results.push(row);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, results, "User assignments saved"));
});

// ─── Personal / company mailbox (1 per user, no brand) ───────────

export const getMyPersonalMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  const targetUserId = req.query.userId
    ? String(req.query.userId)
    : String(actor._id);

  if (
    targetUserId !== String(actor._id) &&
    !canManageCredentials(actor)
  ) {
    throw new ApiError(403, "Only admin can view another user's company email");
  }

  const row = await MailboxAccount.findOne({
    kind: "personal",
    ownerUserId: targetUserId,
  })
    .populate("serverDefaultsId")
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      row ? sanitizeMailboxDoc(row) : null,
      row ? "Personal mailbox fetched" : "No personal mailbox",
    ),
  );
});

export const listPersonalMailboxes = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can list company emails");
  }
  const rows = await MailboxAccount.find({ kind: "personal" })
    .populate({
      path: "ownerUserId",
      select: "fullName email departmentId status",
      populate: { path: "departmentId", select: "name" },
    })
    .populate("serverDefaultsId", "domain")
    .sort({ emailAddress: 1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      rows.map((r) => sanitizeMailboxDoc(r)),
      "Company emails fetched",
    ),
  );
});

export const upsertMyPersonalMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  if (!canManageCredentials(actor)) {
    throw new ApiError(
      403,
      "Only admin can create or update company emails",
    );
  }
  const data = parseOrThrow(upsertPersonalMailboxSchema, req.body);
  if (!data.userId) {
    throw new ApiError(400, "userId is required — pick the employee");
  }

  const target = await Employee.findById(data.userId)
    .select("_id status")
    .lean();
  if (!target) throw new ApiError(404, "User not found");
  if (target.status === "de active" || target.status === "block") {
    throw new ApiError(400, "Cannot set mailbox for inactive user");
  }
  const ownerId = target._id;

  const existing = await MailboxAccount.findOne({
    kind: "personal",
    ownerUserId: ownerId,
  }).select("+encryptedPassword");

  if (!existing && !data.password) {
    throw new ApiError(400, "Password is required to create company email");
  }

  const defaults = await resolveDefaultsFromBody(data);
  const loginUsername = data.loginUsername || data.emailAddress;
  const passwordPlain = data.password
    ? data.password
    : existing
      ? decryptMailboxPassword(existing.encryptedPassword)
      : null;

  const test = await testMailboxConnection({
    loginUsername,
    password: passwordPlain,
    ...resolveServerSettings(defaults, data),
  });
  if (!test.ok) {
    throw new ApiError(400, `Connection test failed: ${test.error}`);
  }

  let saved;
  try {
    if (existing) {
      existing.kind = "personal";
      existing.ownerUserId = ownerId;
      existing.brandId = null;
      existing.brandEmailId = null;
      existing.emailAddress = data.emailAddress;
      existing.loginUsername = loginUsername;
      existing.displayName =
        data.displayName !== undefined
          ? data.displayName
          : existing.displayName || "";
      existing.serverDefaultsId = defaults._id;
      if (data.imapHost !== undefined) existing.imapHost = data.imapHost;
      if (data.imapPort !== undefined) existing.imapPort = data.imapPort;
      if (data.imapSecure !== undefined) existing.imapSecure = data.imapSecure;
      if (data.smtpHost !== undefined) existing.smtpHost = data.smtpHost;
      if (data.smtpPort !== undefined) existing.smtpPort = data.smtpPort;
      if (data.smtpSecure !== undefined) existing.smtpSecure = data.smtpSecure;
      if (data.isActive !== undefined) existing.isActive = data.isActive;
      if (data.password) {
        existing.encryptedPassword = encryptMailboxPassword(data.password);
      }
      existing.lastError = null;
      existing.lastConnectedAt = new Date();
      saved = await existing.save();
    } else {
      saved = await MailboxAccount.create({
        kind: "personal",
        ownerUserId: ownerId,
        brandId: null,
        brandEmailId: null,
        emailAddress: data.emailAddress,
        loginUsername,
        displayName: data.displayName || "",
        serverDefaultsId: defaults._id,
        imapHost: data.imapHost ?? null,
        imapPort: data.imapPort ?? null,
        imapSecure: data.imapSecure ?? null,
        smtpHost: data.smtpHost ?? null,
        smtpPort: data.smtpPort ?? null,
        smtpSecure: data.smtpSecure ?? null,
        encryptedPassword: encryptMailboxPassword(data.password),
        isActive: data.isActive ?? true,
        lastError: null,
        lastConnectedAt: new Date(),
      });
    }
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        "This user already has a company email, or address conflicts",
      );
    }
    throw err;
  }

  await writeMailboxAudit({
    action: existing ? "personal_mailbox_update" : "personal_mailbox_create",
    actor,
    mailboxId: saved._id,
    targetUserId: ownerId,
    meta: { emailAddress: saved.emailAddress, kind: "personal" },
  });

  return res
    .status(existing ? 200 : 201)
    .json(
      new ApiResponse(
        existing ? 200 : 201,
        sanitizeMailboxDoc(saved),
        existing ? "Company email updated" : "Company email created",
      ),
    );
});

export const deleteMyPersonalMailbox = asyncHandler(async (req, res) => {
  const actor = await getActor(req);
  if (!canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can delete company emails");
  }

  const id = String(req.query.id || req.params.id || "").trim();
  const targetUserId = String(req.query.userId || "").trim();

  let row = null;
  if (id) {
    row = await MailboxAccount.findOne({ _id: id, kind: "personal" });
  } else if (targetUserId) {
    row = await MailboxAccount.findOne({
      kind: "personal",
      ownerUserId: targetUserId,
    });
  }
  if (!row) throw new ApiError(404, "Company email not found");
  const ownerRef = row.ownerUserId;

  const mailboxId = row._id;
  await Promise.all([
    MailboxUserAccess.deleteMany({ mailboxId }),
    MailboxScheduled.deleteMany({ mailboxId }),
    MailboxSent.deleteMany({ mailboxId }),
    MailboxActivity.deleteMany({ mailboxId }),
  ]);
  await MailboxAccount.deleteOne({ _id: mailboxId });

  await writeMailboxAudit({
    action: "personal_mailbox_delete",
    actor,
    mailboxId,
    targetUserId: ownerRef,
    meta: { emailAddress: row.emailAddress },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { id: String(mailboxId) }, "Company email deleted"));
});
