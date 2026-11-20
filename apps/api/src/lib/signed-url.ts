import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "../config.js";

/** Short-lived signed links for private proof files (default 10 minutes). The signature binds file id + expiry. */
const keyFor = (cfg: Config) => createHmac("sha256", cfg.encryptionKey).update("oohrena-signed-url-v1").digest();

export function signFileUrl(cfg: Config, fileId: string, ttlSec = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac("sha256", keyFor(cfg)).update(`${fileId}.${exp}`).digest("base64url");
  return `/api/v1/files/signed/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(cfg: Config, fileId: string, exp: string, sig: string) {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Math.floor(Date.now() / 1000)) return false;
  const want = createHmac("sha256", keyFor(cfg)).update(`${fileId}.${e}`).digest();
  const got = Buffer.from(sig, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}
