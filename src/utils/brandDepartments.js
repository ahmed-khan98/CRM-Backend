import mongoose from "mongoose";

/**
 * One brand can belong to multiple departments (shared brand / team split).
 * Legacy docs only have `departmentId`; newer docs also have `departmentIds[]`.
 * `departmentId` is kept as the primary (first) department for older fields.
 */

export function normalizeDepartmentIdList(input) {
  let raw = input;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("[")) {
      try {
        raw = JSON.parse(t);
      } catch {
        raw = t.split(/[,\s]+/);
      }
    } else if (t.includes(",")) {
      raw = t.split(",");
    } else {
      raw = [t];
    }
  }
  if (!Array.isArray(raw)) {
    raw = raw == null || raw === "" ? [] : [raw];
  }

  const ids = [];
  const seen = new Set();
  for (const v of raw) {
    const id = v && typeof v === "object" ? v._id || v.id : v;
    const s = String(id || "").trim();
    if (!s || !mongoose.Types.ObjectId.isValid(s) || seen.has(s)) continue;
    seen.add(s);
    ids.push(new mongoose.Types.ObjectId(s));
  }
  return ids;
}

/** Parse create/update body: departmentIds or legacy departmentId */
export function parseDepartmentIdsFromBody(body = {}) {
  if (body.departmentIds != null && body.departmentIds !== "") {
    return normalizeDepartmentIdList(body.departmentIds);
  }
  if (body.departmentId != null && body.departmentId !== "") {
    return normalizeDepartmentIdList(body.departmentId);
  }
  return [];
}

export function syncBrandDepartmentFields(departmentIdsInput) {
  const departmentIds = normalizeDepartmentIdList(departmentIdsInput);
  return {
    departmentIds,
    departmentId: departmentIds[0] || undefined,
  };
}

export function brandDepartmentIds(brand) {
  if (!brand) return [];
  const fromArray = Array.isArray(brand.departmentIds) ? brand.departmentIds : [];
  return normalizeDepartmentIdList([...fromArray, brand.departmentId]);
}

export function brandDepartmentIdStrings(brand) {
  return brandDepartmentIds(brand).map(String);
}

export function brandPrimaryDepartmentId(brand) {
  return brandDepartmentIds(brand)[0] || null;
}

export function brandHasDepartment(brand, departmentId) {
  if (!departmentId) return false;
  const want = String(departmentId?._id || departmentId);
  return brandDepartmentIdStrings(brand).includes(want);
}

/** Mongo filter: brands linked to this department (legacy or array). */
export function brandQueryForDepartment(departmentId) {
  if (!departmentId) return { _id: null };
  return {
    $or: [{ departmentId }, { departmentIds: departmentId }],
  };
}

/**
 * Convert CRM roleFilter into a Brand query.
 * `{ departmentId }` → match primary OR departmentIds membership.
 */
export function brandRoleFilterQuery(roleFilter = {}) {
  if (!roleFilter || Object.keys(roleFilter).length === 0) return {};
  if (roleFilter._id === null) return { _id: null };
  if (roleFilter.departmentId) {
    return brandQueryForDepartment(roleFilter.departmentId);
  }
  return { ...roleFilter };
}

export function brandDepartmentNames(brand) {
  return brandDepartmentEntries(brand).map((e) => e.name);
}

/** Populated or raw: [{ id, name }] in stable order */
export function brandDepartmentEntries(brand) {
  const entries = [];
  const seen = new Set();
  const push = (d) => {
    if (d == null) return;
    const id = String(typeof d === "object" ? d._id || d.id || d : d);
    if (!id || id === "undefined" || seen.has(id)) return;
    seen.add(id);
    const name =
      typeof d === "object" && d.name ? String(d.name) : "Unknown";
    entries.push({ id, name });
  };
  if (Array.isArray(brand?.departmentIds) && brand.departmentIds.length) {
    brand.departmentIds.forEach(push);
  }
  push(brand?.departmentId);
  return entries;
}
