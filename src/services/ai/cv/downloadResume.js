import crypto from "crypto";
import { fetchAttachmentFromCloudinary } from "../../../utils/cloudinary.js";
import { readResumeFromDisk } from "../../../utils/recruitmentCvStore.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load CV bytes: prefer private disk (resumePath), else Cloudinary for legacy rows.
 * Returns { buffer, filename, cvHash } — never a storage URL or absolute path.
 */
export async function downloadResumeBuffer(
  candidate,
  {
    retries = 2,
    fetchAttachment = fetchAttachmentFromCloudinary,
    readDisk = readResumeFromDisk,
    wait = sleep,
  } = {}
) {
  const filename =
    candidate?.resumeFileName ||
    candidate?.resumeUrl?.split("/").pop()?.split("?")[0] ||
    "resume.pdf";

  if (candidate?.resumePath) {
    try {
      const { buffer } = readDisk(candidate.resumePath);
      if (!buffer?.length) {
        throw new Error("Empty resume on disk");
      }
      const cvHash = crypto.createHash("sha256").update(buffer).digest("hex");
      return { buffer, filename, cvHash };
    } catch (err) {
      const fail = new Error(err?.message || "Resume disk read failed");
      fail.code =
        err?.code === "RESUME_PATH_TRAVERSAL" ||
        err?.code === "RESUME_PATH_INVALID"
          ? err.code
          : "RESUME_DOWNLOAD_FAILED";
      fail.cause = err;
      throw fail;
    }
  }

  if (!candidate?.resumeUrl && !candidate?.resumePublicId) {
    const err = new Error("No resume on file");
    err.code = "RESUME_MISSING";
    throw err;
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const upstream = await fetchAttachment({
        url: candidate.resumeUrl || undefined,
        publicId: candidate.resumePublicId || undefined,
        filename,
      });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (!buffer.length) {
        throw new Error("Empty resume download");
      }
      const head = buffer
        .subarray(0, 32)
        .toString("utf8")
        .trimStart()
        .toLowerCase();
      if (head.startsWith("<!doctype") || head.startsWith("<html")) {
        throw new Error("Resume storage returned HTML");
      }
      const cvHash = crypto.createHash("sha256").update(buffer).digest("hex");
      return { buffer, filename, cvHash };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await wait(300 * 2 ** attempt);
    }
  }
  const fail = new Error(lastErr?.message || "Resume download failed");
  fail.code = "RESUME_DOWNLOAD_FAILED";
  fail.cause = lastErr;
  throw fail;
}
