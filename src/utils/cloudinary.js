import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // delivery URLs default to https://res.cloudinary.com/...
});

/** Cloudinary returns both url (http) and secure_url (https). Always prefer https. */
const preferSecureCloudinaryResult = (result) => {
  if (!result || result.error) return result;
  const httpsUrl = (result.secure_url || result.url || "").replace(
    /^http:\/\//i,
    "https://"
  );
  if (httpsUrl) {
    result.secure_url = httpsUrl;
    result.url = httpsUrl;
  }
  return result;
};

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    const { path, originalname } = localFilePath;
    
    const res = await cloudinary.uploader.upload(path, {
      resource_type: "auto",
      public_id: originalname.split(".")[0],
    });

    return preferSecureCloudinaryResult(res);
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
    return preferSecureCloudinaryResult(response);
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return null;
  }
};

/** Cloudinary's per-resource-type max upload size — these are the *account
 * plan* caps (Free plan shown here: 10 MB image/raw, 100 MB video/audio).
 * Uploading above these always fails on Cloudinary's side no matter what
 * multer/nginx/express allow, so we check this ourselves first to fail fast
 * with a clear message instead of a generic "Upload failed". Bump these if
 * the Cloudinary plan is upgraded (see https://cloudinary.com/pricing/compare-plans). */
const CLOUDINARY_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  raw: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024, // Cloudinary stores audio under "video" too
};

/** Detects the Cloudinary resource_type ("image" | "video" | "raw") a file
 * should upload as, based on mimetype/extension. Shared by the size check
 * and the actual upload so they never disagree. */
const getCloudinaryResourceType = (originalname, mimetype) => {
  const extension = (originalname || "").split(".").pop()?.toLowerCase();
  const rawFileExtensions = new Set(["zip", "rar", "psd", "ai", "eps"]);

  if (rawFileExtensions.has(extension)) return "raw";
  if (mimetype?.startsWith("image/")) return "image";
  if (
    mimetype?.startsWith("video/") ||
    mimetype?.startsWith("audio/") ||
    ["webm", "ogg", "mp3", "m4a", "wav", "aac", "opus"].includes(extension)
  ) {
    return "video";
  }
  return "raw"; // default: docs, PDFs, xlsx, etc.
};

/**
 * Upload task attachments (PDF, DOCX, XLSX, images, etc.)
 * - Detects resource_type from mimetype so PDFs go to /raw/ not /image/
 * - Sanitizes public_id to remove spaces/special chars (prevents browser corruption)
 * - Rejects early (with a clear reason) if the file exceeds Cloudinary's
 *   plan limit for that resource type, instead of letting Cloudinary itself
 *   reject it with an opaque error after the file has already been read.
 */
const uploadAttachmentOnCloudinary = async (file) => {
  if (!file) return null;

  const { path, originalname, mimetype, size } = file;
  const resourceType = getCloudinaryResourceType(originalname, mimetype);

  const limit = CLOUDINARY_SIZE_LIMITS[resourceType];
  if (limit && size > limit) {
    try {
      fs.unlinkSync(path);
    } catch (_) {}
    const limitMb = Math.round(limit / (1024 * 1024));
    const kindLabel = resourceType === "video" ? "Video/audio" : resourceType === "image" ? "Images" : "Documents/files";
    return {
      error: `${kindLabel} can be up to ${limitMb} MB on the current Cloudinary plan. This file is ${(
        size /
        (1024 * 1024)
      ).toFixed(1)} MB.`,
    };
  }

  try {
    const extension = originalname.split(".").pop()?.toLowerCase();

    // Sanitize filename → safe public_id (no spaces, parens, special chars)
    // Raw files MUST keep the extension in public_id or downloads can corrupt
    const nameOnly = originalname.replace(/\.[^.]+$/, "");
    const safe = nameOnly.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40);
    const uid = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const publicId =
      resourceType === "raw" && extension
        ? `CRM-Tasks/${safe}_${uid}.${extension}`
        : `CRM-Tasks/${safe}_${uid}`;

    const result = preferSecureCloudinaryResult(
      await cloudinary.uploader.upload(path, {
        resource_type: resourceType,
        public_id: publicId,
        overwrite: false,
      })
    );

    try {
      fs.unlinkSync(path);
    } catch (_) {}

    return result;
  } catch (err) {
    console.error("Cloudinary attachment upload error:", err);
    try {
      if (path) fs.unlinkSync(path);
    } catch (_) {}
    return { error: err?.message || "Upload failed" };
  }
};

