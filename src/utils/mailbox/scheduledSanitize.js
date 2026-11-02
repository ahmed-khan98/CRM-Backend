/**
 * Strip attachment payloads from scheduled-message API responses.
 * Never expose contentBase64 to clients.
 */

/**
 * @param {object|null|undefined} row
 * @returns {object|null|undefined}
 */
export function sanitizeScheduledDoc(row) {
  if (!row) return row;
  const obj =
    typeof row.toObject === "function" ? row.toObject() : { ...row };
  if (Array.isArray(obj.attachments)) {
    obj.attachments = obj.attachments.map((a) => ({
      filename: a?.filename || "",
      contentType: a?.contentType || "application/octet-stream",
      size: typeof a?.size === "number" ? a.size : undefined,
      hasContent: Boolean(a?.contentBase64),
    }));
  }
  delete obj.__v;
  return obj;
}

/**
 * @param {object[]} rows
 */
export function sanitizeScheduledList(rows = []) {
  return rows.map((r) => sanitizeScheduledDoc(r));
}
