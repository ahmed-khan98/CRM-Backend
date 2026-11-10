import { Brand } from "../../models/brand.model.js";
import { Employee } from "../../models/employee.model.js";
import { MailboxAccount } from "../../models/mailboxAccount.model.js";
import { MailboxUserAccess } from "../../models/mailboxUserAccess.model.js";
import { ApiError } from "../ApiError.js";
import {
  brandHasDepartment,
  brandQueryForDepartment,
} from "../brandDepartments.js";
import { withHiddenEmployeesExcluded } from "../hiddenEmployees.js";

/** @typedef {"ADMIN"|"SUBADMIN"|"DEP_ADMIN"|"USER"|"HR_ADMIN"|"FINANCE_ADMIN"} MailboxRole */
/** @typedef {"read"|"read_send"|"manage"} MailboxPermission */

/**
 * Central role helpers for the mailbox module.
 * SUBADMIN scope is intentionally mirrored from ADMIN for mapping —
 * change `canMapAllDepartments` later if subadmin should be narrowed.
 *
 * Assignment control vs mailbox permission levels
 * -----------------------------------------------
 * - Creating/updating/removing *who* can access a mailbox is controlled by
 *   mapping roles only: ADMIN, SUBADMIN, DEP_ADMIN (see requireMappingAccess /
 *   assertCanAssignUser). Mailbox assignment permission `manage` is NOT
 *   required for those mapping APIs and is intentionally unused there.
 * - Mailbox permission levels for *mail content*:
 *   - `read` — read folders/messages/attachments/CRM link
 *   - `read_send` — send, draft, schedule, move, spam, move-to-Bin
 *   - `manage` — same as read_send, PLUS permanent delete / expunge from Bin
 */

export function mailboxRole(user) {
  return String(user?.role || "").toUpperCase();
}

export function isMailboxAdmin(user) {
  return mailboxRole(user) === "ADMIN";
}

/** Can open Email Mapping page */
export function canAccessMapping(user) {
  return ["ADMIN", "SUBADMIN", "DEP_ADMIN"].includes(mailboxRole(user));
}

/** Create/edit mailbox credentials — ADMIN + SUBADMIN (mapping parity) */
export function canManageCredentials(user) {
  return ["ADMIN", "SUBADMIN"].includes(mailboxRole(user));
}

export function canManageServerSettings(user) {
  return isMailboxAdmin(user);
}

/** Admin + subadmin can map across all departments (easy to tighten later) */
export function canMapAllDepartments(user) {
  return ["ADMIN", "SUBADMIN"].includes(mailboxRole(user));
}

export function actorDepartmentId(user) {
  const id = user?.departmentId?._id || user?.departmentId;
  return id ? String(id) : null;
}

/**
 * Reload employee from DB so role/department changes apply immediately.
 * @param {string|import("mongoose").Types.ObjectId} userId
 */
export async function loadActorFromDb(userId) {
  const actor = await Employee.findById(userId).select(
    "role departmentId fullName email status",
  );
  if (!actor || actor.status === "de active" || actor.status === "block") {
    throw new ApiError(401, "Unauthorized");
  }
  return actor;
}

/**
 * Brand IDs the actor may see/manage in mapping.
 * @param {import("mongoose").Document} actor
 * @returns {Promise<string[]|null>} null = all brands
 */
export async function scopedBrandIds(actor) {
  if (canMapAllDepartments(actor)) return null;
  const deptId = actorDepartmentId(actor);
  if (!deptId) return [];
  const brands = await Brand.find(brandQueryForDepartment(deptId))
    .select("_id")
    .lean();
  return brands.map((b) => String(b._id));
}

/**
 * @param {import("mongoose").Document} actor
 * @param {string|import("mongoose").Types.ObjectId} brandId
 */
export async function assertBrandInScope(actor, brandId) {
  if (canMapAllDepartments(actor)) return;
  const deptId = actorDepartmentId(actor);
  const brand = await Brand.findById(brandId)
    .select("departmentId departmentIds")
    .lean();
  if (!brand) throw new ApiError(404, "Brand not found");
  if (!brandHasDepartment(brand, deptId)) {
    throw new ApiError(403, "Brand is outside your department scope");
  }
}

/**
 * Load mailbox + brand; enforce mapping scope for manage/list.
 * @param {import("mongoose").Document} actor
 * @param {string} mailboxId
 * @param {{ forCredentials?: boolean }} [opts]
 */
export async function loadMailboxInMappingScope(actor, mailboxId, opts = {}) {
  if (opts.forCredentials && !canManageCredentials(actor)) {
    throw new ApiError(403, "Only admin can manage mailbox credentials");
  }
  const mailbox = await MailboxAccount.findById(mailboxId);
  if (!mailbox) throw new ApiError(404, "Mailbox not found");
  if (mailbox.kind === "personal") {
    throw new ApiError(
      400,
      "Personal company mailboxes are managed under My company email, not Email Mapping",
    );
  }
  await assertBrandInScope(actor, mailbox.brandId);
  const brand = await Brand.findById(mailbox.brandId)
    .select("name departmentId departmentIds")
    .lean();
  if (!brand) throw new ApiError(404, "Brand not found for mailbox");
  return { mailbox, brand };
}