/** Best-effort delete of a single attachment from Cloudinary when a user
 * removes it from a task. Non-fatal — a failure here shouldn't block the
 * attachment being removed from the task document itself. */
const deleteAttachmentFromCloudinary = async (publicId, resourceType = "raw") => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error("Cloudinary attachment delete error:", err?.message || err);
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
  const restrictedExts = new Set([
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "zip",
    "rar",
    "psd",
    "ai",
    "eps",
  ]);
  const skipDirect = restrictedExts.has(ext) || resourceType === "raw";
  // Resumes were sometimes uploaded as image/upload PDFs — try both types
  const resourceTypes = [
    ...new Set(
      restrictedExts.has(ext)
        ? [resourceType, "raw", "image"]
        : [resourceType]
    ),
  ];

  const isValidBody = async (res) => {
    if (!res?.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20) return null;
    const head = buf.subarray(0, 32).toString("utf8").trimStart().toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) return null;
    if (ext === "pdf" && !buf.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
      return null;
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type":
          type && !type.includes("text/html")
            ? type
            : ext === "pdf"
              ? "application/pdf"
              : "application/octet-stream",
      },
    });
  };

  // 0) Resolve exact public_id via Admin API (fixes image-vs-raw mismatches)
  for (const rt of resourceTypes) {
    for (const pid of uniqueIds) {
      try {
        const info = await cloudinary.api.resource(pid, { resource_type: rt });
        if (info?.public_id && !uniqueIds.includes(info.public_id)) {
          uniqueIds.push(info.public_id);
        }
        if (info?.format && info.format !== ext) {
          // keep trying original ext too
        }
        const format = info?.format || ext;
        const downloadUrl = cloudinary.utils.private_download_url(
          info.public_id,
          format,
          {
            resource_type: info.resource_type || rt,
            type: info.type || "upload",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            attachment: true,
          }
        );
        const valid = await isValidBody(await fetch(downloadUrl));
        if (valid) return valid;
      } catch (_) {}
    }
  }

  // 1) Direct URL only for non-restricted public assets (images etc.)
  if (url && !skipDirect) {
    const valid = await isValidBody(
      await fetch(url.replace(/^http:\/\//i, "https://"))
    );
    if (valid) return valid;
  }

  // 2) Signed delivery URLs (+ fl_attachment for PDF delivery restrictions)
  for (const rt of resourceTypes) {
    for (const pid of uniqueIds) {
      for (const flags of [undefined, "attachment"]) {
        const signedUrl = cloudinary.url(pid, {
          resource_type: rt,
          type: "upload",
          sign_url: true,
          secure: true,
          ...(flags ? { flags } : {}),
          ...(ext === "pdf" ? { format: "pdf" } : {}),
        });
        const valid = await isValidBody(await fetch(signedUrl));
        if (valid) return valid;
      }
    }
  }

  // 3) Admin authenticated download URL
  for (const rt of resourceTypes) {
    for (const pid of uniqueIds) {
      try {
        const downloadUrl = cloudinary.utils.private_download_url(pid, ext, {
          resource_type: rt,
          type: "upload",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          attachment: true,
        });
        const valid = await isValidBody(await fetch(downloadUrl));
        if (valid) return valid;
      } catch (_) {}
    }
  }

  // 4) Last attempt: direct URL even for raw/restricted
  if (url && skipDirect) {
    const valid = await isValidBody(
      await fetch(url.replace(/^http:\/\//i, "https://"))
    );
    if (valid) return valid;
  }

  throw new Error("Cloudinary fetch failed for attachment");
};

export {
  uploadOnCloudinary,
  uploadBase64Image,
  uploadAttachmentOnCloudinary,
  deleteAttachmentFromCloudinary,
  parseCloudinaryUrl,
  fetchAttachmentFromCloudinary,
};
