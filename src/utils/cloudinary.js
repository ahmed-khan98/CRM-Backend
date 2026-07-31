import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    const { path, originalname } = localFilePath;

    const res = await cloudinary.uploader.upload(path, {
      resource_type: "auto",
      public_id: originalname.split(".")[0],
    });

    return res;
  } catch (e) {
    console.error("Error uploading file to Cloudinary:", e);
    return null;
  }
};

const uploadBase64Image = async (base64String) => {
  try {
    const response = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64String}`,
      {
        resource_type: "auto",
      },
    );
    return response;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return null;
  }
};

/**
 * Upload task attachments (PDF, DOCX, XLSX, images, etc.)
 * - Detects resource_type from mimetype so PDFs go to /raw/ not /image/
 * - Sanitizes public_id to remove spaces/special chars (prevents browser corruption)
 */
const uploadAttachmentOnCloudinary = async (file) => {
  if (!file) return null;

  const { path, originalname, mimetype } = file;

  try {
    const extension = originalname
      .split(".")
      .pop()
      ?.toLowerCase();
    const rawFileExtensions = new Set([
      "zip",
      "rar",
      "psd",
      "ai",
      "eps",
    ]);

    // Determine correct resource_type
    let resourceType = "raw"; // default: docs, PDFs, xlsx, etc.
    if (rawFileExtensions.has(extension)) resourceType = "raw";
    else if (mimetype?.startsWith("image/")) resourceType = "image";
    else if (mimetype?.startsWith("video/")) resourceType = "video";

    // Sanitize filename → safe public_id (no spaces, parens, special chars)
    // Raw files MUST keep the extension in public_id or downloads can corrupt
    const nameOnly = originalname.replace(/\.[^.]+$/, "");
    const safe = nameOnly.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40);
    const uid = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const publicId =
      resourceType === "raw" && extension
        ? `CRM-Tasks/${safe}_${uid}.${extension}`
        : `CRM-Tasks/${safe}_${uid}`;

    const result = await cloudinary.uploader.upload(path, {
      resource_type: resourceType,
      public_id: publicId,
      overwrite: false,
      access_mode: "public",
      type: "upload",
    });
   
    try {
      fs.unlinkSync(path);
    } catch (_) {}

    return result;
  } catch (err) {
    console.error("Cloudinary attachment upload error:", err);
    try {
      if (path) fs.unlinkSync(path);
    } catch (_) {}
    return null;
  }
};

/** Parse public_id + resource_type from a Cloudinary delivery URL */
const parseCloudinaryUrl = (urlString) => {
  try {
    const parsed = new URL(urlString.replace(/^http:\/\//i, "https://"));
    const match = parsed.pathname.match(
      /\/[^/]+\/(image|raw|video)\/(upload|authenticated|private)(?:\/s--[^/]+--)?(?:\/v(\d+))?\/(.+)/
    );
    if (!match) return null;

    const resourceType = match[1];
    // Keep full path for raw files (extension is part of public_id for zip/psd/ai)
    let assetPath = decodeURIComponent(match[4]);
    if (resourceType === "video") {
      assetPath = assetPath.replace(/\.[^/.]+$/, "");
    }

    return { publicId: assetPath, resourceType, version: match[3] };
  } catch {
    return null;
  }
};

/**
 * Fetch attachment bytes from Cloudinary using signed/admin URLs.
 * Works even when direct browser delivery returns 401 (PDF delivery restriction).
 */
const fetchAttachmentFromCloudinary = async ({ url, publicId, filename }) => {
  const parsed = url ? parseCloudinaryUrl(url) : null;
  const resourceType = parsed?.resourceType || "raw";
  const ext =
    (filename || url || "")
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase() || "bin";

  const candidates = [];
  if (publicId) candidates.push(decodeURIComponent(String(publicId)));
  if (parsed?.publicId) candidates.push(parsed.publicId);

  // Older uploads stored public_id without extension; newer ones include it
  for (const base of [...candidates]) {
    if (!base) continue;
    if (!base.toLowerCase().endsWith(`.${ext}`)) {
      candidates.push(`${base}.${ext}`);
    }
    const stripped = base.replace(/\.[^/.]+$/, "");
    if (stripped && stripped !== base) candidates.push(stripped);
  }

  const uniqueIds = [...new Set(candidates.filter(Boolean))];

  // 1) Prefer direct delivery URL when available (works for most public raw files)
  if (url) {
    const direct = await fetch(url.replace(/^http:\/\//i, "https://"));
    if (direct.ok) {
      const type = direct.headers.get("content-type") || "";
      // Avoid saving HTML error pages as "documents"
      if (!type.includes("text/html")) return direct;
    }
  }

  // 2) Signed delivery URLs for each public_id variant
  for (const pid of uniqueIds) {
    const signedUrl = cloudinary.url(pid, {
      resource_type: resourceType,
      type: "upload",
      sign_url: true,
      secure: true,
    });

    const res = await fetch(signedUrl);
    if (res.ok) {
      const type = res.headers.get("content-type") || "";
      if (!type.includes("text/html")) return res;
    }
  }

  // 3) Admin authenticated download URL
  for (const pid of uniqueIds) {
    try {
      const downloadUrl = cloudinary.utils.private_download_url(pid, ext, {
        resource_type: resourceType,
        type: "upload",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      const res = await fetch(downloadUrl);
      if (res.ok) return res;
    } catch (_) {}
  }

  throw new Error("Cloudinary fetch failed for attachment");
};

export {
  uploadOnCloudinary,
  uploadBase64Image,
  uploadAttachmentOnCloudinary,
  parseCloudinaryUrl,
  fetchAttachmentFromCloudinary,
};
