import { MailboxAudit } from "../../models/mailboxAudit.model.js";
import { mailboxRole } from "./permissions.js";

/**
 * Fire-and-forget audit write (never throws to callers).
 * Never pass passwords or email bodies in meta.
 * @param {{
 *   action: string,
 *   actor: { _id: unknown, role?: string },
 *   mailboxId?: unknown,
 *   targetUserId?: unknown,
 *   meta?: Record<string, unknown>,
 * }} params
 */
export async function writeMailboxAudit({
  action,
  actor,
  mailboxId = null,
  targetUserId = null,
  meta = {},
}) {
  try {
    await MailboxAudit.create({
      action,
      actorId: actor._id,
      actorRole: mailboxRole(actor),
      mailboxId,
      targetUserId,
      meta,
    });
  } catch (err) {
    console.error("[mailbox-audit]", err?.message || err);
  }
}
