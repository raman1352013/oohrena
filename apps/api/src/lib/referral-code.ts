import { randomInt } from "node:crypto";
import type { ClientSession } from "mongoose";
import { generateReferralCode, isStaffRole } from "@oohrena/shared";
import { User } from "../models/foundation.js";

/**
 * A referral code no one has yet. Checked before insert because a duplicate-key error inside a
 * transaction aborts the whole sign-up; the unique index on User.referralCode stays the final guard.
 * 31^6 ≈ 887 million codes, so a retry is rare and five tries are plenty.
 */
export async function newReferralCode(session?: ClientSession): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode(randomInt);
    if (!(await User.exists({ referralCode: code }).session(session ?? null))) return code;
  }
  throw new Error("Could not generate a unique referral code");
}

/**
 * The code a new user typed or arrived with, kept only when it belongs to an existing user.
 * Unknown codes are ignored silently so nobody can probe which codes exist.
 */
export async function resolveReferredBy(ref: string | undefined, session?: ClientSession): Promise<string | null> {
  if (!ref) return null;
  return (await User.exists({ referralCode: ref }).session(session ?? null)) ? ref : null;
}

/**
 * Users created before the referral programme have no code. Call this when a user first needs theirs
 * (wallet / share screens, T5); it is safe to call many times.
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const u = await User.findById(userId).select("referralCode isStaff role").lean();
  if (!u || u.isStaff || isStaffRole(u.role)) return null;
  if (u.referralCode) return u.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = await newReferralCode();
    try {
      const out = await User.findOneAndUpdate(
        { _id: userId, referralCode: { $exists: false } },
        { $set: { referralCode: code } },
        { returnDocument: "after" },
      ).lean();
      if (out) return out.referralCode ?? code;
      return (await User.findById(userId).select("referralCode").lean())?.referralCode ?? null;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Could not assign a referral code");
}
