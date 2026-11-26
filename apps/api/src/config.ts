import "dotenv/config";
import { z } from "zod";

/** "true"/"1"/"yes" → true; anything else (including "false") → false. z.coerce.boolean() treats "false" as true. */
const envBool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["true", "1", "yes", "on"].includes(v.trim().toLowerCase())));

function isSmtpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "smtp:" || u.protocol === "smtps:") && u.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * SMTP_URL holds a password, so the error never echoes the value. A bare provider key pasted here
 * (e.g. Brevo's "xsmtpsib-…") used to crash nodemailer at startup and print the key in the host's logs.
 * A blank value counts as unset.
 */
const smtpUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .refine(isSmtpUrl, { message: "SMTP_URL must look like smtp://USER:PASS@HOST:PORT or smtps://USER:PASS@HOST:465 (value not shown)" })
    .optional(),
);

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
  REQUIRE_2FA_PRIVILEGED: envBool.default(false),
  /** Comma-separated IPs allowed to sign in and work as Admin or Finance. Empty = no IP restriction. */
  ADMIN_ALLOWED_IPS: z.string().default(""),
  /** Public web origin used in emailed links (reset password, invites, email verification). Defaults to the first CORS origin. */
  PUBLIC_WEB_URL: z.string().url().optional(),
  /** SMTP connection URL for transactional email, e.g. smtps://USER:PASS@smtp.example.com:465 (keep in the secret store). */
  SMTP_URL: smtpUrl,
  /** Sender address for transactional email. */
  EMAIL_FROM: z.string().default("OOHRENA <no-reply@oohrena.com>"),
  /** Partner commission percentage on completed bookings. */
  PARTNER_COMMISSION_PCT: z.coerce.number().min(0).max(100).default(5),
  /**
   * Where uploaded bytes live: "s3" (S3/R2/MinIO), "mongo" (GridFS in MONGODB_URI) or "disk" (UPLOAD_DIR).
   * Default: s3 when S3_BUCKET is set, otherwise mongo in staging/production (hosts like Render wipe the
   * local disk on every deploy) and disk in development/test.
   */
  FILE_STORAGE: z.enum(["s3", "mongo", "disk"]).optional(),
  /** S3-compatible object storage bucket (AWS S3, Cloudflare R2, MinIO). */
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Redis URL for multi-instance distributed rate limiting. If unset, uses memory store. */
  REDIS_URL: z.string().optional(),
});

export type FileStorage = "s3" | "mongo" | "disk";
export type Config = z.infer<typeof Env> & {
  corsOrigins: string[];
  secureCookies: boolean;
  encryptionKey: Buffer;
  webUrl: string;
  fileStorage: FileStorage;
};

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
  // Password reset, staff invites and email verification are delivered by email; without SMTP nobody can recover an account.
  if (env.NODE_ENV === "production" && !env.SMTP_URL) throw new Error("SMTP_URL is required in production (password reset and invite emails)");
  // Browsers send Origin as scheme://host[:port] with no path or trailing slash; normalise the configured
  // values the same way so "https://app.example/" in the dashboard still matches.
  const corsOrigins = env.CORS_ORIGINS.split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const fileStorage: FileStorage = env.FILE_STORAGE ?? (env.S3_BUCKET ? "s3" : secure ? "mongo" : "disk");
  if (fileStorage === "s3" && !env.S3_BUCKET) throw new Error("FILE_STORAGE=s3 needs S3_BUCKET");
  return {
    ...env,
    fileStorage,
    encryptionKey,
    corsOrigins,
    webUrl: (env.PUBLIC_WEB_URL ?? corsOrigins[0] ?? "http://localhost:8080").replace(/\/$/, ""),
    secureCookies: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
  };
}
