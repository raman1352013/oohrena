import { describe, expect, it } from "vitest";
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_RE,
  REFERRAL_COIN_SETTING,
  REFERRAL_KINDS,
  coinAdjustInput,
  coinIdemKey,
  canTransitionReferral,
  generateReferralCode,
  maskName,
  referralCode,
  referralKindFor,
  walletBalance,
} from "./referral";
import { ROLES, can, scopeFor } from "./roles";
import { DEFAULT_SYSTEM_SETTINGS, isSensitiveSetting } from "./settings";
import { formatId } from "./ids";

describe("referralKindFor", () => {
  it("maps every sharer → joiner pair from the reward table", () => {
    expect(referralKindFor("vendor", false, "vendor")).toBe("b2b");
    expect(referralKindFor("vendor", false, "client")).toBe("b2c");
    expect(referralKindFor("client", false, "client")).toBe("c2c");
    expect(referralKindFor("client", false, "vendor")).toBe("c2v");
    expect(referralKindFor("vendor", true, "vendor")).toBe("sv");
    expect(referralKindFor("vendor", true, "client")).toBe("sv");
  });
  it("gives no coins to growth partners or staff, and nobody earns for referring staff", () => {
    for (const r of ROLES) {
      if (r === "vendor" || r === "client") continue;
      expect(referralKindFor(r, false, "vendor")).toBeNull();
      expect(referralKindFor(r, false, "client")).toBeNull();
    }
    expect(referralKindFor("vendor", false, "admin")).toBeNull();
    expect(referralKindFor("client", false, "growth_partner")).toBeNull();
  });
  it("ignores the Super Vendor flag for clients", () => {
    expect(referralKindFor("client", true, "client")).toBe("c2c");
  });
});

describe("referral status", () => {
  it("only moves forward", () => {
    expect(canTransitionReferral("pending", "qualified")).toBe(true);
    expect(canTransitionReferral("pending", "rejected")).toBe(true);
    expect(canTransitionReferral("qualified", "rewarded")).toBe(true);
    expect(canTransitionReferral("rewarded", "pending")).toBe(false);
    expect(canTransitionReferral("rejected", "qualified")).toBe(false);
    expect(canTransitionReferral("pending", "rewarded")).toBe(false);
  });
});

describe("referral codes", () => {
  it("has 31 unambiguous characters", () => {
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(31);
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it("generates codes that match the format", () => {
    let seed = 7;
    const rnd = (max: number) => (seed = (seed * 31 + 11) % 997) % max;
    for (let i = 0; i < 50; i++) expect(generateReferralCode(rnd)).toMatch(REFERRAL_CODE_RE);
    expect(generateReferralCode(() => 0)).toBe("OOH-222222");
    expect(generateReferralCode((m) => m - 1)).toBe("OOH-ZZZZZZ");
  });
  it("normalises typed codes and rejects bad ones", () => {
    expect(referralCode.parse(" ooh-7k2q9m ")).toBe("OOH-7K2Q9M");
    expect(referralCode.safeParse("OOH-7K2Q9").success).toBe(false);
    expect(referralCode.safeParse("OOH-0OIL11").success).toBe(false);
    expect(referralCode.safeParse("ABC-7K2Q9M").success).toBe(false);
  });
});

describe("coin ledger", () => {
  it("sums deltas per bucket", () => {
    expect(walletBalance([])).toEqual({ available: 0, pending: 0 });
    expect(
      walletBalance([
        { bucket: "pending", delta: 100 },
        { bucket: "pending", delta: 25 },
        { bucket: "pending", delta: -100 },
        { bucket: "available", delta: 100 },
        { bucket: "available", delta: -10 },
      ]),
    ).toEqual({ available: 90, pending: 25 });
  });
  it("builds one distinct idempotency key per event", () => {
    const keys = [
      coinIdemKey.referralHold("RFL-2026-000001"),
      coinIdemKey.referralRelease("RFL-2026-000001", "pending"),
      coinIdemKey.referralRelease("RFL-2026-000001", "available"),
      coinIdemKey.referralVoid("RFL-2026-000001"),
      coinIdemKey.welcomeHold("USR-000001"),
      coinIdemKey.welcomeRelease("USR-000001", "pending"),
      coinIdemKey.welcomeRelease("USR-000001", "available"),
      coinIdemKey.welcomeVoid("USR-000001"),
      coinIdemKey.adjust("PUA-1"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(coinIdemKey.referralHold("RFL-2026-000001")).toBe("ref:RFL-2026-000001:hold");
    expect(coinIdemKey.referralRelease("RFL-2026-000001", "available")).toBe("ref:RFL-2026-000001:release:a");
  });
  it("validates admin adjustments", () => {
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 50, reason: "Event bonus" }).success).toBe(true);
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 0, reason: "Event bonus" }).success).toBe(false);
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 1.5, reason: "Event bonus" }).success).toBe(false);
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 50 }).success).toBe(false);
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 50, reason: "ok" }).success).toBe(false);
    expect(coinAdjustInput.safeParse({ userId: "VND-000001", delta: 50, reason: "Event bonus" }).success).toBe(false);
    expect(coinAdjustInput.safeParse({ userId: "USR-000001", delta: 50, reason: "Event bonus", extra: 1 }).success).toBe(false);
  });
});

