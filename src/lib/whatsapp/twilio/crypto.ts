import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts a per-company Twilio subaccount Auth Token before it is stored
// (company_twilio_accounts.auth_token_encrypted). The DB column is already
// service-role-only; this adds a second layer so that a leaked database
// dump or backup alone doesn't hand over control of every merchant's
// subaccount -- the key lives only in the deploy's env.
//
// AES-256-GCM, format `v1:<iv>:<tag>:<ciphertext>` (all base64). The `v1`
// prefix leaves room to rotate the scheme later without a guessing game.
// TWILIO_CREDENTIALS_KEY must be 32 random bytes, base64-encoded:
//   openssl rand -base64 32
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.TWILIO_CREDENTIALS_KEY;
  if (!raw) throw new Error("TWILIO_CREDENTIALS_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TWILIO_CREDENTIALS_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognised encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
