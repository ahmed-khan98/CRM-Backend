import fs from "fs";
import path from "path";

const UPLOAD_ROOT = path.resolve("public/uploads");
const FOLDERS = new Set(["chat", "tasks"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz"]);
const ARCHIVE_LIMIT = 50 * 1024 * 1024;

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
  return `ZIP/archives can be up to 50 MB on the server. This file is ${(
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
  const ext = path.extname(file.originalname || "") || "";
  const base = path
    .basename(file.originalname || "file", ext)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40);
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${base}${ext}`;
  const dest = path.join(destDir, name);

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
      const match = pathname.match(/^\/uploads\/(chat|tasks)\/([^/]+)$/);
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
