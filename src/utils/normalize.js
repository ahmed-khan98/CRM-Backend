// src/utils/normalize.js
export const norm = (v) =>
  (v ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const loose = (v) => norm(v).replace(/[^a-z0-9]/g, "");