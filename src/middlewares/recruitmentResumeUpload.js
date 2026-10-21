import fs from "fs";
import path from "path";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const MSG_RESUME_TYPE =
  "Only PDF files are allowed. Please upload your CV as a PDF.";
export const MSG_RESUME_SIZE = "File is too large. Maximum size is 5 MB.";
export const MSG_RESUME_EMPTY =
  "This file is empty. Please choose another file.";

const tempDir = "./public/temp";

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, _file, cb) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}.pdf`);
  },
});

function pdfFileFilter(_req, file, cb) {
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  const mimeOk = file.mimetype === "application/pdf";
  if (ext !== ".pdf" || !mimeOk) {
    return cb(new ApiError(400, MSG_RESUME_TYPE));
  }
  cb(null, true);
}

/** Careers apply only — PDF, 5 MB. Do not reuse for other modules. */
export const recruitmentResumeUpload = multer({
  storage,
  limits: { fileSize: RESUME_MAX_BYTES, files: 1 },
  fileFilter: pdfFileFilter,
});

function unlinkQuiet(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

function send400(res, message) {
  return res.status(400).json({
    status: "error",
    statusCode: 400,
    message,
    success: false,
    errors: [],
    data: null,
  });
}

/**
 * Convert Multer / fileFilter errors into clean 400 JSON and delete any temp file.
 */
export function handleRecruitmentResumeUploadError(err, req, res, next) {
  if (!err) return next();
  unlinkQuiet(req.file?.path);

  if (err instanceof ApiError) {
    return send400(res, err.message);
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return send400(res, MSG_RESUME_SIZE);
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return send400(res, "Unexpected file field. Use field name \"resume\".");
    }
    return send400(res, err.message || MSG_RESUME_TYPE);
  }
  return next(err);
}

/** Wrap multer so errors hit handleRecruitmentResumeUploadError. */
export function uploadRecruitmentResume(req, res, next) {
  recruitmentResumeUpload.single("resume")(req, res, (err) => {
    if (err) return handleRecruitmentResumeUploadError(err, req, res, next);
    next();
  });
}
