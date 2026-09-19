import crypto from "node:crypto";

// Garmin passwords are the one credential this app stores per user rather
// than per deployment, so they're encrypted at rest rather than left as plain
// text next to everyone else's activity data.
const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
if (!keyHex) {
  throw new Error("Missing CREDENTIALS_ENCRYPTION_KEY in environment (generate one with `openssl rand -hex 32`)");
}
const key = Buffer.from(keyHex, "hex");
if (key.length !== 32) {
  throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes as hex (64 characters)");
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** AES-256-GCM encrypt, packed as base64(iv | authTag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** Reverses `encrypt`. Throws if the key is wrong or the payload was tampered with. */
export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
