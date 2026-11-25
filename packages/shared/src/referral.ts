import { z } from "zod";
import type { Role } from "./roles.js";
import type { SystemSettingKey } from "./settings.js";

/**
 * Referral codes and the coin wallet. Design: docs/VENDOR_ONBOARDING_ARCHITECTURE.md §3.3–3.5, §7.
 * Coins have no rupee value and never touch finance models.
 */

/* ---------- referral kinds ---------- */
/** b2b vendor→vendor · b2c vendor→client · c2c client→client · c2v client→vendor · sv Super Vendor→anyone. */
export const REFERRAL_KINDS = ["b2b", "b2c", "c2c", "c2v", "sv"] as const;
export type ReferralKind = (typeof REFERRAL_KINDS)[number];
export const REFERRAL_KIND_LABEL: Record<ReferralKind, string> = {
  b2b: "Vendor → Vendor",
  b2c: "Vendor → Client",
  c2c: "Client → Client",
  c2v: "Client → Vendor",
  sv: "Super Vendor",
};

/** Setting that holds the coins for each kind. The amount is snapshotted on the Referral when it is created. */
export const REFERRAL_COIN_SETTING = {
  b2b: "referral.coins.b2b",
  b2c: "referral.coins.b2c",
  c2c: "referral.coins.c2c",
  c2v: "referral.coins.c2v",
  sv: "referral.coins.sv",
} as const satisfies Record<ReferralKind, SystemSettingKey>;

/**
 * Which kind of referral this is, or null when it earns no coins
 * (growth partners earn through the partner programme; staff never earn; only clients and vendors can be referred).
 * `referrerIsSuperVendor` stays false until the Super Vendor network (T11) exists.
 */
export function referralKindFor(referrerRole: Role, referrerIsSuperVendor: boolean, refereeRole: Role): ReferralKind | null {
  if (refereeRole !== "client" && refereeRole !== "vendor") return null;
  if (referrerRole === "vendor") {
    if (referrerIsSuperVendor) return "sv";
    return refereeRole === "vendor" ? "b2b" : "b2c";
  }
  if (referrerRole === "client") return refereeRole === "client" ? "c2c" : "c2v";
  return null;
}

/* ---------- referral status ---------- */
export const REFERRAL_STATUSES = ["pending", "qualified", "rewarded", "rejected"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const REFERRAL_TRANSITIONS: Record<ReferralStatus, readonly ReferralStatus[]> = {
  pending: ["qualified", "rejected"],
  qualified: ["rewarded"],
  rewarded: [],
  rejected: [],
};
export const canTransitionReferral = (from: ReferralStatus, to: ReferralStatus) => REFERRAL_TRANSITIONS[from].includes(to);

export const REFERRAL_REJECT_REASONS = ["self_referral", "same_contact", "same_pan", "daily_cap", "referee_rejected", "referee_suspended"] as const;
export type ReferralRejectReason = (typeof REFERRAL_REJECT_REASONS)[number];

/* ---------- referral codes ---------- */
/** 31 characters: no 0 O 1 I L, so codes read cleanly over the phone and on WhatsApp. */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 6;
export const REFERRAL_CODE_RE = /^OOH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
export const referralCode = z.string().trim().toUpperCase().regex(REFERRAL_CODE_RE, "Enter a valid referral code");

/**
 * New code from a random source. Pass a cryptographic source on the server (`crypto.randomInt`);
 * `randomInt(max)` must return an integer in [0, max).
 */
export function generateReferralCode(randomInt: (max: number) => number): string {
  let out = "OOH-";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) out += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  return out;
}

/* ---------- coin ledger ---------- */
export const COIN_BUCKETS = ["pending", "available"] as const;
export type CoinBucket = (typeof COIN_BUCKETS)[number];
export const COIN_REASONS = ["referral_reward", "welcome_bonus", "release", "reversal", "admin_adjust"] as const;
export type CoinReason = (typeof COIN_REASONS)[number];

/**
 * Idempotency keys (unique index on CoinLedger.idemKey). Inserting the same key twice is a no-op,
 * which is what stops double coins on retries, races or two admins clicking at once.
 */
const b = (bucket: CoinBucket) => (bucket === "pending" ? "p" : "a");
export const coinIdemKey = {
  referralHold: (referralId: string) => `ref:${referralId}:hold`,
  referralRelease: (referralId: string, bucket: CoinBucket) => `ref:${referralId}:release:${b(bucket)}`,
  referralVoid: (referralId: string) => `ref:${referralId}:void`,
  welcomeHold: (userId: string) => `welcome:${userId}:hold`,
  welcomeRelease: (userId: string, bucket: CoinBucket) => `welcome:${userId}:release:${b(bucket)}`,
  welcomeVoid: (userId: string) => `welcome:${userId}:void`,
  adjust: (pendingActionId: string) => `adjust:${pendingActionId}`,
} as const;

export type WalletBalance = { available: number; pending: number };

/** Balance = sum of deltas per bucket. The ledger is the only truth; there is no stored balance. */
export function walletBalance(rows: readonly { bucket: CoinBucket; delta: number }[]): WalletBalance {
  const out: WalletBalance = { available: 0, pending: 0 };
  for (const r of rows) out[r.bucket] += r.delta;
  return out;
}

/** Admin coin correction. Positive or negative, never zero, always with a reason. */
export const MAX_COIN_ADJUST = 100_000;
export const coinAdjustInput = z
  .object({
    userId: z.string().trim().regex(/^USR-[0-9]{6}$/, "Enter a user ID like USR-000001"),
    delta: z
      .number({ error: "Enter coins" })
      .int("Use whole coins")
      .min(-MAX_COIN_ADJUST)
      .max(MAX_COIN_ADJUST)
      .refine((n) => n !== 0, "Coins can't be zero"),
    reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500),
  })
  .strict();
export type CoinAdjustInput = z.infer<typeof coinAdjustInput>;

/* ---------- display ---------- */
/** "Raman Kumar" → "Ra*** Ku***". Referral lists never show the other person's full name, email or mobile. */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${Array.from(w).slice(0, 2).join("")}***`)
    .join(" ");
}

/* ---------- API shapes ---------- */
export type ReferralListItem = {
  id: string;
  refereeName: string; // masked
  kind: ReferralKind;
  status: ReferralStatus;
  coins: number;
  createdAt: string;
};

export type CoinLedgerItem = {
  id: string;
  bucket: CoinBucket;
  delta: number;
  reason: CoinReason;
  createdAt: string;
};

/** Returned by POST /vendors/me/onboarding/submit; null until referral coins are live. The gift box shows exactly this. */
export type OnboardingReward = {
  welcomeBonus: number;
  pendingReferralCoins: number;
  status: CoinBucket;
} | null;
