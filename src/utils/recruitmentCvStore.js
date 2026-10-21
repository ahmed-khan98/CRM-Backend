import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getUploadsRoot } from "./localFileStore.js";

/** New public uploads: PDF only. */
const NEW_UPLOAD_EXT = new Set(["pdf"]);
const DEFAULT_REL = "./storage/recruitment/cv";

const PDF_MAGIC = Buffer.from("%PDF");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // DOCX (legacy)
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // DOC (legacy)
const EXE_MAGIC = Buffer.from([0x4d, 0x5a]); // MZ

export const MSG_RESUME_TYPE =
  "Only PDF files are allowed. Please upload your CV as a PDF.";
export const MSG_RESUME_SIZE = "File is too large. Maximum size is 5 MB.";
export const MSG_RESUME_EMPTY =
  "This file is empty. Please choose another file.";
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export function getPublicStaticRoot() {
  return path.resolve("public");
}

/**
 * Absolute path for private CV storage.
 * Env: RECRUITMENT_CV_DIR (relative paths resolve from cwd).
 */
export function getRecruitmentCvDir(env = process.env) {
  const raw = String(env.RECRUITMENT_CV_DIR || DEFAULT_REL).trim() || DEFAULT_REL;
  return path.resolve(raw);
}

export function isPathInside(parentDir, targetPath) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  const rel = path.relative(parent, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Throws if the CV dir would be publicly served via express.static("public")
 * or the uploads root.
 */
export function assertCvDirNotPubliclyServed(
  cvDir = getRecruitmentCvDir(),
  {
    publicRoot = getPublicStaticRoot(),
    uploadsRoot = getUploadsRoot(),
  } = {}
) {
  const resolved = path.resolve(cvDir);
  // Check uploads first (often nested under public/) for a precise error.
  if (isPathInside(uploadsRoot, resolved)) {
    throw new Error(
      `RECRUITMENT_CV_DIR must not be inside getUploadsRoot() (${uploadsRoot}). Got: ${resolved}`
    );
  }
  if (isPathInside(publicRoot, resolved)) {
    throw new Error(
      `RECRUITMENT_CV_DIR must not be inside the public static directory (${publicRoot}). Got: ${resolved}`
    );
  }
  return resolved;
}

export function ensureRecruitmentCvDir(env = process.env) {
  const dir = assertCvDirNotPubliclyServed(getRecruitmentCvDir(env));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function startsWith(buf, magic) {
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic);
}

/**
 * Detect format from magic bytes. Returns "pdf" | "doc" | "docx" | null.
 */
export function detectResumeMagic(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return null;
  if (startsWith(buf, EXE_MAGIC)) return null;
  if (startsWith(buf, PDF_MAGIC)) return "pdf";
  if (startsWith(buf, OLE_MAGIC)) return "doc";
  if (startsWith(buf, ZIP_MAGIC)) return "docx";
  return null;
}

export function extensionFromName(originalname = "", allowed = NEW_UPLOAD_EXT) {
  const ext = path.extname(String(originalname)).replace(/^\./, "").toLowerCase();
  return allowed.has(ext) ? ext : "";
}

/**
 * New careers uploads: PDF extension + application/pdf + "%PDF" magic.
 * Rejects empty files, DOC/DOCX, and renamed executables.
 */
export function assertNewUploadIsPdf(buffer, originalname, mimetype = "") {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) {
    const err = new Error(MSG_RESUME_EMPTY);
    err.code = "RESUME_EMPTY";
    throw err;
  }
  const ext = path.extname(String(originalname || "")).toLowerCase();
  const mime = String(mimetype || "").toLowerCase();
  if (ext !== ".pdf" || (mime && mime !== "application/pdf")) {
    const err = new Error(MSG_RESUME_TYPE);
    err.code = "RESUME_TYPE";
    throw err;
  }
  if (!startsWith(buf, PDF_MAGIC)) {
    const err = new Error(MSG_RESUME_TYPE);
    err.code = "RESUME_MAGIC_MISMATCH";
    throw err;
  }
  return "pdf";
}

/**
 * @deprecated Prefer assertNewUploadIsPdf for new uploads.
 * Kept for tests / legacy tooling that still inspect mixed formats.
 */
export function assertResumeMagicMatches(buffer, originalname) {
  return assertNewUploadIsPdf(buffer, originalname, "application/pdf");
}

/**
 * Resolve resumePath relative to CV dir; block path traversal.
 * Returns absolute path or throws.
 */
export function resolveCvAbsolutePath(resumePath, cvDir = getRecruitmentCvDir()) {
  const rel = String(resumePath || "").replace(/\\/g, "/").trim();
  if (!rel || rel.includes("..") || path.isAbsolute(rel) || rel.startsWith("/")) {
    const err = new Error("Invalid resume path");
    err.code = "RESUME_PATH_INVALID";
    throw err;
  }
  const base = path.resolve(cvDir);
  const full = path.resolve(base, rel);
  if (!isPathInside(base, full)) {
    const err = new Error("Resume path traversal blocked");
    err.code = "RESUME_PATH_TRAVERSAL";
    throw err;
  }
  return full;
}

export function contentTypeForExt(ext) {
  const map = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Move a Multer temp file into the private CV dir.
 * Returns { resumePath, resumeFileName, absolutePath, ext }.
 * Does not use user input in the stored filename.
 */
export function saveResumeToDisk(multerFile, { cvDir } = {}) {
  if (!multerFile?.path) {
    const err = new Error("Resume file is required");
    err.code = "RESUME_MISSING";
    throw err;
  }
  const dir = cvDir
    ? assertCvDirNotPubliclyServed(cvDir)
    : ensureRecruitmentCvDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buffer = fs.readFileSync(multerFile.path);
  try {
    if (multerFile.size === 0 || !buffer.length) {
      const err = new Error(MSG_RESUME_EMPTY);
      err.code = "RESUME_EMPTY";
      throw err;
    }
    if (Number(multerFile.size) > RESUME_MAX_BYTES) {
      const err = new Error(MSG_RESUME_SIZE);
      err.code = "RESUME_TOO_LARGE";
      throw err;
    }
    const ext = assertNewUploadIsPdf(
      buffer,
      multerFile.originalname,
      multerFile.mimetype
    );
    const storedName = `${crypto.randomUUID()}.pdf`;
    const absolutePath = path.join(dir, storedName);
    fs.copyFileSync(multerFile.path, absolutePath);
    try {
      fs.unlinkSync(multerFile.path);
    } catch {
      /* ignore temp cleanup */
    }
    return {
      resumePath: storedName,
      resumeFileName: String(multerFile.originalname || "resume.pdf").slice(
        0,
        200
      ),
      absolutePath,
      ext,
    };
  } catch (err) {
    try {
      fs.unlinkSync(multerFile.path);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function deleteResumeFromDisk(resumePath, cvDir = getRecruitmentCvDir()) {
  if (!resumePath) return false;
  try {
    const full = resolveCvAbsolutePath(resumePath, cvDir);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function readResumeFromDisk(resumePath, cvDir = getRecruitmentCvDir()) {
  const full = resolveCvAbsolutePath(resumePath, cvDir);
  if (!fs.existsSync(full)) {
    const err = new Error("Resume file not found on disk");
    err.code = "RESUME_NOT_FOUND";
    throw err;
  }
  return {
    buffer: fs.readFileSync(full),
    absolutePath: full,
    ext: path.extname(full).replace(/^\./, "").toLowerCase(),
  };
}

/** Strip private storage fields before sending a candidate to the client. */
export function sanitizeCandidateForClient(candidate) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const out = { ...candidate };
  delete out.resumePath;
  return out;
}
