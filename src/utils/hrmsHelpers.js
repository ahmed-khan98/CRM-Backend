/**
 * Shared helpers for employee HRMS submodules.
 */
export const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const paginatedResponse = (items, total, page, limit) => {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/** Parse JSON fields that may arrive as strings via multipart FormData */
export const parseMaybeJson = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const jsonEqual = (a, b) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
