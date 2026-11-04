import { ApiError } from "../ApiError.js";

export function emailDomain(addr) {
  const s = String(addr || "")
    .trim()
    .toLowerCase();
  const m = s.match(/@([^>\s]+)/);
  return m ? m[1].replace(/>$/, "") : "";
}

/**
 * Company (personal) mailboxes are internal-only — recipients must share
 * the same domain as the mailbox address (blocks accidental client mail).
 */
export function assertPersonalInternalRecipients(mailbox, data) {
  if (mailbox?.kind !== "personal") return;
  const allowed = emailDomain(mailbox.emailAddress);
  if (!allowed) {
    throw new ApiError(400, "Company mailbox has an invalid address");
  }
  const all = [...(data.to || []), ...(data.cc || []), ...(data.bcc || [])];
  const external = all.filter((a) => emailDomain(a) !== allowed);
  if (external.length) {
    throw new ApiError(
      400,
      `Company email is for internal mail only (@${allowed}). Remove external address(es): ${external.slice(0, 3).join(", ")}${external.length > 3 ? "…" : ""}`,
    );
  }
}