describe("referral settings", () => {
  it("has the agreed coin amounts as defaults", () => {
    expect(DEFAULT_SYSTEM_SETTINGS[REFERRAL_COIN_SETTING.b2b]).toBe(100);
    expect(DEFAULT_SYSTEM_SETTINGS[REFERRAL_COIN_SETTING.b2c]).toBe(50);
    expect(DEFAULT_SYSTEM_SETTINGS[REFERRAL_COIN_SETTING.c2c]).toBe(25);
    expect(DEFAULT_SYSTEM_SETTINGS[REFERRAL_COIN_SETTING.sv]).toBe(35);
    for (const k of REFERRAL_KINDS) expect(DEFAULT_SYSTEM_SETTINGS[REFERRAL_COIN_SETTING[k]]).toBeGreaterThan(0);
  });
  it("needs a second admin to change any referral setting", () => {
    for (const key of Object.keys(DEFAULT_SYSTEM_SETTINGS).filter((k) => k.startsWith("referral."))) expect(isSensitiveSetting(key)).toBe(true);
    expect(isSensitiveSetting("gps.max_accuracy_m")).toBe(false);
  });
});

describe("referral permissions and IDs", () => {
  it("keeps wallets private and adjustments admin-only", () => {
    expect(scopeFor("client", "wallet.read")).toBe("own");
    expect(scopeFor("vendor", "wallet.read")).toBe("own");
    expect(scopeFor("finance", "wallet.read")).toBe("all");
    expect(can("vendor", "wallet.adjust")).toBe(false);
    expect(can("finance", "wallet.adjust")).toBe(false);
    expect(can("admin", "wallet.adjust")).toBe(true);
    expect(can("client", "vendor.onboarding")).toBe(false);
    expect(scopeFor("vendor", "vendor.onboarding")).toBe("own");
    expect(can("vendor", "vendor.review")).toBe(false);
    expect(can("verifier", "vendor.review")).toBe(true);
  });
  it("formats referral and ledger IDs", () => {
    expect(formatId("RFL", 1, 2026)).toBe("RFL-2026-000001");
    expect(formatId("CNL", 12, 2026)).toBe("CNL-2026-000012");
  });
});

describe("maskName", () => {
  it("keeps two letters of each word", () => {
    expect(maskName("Raman Kumar")).toBe("Ra*** Ku***");
    expect(maskName("  A  ")).toBe("A***");
    expect(maskName("राम कुमार")).not.toContain("कुमार");
  });
});
