import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CORS_ORIGINS: z.string().default("http://localhost:8080,http://localhost:3000"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** 32-byte key, base64. Encrypts bank account numbers and KYC files at rest. */
  DATA_ENCRYPTION_KEY: z.string().optional(),
  /** Private directory for uploaded files (never served statically). */
  UPLOAD_DIR: z.string().default("./uploads"),
  /** Default platform margin used to suggest the client-facing indicative price on approval. */
  DEFAULT_MARGIN_PCT: z.coerce.number().min(0).max(200).default(20),
  /** Temporary hold length before automatic expiry (MVP default 48 h). */
  HOLD_HOURS: z.coerce.number().positive().max(24 * 30).default(48),
  /** Require 2FA for admin and finance accounts in production/staging. */
  REQUIRE_2FA_PRIVILEGED: z.coerce.boolean().default(false),
  /** Partner commission percentage on completed bookings. */
  PARTNER_COMMISSION_PCT: z.coerce.number().min(0).max(100).default(5),
  /** S3-compatible object storage bucket (AWS S3, Cloudflare R2, MinIO). If unset, falls back to local UPLOAD_DIR. */
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Redis URL for multi-instance distributed rate limiting. If unset, uses memory store. */
  REDIS_URL: z.string().optional(),
});

export type Config = z.infer<typeof Env> & { corsOrigins: string[]; secureCookies: boolean; encryptionKey: Buffer };

/** Fixed key for local dev/test only — production and staging must set DATA_ENCRYPTION_KEY. */
const DEV_KEY = Buffer.alloc(32, "oohrena-dev-only-key");

export function loadConfig(overrides: Record<string, unknown> = {}): Config {
  const env = Env.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === "production" && env.BCRYPT_COST < 12) throw new Error("BCRYPT_COST must be >= 12 in production");
  const secure = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  let encryptionKey = DEV_KEY;
  if (env.DATA_ENCRYPTION_KEY) {
    encryptionKey = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");
    if (encryptionKey.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  } else if (secure) throw new Error("DATA_ENCRYPTION_KEY is required in staging/production");
  return {
    ...env,
    encryptionKey,
    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    secureCookies: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
  };
}
