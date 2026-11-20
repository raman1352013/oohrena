import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM. Output layout: 12-byte IV | 16-byte auth tag | ciphertext. */
export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(key: Buffer, blob: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export const encryptString = (key: Buffer, s: string) => encrypt(key, Buffer.from(s, "utf8")).toString("base64");
export const decryptString = (key: Buffer, b64: string) => decrypt(key, Buffer.from(b64, "base64")).toString("utf8");
