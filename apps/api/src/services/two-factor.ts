import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import type { Config } from "../config.js";
import { decryptString, encryptString } from "../lib/crypto.js";
import { hashToken } from "../middleware/auth.js";

export async function generateTwoFactorSetup(cfg: Config, email: string) {
  const secret = generateSecret();
  const uri = generateURI({ secret, issuer: "OOHRENA", label: email });
  const qrDataUrl = await QRCode.toDataURL(uri);
  const secretEncrypted = encryptString(cfg.encryptionKey, secret);

  const recoveryCodes = Array.from({ length: 8 }, () =>
    randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})(.{4})/, "$1-$2"),
  );
  const recoveryCodeHashes = recoveryCodes.map((c) => hashToken(c.replace(/[-\s]/g, "")));

  return {
    secret,
    secretEncrypted,
    uri,
    qrDataUrl,
    recoveryCodes,
    recoveryCodeHashes,
  };
}

export function verifyTwoFactorCode(
  cfg: Config,
  user: { twoFactorSecretEncrypted?: string | null; twoFactorRecoveryCodes?: string[] },
  code: string,
): { valid: boolean; usedRecoveryHash?: string } {
  const normalized = code.replace(/[-\s]/g, "").trim().toUpperCase();

  // 1. Check recovery codes
  const hashed = hashToken(normalized);
  if (user.twoFactorRecoveryCodes?.includes(hashed)) {
    return { valid: true, usedRecoveryHash: hashed };
  }

  // 2. Check TOTP authenticator
  if (user.twoFactorSecretEncrypted) {
    try {
      const secret = decryptString(cfg.encryptionKey, user.twoFactorSecretEncrypted);
      const res = verifySync({ token: normalized, secret });
      if (res.valid) return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  return { valid: false };
}
