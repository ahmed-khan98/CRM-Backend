import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * @returns {Buffer}
 */
function getKey() {
  const raw = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!raw || typeof raw !== "string") {
    throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  }
  // Accept 64-char hex (32 bytes) or base64 of 32 bytes
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    key = Buffer.from(raw.trim(), "hex");
  } else {
    key = Buffer.from(raw.trim(), "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      "MAILBOX_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)",
    );
  }
  return key;
}

/**
 * Encrypt plaintext password. Returns `iv:tag:ciphertext` (all base64).
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptMailboxPassword(plaintext) {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("Password is required");
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Decrypt mailbox password. Never log the result.
 * @param {string} payload
 * @returns {string}
 */
export function decryptMailboxPassword(payload) {
  if (!payload || typeof payload !== "string") {
    throw new Error("Encrypted password missing");
  }
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password format");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid encrypted password format");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Strip any accidental password fields from an object before responding.
 * @param {Record<string, unknown>|null|undefined} doc
 */
export function sanitizeMailboxDoc(doc) {
  if (!doc) return doc;
  const obj =
    typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.encryptedPassword;
  delete obj.password;
  return obj;
}
