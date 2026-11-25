import { REFERRAL_CODE_RE } from "@oohrena/shared";

/**
 * Captures referral codes from URL query string (?ref=CODE).
 * Stores { code, at } in localStorage for 30 days.
 * First touch wins: if a valid referral code is already stored and unexpired, it is preserved.
 * Safe against private browsing or localStorage access errors (all accesses in try/catch).
 */

const STORAGE_KEY = "oohrena_ref";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function captureReferralCode(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim().toUpperCase();

    if (ref && REFERRAL_CODE_RE.test(ref)) {
      const existing = getSavedReferralCode();
      if (!existing) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: ref, at: Date.now() }));
        return ref;
      }
      return existing;
    }
    return getSavedReferralCode();
  } catch {
    return null;
  }
}

export function getSavedReferralCode(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string" && typeof parsed.at === "number") {
      if (Date.now() - parsed.at < TTL_MS) {
        return parsed.code;
      }
      localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSavedReferralCode(): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}
