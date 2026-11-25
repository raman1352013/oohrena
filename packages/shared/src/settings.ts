import { z } from "zod";

/**
 * Blueprint defaults for all platform thresholds and weights.
 * Rule: No hard-coded thresholds — all numbers are read from system_settings.
 */
export const DEFAULT_SYSTEM_SETTINGS = {
  // GPS & Location
  "gps.max_accuracy_m": 20,
  "gps.photo_pin_max_m": 50,
  "location.retention_days": 90,

  // Asset & Photos
  "asset.duplicate_radius_m": 15,
  "photo.max_age_days": 30,
  "photo.min_long_side_px": 1600,
  "photo.max_mb": 15,
  "photo.gallery_allowed": false,
  "rate.change_guard_pct": 25,

  // Verification & SLA
  "reverify.cycle_days": 90,
  "reverify.high_risk_days": 60,
  "reverify.reminders": [30, 14, 7, 1] as number[],
  "verifier.sla_days": 3,
  "enquiry.ack_sla_h": 24,
  "enquiry.quote_sla_h": 48,

  // Deals, Holds & Execution
  "hold.payment_window_h": 48,
  "quote.valid_days": 5,
  "availability.reminder_days": 14,
  "availability.unconfirmed_days": 30,
  "proof.max_upload_delay_h": 2,
  "proof.inspection_every_days": 7,
  "dispute.window_days": 5,

  // Finance & Scoring
  "bank.payout_hold_h": 48,
  "score.weights": {
    inventory_accuracy: 25,
    response_time: 15,
    execution_timeliness: 20,
    proof_quality: 15,
    availability_reliability: 10,
    buyer_rating: 10,
    compliance: 5,
  } as Record<string, number>,

  // Referral coins (docs/VENDOR_ONBOARDING_ARCHITECTURE.md §3.5). Coins have no rupee value.
  "referral.enabled": true as boolean,
  "referral.coins.b2b": 100,
  "referral.coins.b2c": 50,
  "referral.coins.c2c": 25,
  "referral.coins.c2v": 50,
  "referral.coins.sv": 35,
  "referral.welcome_bonus": 25,
  "referral.daily_cap": 20,
  "referral.require_kyc_for_vendor": true as boolean,
};

export type SystemSettingKey = keyof typeof DEFAULT_SYSTEM_SETTINGS;

/**
 * Sensitive keys requiring maker-checker approval (cannot be applied by the same admin who proposed them).
 */
export const SENSITIVE_SETTING_KEYS: SystemSettingKey[] = [
  "bank.payout_hold_h",
  "rate.change_guard_pct",
  "score.weights",
];

/** Every referral.* key changes what people earn, so all of them need a second admin. */
export const isSensitiveSetting = (key: string): boolean =>
  SENSITIVE_SETTING_KEYS.includes(key as SystemSettingKey) || key.startsWith("referral.");

export const settingUpdateInput = z
  .object({
    value: z.unknown(),
    reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500),
  })
  .strict();
export type SettingUpdateInput = z.infer<typeof settingUpdateInput>;

export const settingApproveInput = z
  .object({
    reason: z.string().trim().min(3, "Give a reason").max(500).optional(),
  })
  .strict();
export type SettingApproveInput = z.infer<typeof settingApproveInput>;

export type SystemSettingItem = {
  key: string;
  value: unknown;
  version: number;
  effectiveFrom: string;
  changedBy: string;
  pendingValue?: unknown | null;
  pendingChangedBy?: string | null;
  pendingReason?: string | null;
  pendingRequestedAt?: string | null;
  status: "active" | "pending_approval";
};
