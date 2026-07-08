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
    // Determine correct resource_type
    let resourceType = "raw"; // default: docs, PDFs, xlsx, etc.
    if (mimetype?.startsWith("image/")) resourceType = "image";
    else if (mimetype?.startsWith("video/")) resourceType = "video";

    // Sanitize filename → safe public_id (no spaces, parens, special chars)
    const nameOnly = originalname.replace(/\.[^.]+$/, ""); // strip extension
    const safe = nameOnly.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40);
    const uid = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const result = await cloudinary.uploader.upload(path, {
      resource_type: resourceType,
      public_id: `CRM-Tasks/${safe}_${uid}`,
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
    let assetPath = decodeURIComponent(match[4]);
    // raw/video assets: public_id has no extension in Cloudinary
    if (resourceType === "raw" || resourceType === "video") {
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
  const pid = publicId || parsed?.publicId;
  const resourceType = parsed?.resourceType || "raw";

  if (!pid) {
    if (!url) throw new Error("No url or publicId provided");
    const res = await fetch(url.replace(/^http:\/\//i, "https://"));
    if (!res.ok) throw new Error(`Direct fetch failed: ${res.status}`);
    return res;
  }

  // 1) Signed delivery URL
  const signedUrl = cloudinary.url(pid, {
    resource_type: resourceType,
    type: "upload",
    sign_url: true,
    secure: true,
  });

  let res = await fetch(signedUrl);
  if (res.ok) return res;

  // 2) Admin authenticated download URL (bypasses PDF delivery block)
  const ext = (filename || url || "").split(".").pop()?.split("?")[0] || "pdf";
  const downloadUrl = cloudinary.utils.private_download_url(pid, ext, {
    resource_type: resourceType,
    type: "upload",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  res = await fetch(downloadUrl);
  if (res.ok) return res;

  throw new Error(`Cloudinary fetch failed (${res.status})`);
};

export {
  uploadOnCloudinary,
  uploadBase64Image,
  uploadAttachmentOnCloudinary,
  parseCloudinaryUrl,
  fetchAttachmentFromCloudinary,
};