/**
 * Assignment is "in scope" when the assignee's department is one of the
 * brand's linked departments (shared brand across teams).
 * @param {{ departmentId?: unknown }} user
 * @param {{ departmentId?: unknown, departmentIds?: unknown[] }} brand
 */
export function isAssignmentDeptAligned(user, brand) {
  const u = user?.departmentId?._id || user?.departmentId;
  if (!u) return false;
  return brandHasDepartment(brand, u);
}

/**
 * DEP_ADMIN may only assign users in own department to mailboxes whose
 * brand includes own department. ADMIN/SUBADMIN: user dept must be on brand.
 * @param {import("mongoose").Document} actor
 * @param {object} brand - with departmentId / departmentIds
 * @param {import("mongoose").Document} targetUser
 */
export function assertCanAssignUser(actor, brand, targetUser) {
  if (!targetUser) throw new ApiError(404, "User not found");
  if (targetUser.status === "de active" || targetUser.status === "block") {
    throw new ApiError(400, "Cannot assign inactive user");
  }

  const userDept = String(
    targetUser.departmentId?._id || targetUser.departmentId,
  );

  if (!brandHasDepartment(brand, userDept)) {
    throw new ApiError(
      400,
      "User department is not linked to this mailbox brand",
    );
  }

  if (!canMapAllDepartments(actor)) {
    const actorDept = actorDepartmentId(actor);
    if (
      !brandHasDepartment(brand, actorDept) ||
      String(actorDept) !== userDept
    ) {
      throw new ApiError(403, "Assignment is outside your department scope");
    }
  }
}

/**
 * Users listable for assignment dropdowns.
 * @param {import("mongoose").Document} actor
 * @param {{ departmentId?: string, search?: string }} [filters]
 */
export async function listAssignableUsers(actor, filters = {}) {
  const query = withHiddenEmployeesExcluded({
    status: "active",
  });

  if (canMapAllDepartments(actor)) {
    if (filters.departmentId) {
      query.departmentId = filters.departmentId;
    }
  } else {
    const deptId = actorDepartmentId(actor);
    query.departmentId = deptId;
  }

  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query.$or = [
      { fullName: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
    ];
  }

  return Employee.find(query)
    .select("fullName email designation departmentId role status")
    .populate("departmentId", "name")
    .sort({ fullName: 1 })
    .lean();
}

/**
 * Active assignment for mail content (Phase 2+).
 * - personal: owner only, full manage (no brand / assignment row required)
 * - brand: MailboxUserAccess + dept alignment
 * @param {string} userId
 * @param {string} mailboxId
 * @returns {Promise<{ access: object, mailbox: object, brand: object|null }|null>}
 */
export async function getActiveMailboxAccess(userId, mailboxId) {
  const mailbox = await MailboxAccount.findById(mailboxId).lean();
  if (!mailbox || !mailbox.isActive) return null;

  if (mailbox.kind === "personal") {
    if (String(mailbox.ownerUserId) !== String(userId)) return null;
    return {
      access: {
        userId,
        mailboxId: mailbox._id,
        permission: "manage",
      },
      mailbox,
      brand: null,
    };
  }

  const access = await MailboxUserAccess.findOne({
    userId,
    mailboxId,
  }).lean();
  if (!access) return null;

  const brand = await Brand.findById(mailbox.brandId)
    .select("name departmentId departmentIds")
    .lean();
  if (!brand) return null;

  const user = await Employee.findById(userId).select("departmentId").lean();
  if (!isAssignmentDeptAligned(user, brand)) return null;

  return { access, mailbox, brand };
}

/** Brand mailboxes only (mapping UI) — excludes personal / missing-kind treated as brand */
export function brandMailboxFilter() {
  return { kind: { $ne: "personal" } };
}

/**
 * @param {MailboxPermission} permission
 * @param {"read"|"send"|"permanent_delete"|"manage_assignments"} action
 *
 * Note: `manage_assignments` is unused by routes — assignments are role-gated
 * (ADMIN/SUBADMIN/DEP_ADMIN). `permanent_delete` is the only mail action that
 * requires mailbox permission === `manage`.
 */
export function permissionAllows(permission, action) {
  if (action === "read") return ["read", "read_send", "manage"].includes(permission);
  if (action === "send") return ["read_send", "manage"].includes(permission);
  if (action === "permanent_delete" || action === "manage_assignments") {
    return permission === "manage";
  }
  return false;
}

export function requireMappingAccess(actor) {
  if (!canAccessMapping(actor)) {
    throw new ApiError(403, "You are not authorized for Email Mapping");
  }
}
