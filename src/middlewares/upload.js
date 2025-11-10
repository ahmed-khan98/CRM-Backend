import multer from "multer";
import path from "node:path";
import fs from "node:fs";

const uploadDir = path.join(process.cwd(), "uploads", "temp"); // NOT public (safer)
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname); // .csv/.xlsx/.xls
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}_${unique}${ext}`);
  },
});

const allowedMimes = new Set([
  "text/csv",
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

function fileFilter(req, file, cb) {
  // Some browsers send CSV as text/plain; allow extension fallback too
  const ext = path.extname(file.originalname).toLowerCase();
  const okByMime = allowedMimes.has(file.mimetype);
  const okByExt = [".csv", ".xlsx", ".xls"].includes(ext);
  if (okByMime || okByExt) return cb(null, true);
  cb(new Error("Only CSV/XLS/XLSX files are allowed"));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
