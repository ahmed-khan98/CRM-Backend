import crypto from "crypto";
import fs from "fs";
import path from "path";

const UPLOAD_ROOT = path.resolve("public/uploads");
const FOLDERS = new Set(["chat", "tasks", "employee"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz"]);
const ARCHIVE_LIMIT = 100 * 1024 * 1024;

/** Unique disk filename → unique public URL. Never reuses a name. */
function uniqueUploadName(originalname = "") {
  const ext = path.extname(originalname || "").toLowerCase().slice(0, 20);
  const safeExt = /^\.[a-z0-9.]+$/i.test(ext) ? ext : "";
  return `${Date.now()}_${crypto.randomUUID()}${safeExt}`;
}

/** Public static uploads root (`/uploads` / `public/uploads`). */
export function getUploadsRoot() {
  return UPLOAD_ROOT;
}

function dirFor(folder) {
  return path.join(UPLOAD_ROOT, folder);
}

function ensureUploadDir(folder) {
  const dir = dirFor(folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isArchiveFile(originalname = "", mimetype = "") {
  const ext = String(originalname).split(".").pop()?.toLowerCase();
  if (ARCHIVE_EXTS.has(ext)) return true;
  return /zip|x-rar|x-7z|x-tar|gzip/i.test(mimetype || "");
}

export function getArchiveLimitError(file) {
  if (!file || !isArchiveFile(file.originalname, file.mimetype)) return null;
  if ((file.size || 0) <= ARCHIVE_LIMIT) return null;
  return `ZIP/archives can be up to 100 MB on the server. This file is ${(
    file.size /
    (1024 * 1024)
  ).toFixed(1)} MB.`;
}

export function publicBackendOrigin(req) {
  const envUrl = (process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  if (envUrl) return envUrl;
  const proto = req.protocol || "https";
  const host = req.get?.("host") || req.headers?.host || "";
  return `${proto}://${host}`;
}

export function saveFileLocally(file, req, folder = "chat") {
  if (!file?.path) throw new Error("File is required");
  if (!FOLDERS.has(folder)) throw new Error("Invalid upload folder");

  const destDir = ensureUploadDir(folder);
  let name = uniqueUploadName(file.originalname);
  let dest = path.join(destDir, name);
  // Extremely unlikely; regenerate if the path already exists
  for (let i = 0; i < 3 && fs.existsSync(dest); i += 1) {
    name = uniqueUploadName(file.originalname);
    dest = path.join(destDir, name);
  }
  if (fs.existsSync(dest)) {
    throw new Error("Could not allocate a unique upload filename");
  }

  fs.copyFileSync(file.path, dest);
  try {
    fs.unlinkSync(file.path);
  } catch (_) {}

  const url = `${publicBackendOrigin(req)}/uploads/${folder}/${encodeURIComponent(name)}`;
  return {
    url,
    secure_url: url,
    public_id: `local:${folder}/${name}`,
    resource_type: "raw",
  };
}

export function saveChatFileLocally(file, req) {
  return saveFileLocally(file, req, "chat");
}

/** Employee profile photos → `public/uploads/employee/`. */
export function saveEmployeeImageLocally(file, req) {
  return saveFileLocally(file, req, "employee");
}

export function resolveLocalFile({ url, publicId } = {}) {
  let folder = "";
  let name = "";

  if (String(publicId || "").startsWith("local:")) {
    const rest = publicId.slice("local:".length);
    const slash = rest.indexOf("/");
    if (slash > 0) {
      folder = rest.slice(0, slash);
      name = rest.slice(slash + 1);
    }
  } else if (url) {
    try {
      const pathname = new URL(url, "https://local").pathname;
      const match = pathname.match(/^\/uploads\/(chat|tasks|employee)\/([^/]+)$/);
      if (match) {
        folder = match[1];
        name = decodeURIComponent(match[2]);
      }
    } catch (_) {
      return null;
    }
  }

  if (!FOLDERS.has(folder)) return null;
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return null;
  }

  const destDir = dirFor(folder);
  const filePath = path.resolve(destDir, name);
  if (!filePath.startsWith(destDir)) return null;
  if (!fs.existsSync(filePath)) return null;
  return { filePath, name, folder };
}

export const resolveLocalChatFile = resolveLocalFile;
