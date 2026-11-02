import { ImapFlow } from "imapflow";
import { MailboxAccount } from "../../models/mailboxAccount.model.js";
import { MailboxServerDefaults } from "../../models/mailboxServerDefaults.model.js";
import { decryptMailboxPassword } from "../../utils/mailbox/crypto.js";
import { resolveServerSettings } from "../../utils/mailbox/connectionTest.js";
import { ApiError } from "../../utils/ApiError.js";

/** @type {Map<string, number>} */
const activeByMailbox = new Map();
/** @type {Map<string, Array<() => void>>} */
const waitQueues = new Map();

const MAX_CONCURRENT_PER_MAILBOX = 3;
const SLOT_WAIT_MS = 45000;

/**
 * Sanitize IMAP errors — never include password.
 * @param {unknown} err
 * @param {boolean} isAdmin
 */
export function formatMailboxConnError(err, isAdmin = false) {
  const raw = String(err?.message || err || "Mailbox unavailable");
  const cleaned = raw
    .replace(/pass(?:word)?[=:]\s*\S+/gi, "password=[redacted]")
    .slice(0, 240);
  if (isAdmin) return cleaned;
  return "Mailbox unavailable, contact admin";
}

/**
 * Wait for a free IMAP slot instead of failing immediately.
 * @param {string} mailboxId
 */
function acquireSlot(mailboxId) {
  const key = String(mailboxId);
  const n = activeByMailbox.get(key) || 0;
  if (n < MAX_CONCURRENT_PER_MAILBOX) {
    activeByMailbox.set(key, n + 1);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const queue = waitQueues.get(key) || [];
    const timer = setTimeout(() => {
      const q = waitQueues.get(key) || [];
      const idx = q.indexOf(wake);
      if (idx >= 0) q.splice(idx, 1);
      if (!q.length) waitQueues.delete(key);
      else waitQueues.set(key, q);
      reject(
        new ApiError(429, "Mailbox is busy, try again in a moment"),
      );
    }, SLOT_WAIT_MS);

    const wake = () => {
      clearTimeout(timer);
      const cur = activeByMailbox.get(key) || 0;
      if (cur < MAX_CONCURRENT_PER_MAILBOX) {
        activeByMailbox.set(key, cur + 1);
        resolve();
      } else {
        // Re-queue if raced
        const q2 = waitQueues.get(key) || [];
        q2.unshift(wake);
        waitQueues.set(key, q2);
      }
    };

    queue.push(wake);
    waitQueues.set(key, queue);
  });
}

/**
 * @param {string} mailboxId
 */
function releaseSlot(mailboxId) {
  const key = String(mailboxId);
  const n = activeByMailbox.get(key) || 0;
  if (n <= 1) activeByMailbox.delete(key);
  else activeByMailbox.set(key, n - 1);

  const queue = waitQueues.get(key);
  if (queue?.length) {
    const next = queue.shift();
    if (!queue.length) waitQueues.delete(key);
    else waitQueues.set(key, queue);
    if (typeof next === "function") next();
  }
}

/**
 * Load mailbox + decrypted password + resolved server settings.
 * @param {string} mailboxId
 */
export async function loadMailboxCredentials(mailboxId) {
  const mailbox = await MailboxAccount.findById(mailboxId).select(
    "+encryptedPassword",
  );
  if (!mailbox || !mailbox.isActive) {
    throw new ApiError(404, "Mailbox not found or inactive");
  }
  const defaults = await MailboxServerDefaults.findById(
    mailbox.serverDefaultsId,
  ).lean();
  if (!defaults) throw new ApiError(500, "Mailbox server defaults missing");

  let password;
  try {
    password = decryptMailboxPassword(mailbox.encryptedPassword);
  } catch {
    throw new ApiError(500, "Mailbox credentials unavailable");
  }

  const settings = resolveServerSettings(defaults, mailbox);
  return { mailbox, password, settings };
}

/**
 * Open IMAP, run fn(client), always logout/close.
 * @template T
 * @param {string} mailboxId
 * @param {(client: import("imapflow").ImapFlow) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withImap(mailboxId, fn) {
  await acquireSlot(mailboxId);
  let client;
  try {
    const { mailbox, password, settings } =
      await loadMailboxCredentials(mailboxId);

    client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: settings.imapSecure,
      auth: {
        user: mailbox.loginUsername,
        pass: password,
      },
      logger: false,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 60000,
    });

    await client.connect();
    await MailboxAccount.updateOne(
      { _id: mailboxId },
      { $set: { lastError: null, lastConnectedAt: new Date() } },
    );

    return await fn(client);
  } catch (err) {
    const msg = formatMailboxConnError(err, true);
    await MailboxAccount.updateOne(
      { _id: mailboxId },
      { $set: { lastError: msg } },
    ).catch(() => {});
    throw err;
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
    }
    releaseSlot(mailboxId);
  }
}
