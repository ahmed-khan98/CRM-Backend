import mammoth from "mammoth";

/**
 * pdf-parse's package entry runs a demo PDF on import — use the lib entry.
 */
async function loadPdfParse() {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  return mod.default || mod;
}

function extOf(filename = "", mimetype = "") {
  const fromName = String(filename).split(".").pop()?.toLowerCase() || "";
  if (fromName) return fromName;
  if (mimetype.includes("pdf")) return "pdf";
  if (mimetype.includes("wordprocessingml")) return "docx";
  if (mimetype.includes("msword")) return "doc";
  return "";
}

function normalizeExtracted(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract plain text from a CV buffer.
 * Returns { ok, text, reason?, format }.
 * Reasons: unsupported_format | scanned_cv | extract_failed
 */
export async function extractCvText(
  buffer,
  { filename = "", mimetype = "" } = {},
  deps = {}
) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const format = extOf(filename, mimetype);
  const pdfParse = deps.pdfParse || (await loadPdfParse());
  const mammothLib = deps.mammoth || mammoth;

  if (!buf.length) {
    return { ok: false, text: "", format, reason: "extract_failed" };
  }

  if (format === "doc") {
    return { ok: false, text: "", format, reason: "unsupported_format" };
  }

  if (format === "docx") {
    try {
      const result = await mammothLib.extractRawText({ buffer: buf });
      const text = normalizeExtracted(result?.value);
      if (!text) {
        return { ok: false, text: "", format, reason: "scanned_cv" };
      }
      return { ok: true, text, format };
    } catch {
      return { ok: false, text: "", format, reason: "extract_failed" };
    }
  }

  if (
    format === "pdf" ||
    buf.subarray(0, 4).toString("utf8") === "%PDF"
  ) {
    try {
      // pdf.js (via pdf-parse) can mis-read Node Buffer pool slices; always copy.
      const data = await pdfParse(new Uint8Array(buf));
      const text = normalizeExtracted(data?.text);
      if (!text) {
        return { ok: false, text: "", format: "pdf", reason: "scanned_cv" };
      }
      return { ok: true, text, format: "pdf" };
    } catch (err) {
      const msg = String(err?.message || err || "").toLowerCase();
      const unreadable =
        /password|encrypt|invalid|corrupt|xref|formaterror|bad/i.test(msg);
      return {
        ok: false,
        text: "",
        format: "pdf",
        reason: unreadable ? "unreadable_pdf" : "extract_failed",
      };
    }
  }

  return { ok: false, text: "", format, reason: "unsupported_format" };
}
