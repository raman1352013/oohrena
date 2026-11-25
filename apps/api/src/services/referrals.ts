import type { ClientSession } from "mongoose";
import {
  coinIdemKey,
  REFERRAL_COIN_SETTING,
  referralKindFor,
  type CoinBucket,
  type CoinReason,
  type OnboardingReward,
  type WalletBalance,
} from "@oohrena/shared";
import { nextId } from "../lib/ids.js";
import { badRequest } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { User, Vendor } from "../models/foundation.js";
import { CoinLedger, Referral } from "../models/referral.js";
import { getSetting } from "./settings.js";

/** Add a ledger row idempotently. Idempotency key collision is safely caught and ignored. */
export async function addLedgerRow({
  userId,
  bucket,
  delta,
  reason,
  refType,
  refId,
  idemKey,
  createdBy = "system",
  session,
}: {
  userId: string;
  bucket: CoinBucket;
  delta: number;
  reason: CoinReason;
  refType?: string | null;
  refId?: string | null;
  idemKey: string;
  createdBy?: string;
  session?: ClientSession;
}) {
  if (delta === 0) return null;

  // Never let available bucket drop below zero
  if (delta < 0 && bucket === "available") {
    const bal = await getWalletBalance(userId, session);
    if (bal.available + delta < 0) {
      throw badRequest("Insufficient available coins");
    }
  }

  try {
    const id = await nextId("CNL", session);
    const [row] = await CoinLedger.create(
      [
        {
          _id: id,
          userId,
          bucket,
          delta,
          reason,
          refType: refType ?? null,
          refId: refId ?? null,
          idemKey,
          createdBy,
        },
      ],
      { session },
    );
    return row;
  } catch (err: any) {
    // E11000 duplicate key on idemKey -> idempotent success
    if (err.code === 11000 || err.message?.includes("E11000") || err.message?.includes("idemKey")) {
      return null;
    }
    throw err;
  }
}

/** Aggregates total balance for a user grouped by bucket. */
export async function getWalletBalance(userId: string, session?: ClientSession): Promise<WalletBalance> {
  const q = CoinLedger.aggregate<{ _id: CoinBucket; total: number }>([
    { $match: { userId } },
    { $group: { _id: "$bucket", total: { $sum: "$delta" } } },
  ]);
  if (session) q.session(session);
  const rows = await q;

  const bal: WalletBalance = { available: 0, pending: 0 };
  for (const r of rows) {
    if (r._id === "available") bal.available = r.total;
    if (r._id === "pending") bal.pending = r.total;
  }
  return bal;
}

/**
 * Called when a new user registers with a referral code.
 * Creates a pending Referral and a pending CoinLedger row for the referrer.
 */
export async function onUserRegistered(
  user: { _id: string; role: any; email: string; mobile: string; referredByCode?: string | null },
  session?: ClientSession,
) {
  const enabled = await getSetting("referral.enabled");
  if (!enabled || !user.referredByCode) return null;

  const referrer = await User.findOne({ referralCode: user.referredByCode }).session(session ?? null).lean();
  if (!referrer) return null;

  // Anti-fraud: reject self referral, same email, same mobile
  if (referrer._id === user._id) return null;
  if (referrer.email.toLowerCase() === user.email.toLowerCase()) return null;
  if (referrer.mobile === user.mobile) return null;

  // Determine referral kind
  const kind = referralKindFor(referrer.role, false, user.role);
  if (!kind) return null;

  // Daily cap
  const dailyCap = (await getSetting("referral.daily_cap")) ?? 20;
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const countToday = await Referral.countDocuments({
    referrerUserId: referrer._id,
    createdAt: { $gte: startOfDay },
  }).session(session ?? null);

  if (countToday >= dailyCap) return null;

  const coinKey = REFERRAL_COIN_SETTING[kind];
  const coins = (await getSetting(coinKey)) ?? 50;

  const refId = await nextId("RFL", session);
  const [referral] = await Referral.create(
    [
      {
        _id: refId,
        referrerUserId: referrer._id,
        refereeUserId: user._id,
        kind,
        status: "pending",
        coins,
        reason: `Referred ${user.role} (${user._id})`,
      },
    ],
    { session },
  );

  const row = await addLedgerRow({
    userId: referrer._id,
    bucket: "pending",
    delta: coins,
    reason: "referral_reward",
    refType: "referral",
    refId,
    idemKey: coinIdemKey.referralHold(refId),
    createdBy: "system",
    session,
  });

  await audit(
    null,
    {
      action: "referral.create",
      entity: "referral",
      entityId: refId,
      after: { referrerUserId: referrer._id, refereeUserId: user._id, kind, coins },
      userId: referrer._id,
      actorType: "system",
    },
    session,
  );

  if (row) {
    await audit(
      null,
      {
        action: "coin.credit",
        entity: "coin_ledger",
        entityId: row._id,
        after: { userId: referrer._id, bucket: "pending", delta: coins },
        userId: referrer._id,
        actorType: "system",
      },
      session,
    );
  }

  return referral;
}

/**
 * Checks whether a pending referral can qualify:
 * 1. Mobile verified
 * 2. If vendor, KYC approved (if referral.require_kyc_for_vendor is true)
 * If qualified: status -> rewarded, moves coins pending -> available.
 */
export async function tryQualify(refereeUserId: string, session?: ClientSession) {
  const enabled = await getSetting("referral.enabled");
  if (!enabled) return null;

  const referee = await User.findById(refereeUserId).session(session ?? null).lean();
  if (!referee) return null;

  // Must have verified mobile
  if (!referee.mobileVerifiedAt) return null;

  // If referee is a vendor, check KYC approval
  if (referee.role === "vendor") {
    const requireKyc = await getSetting("referral.require_kyc_for_vendor");
    if (requireKyc) {
      const vendor = await Vendor.findOne({ userId: refereeUserId }).session(session ?? null).lean();
      if (vendor?.kycStatus !== "approved") return null;
    }
  }

  // 1. Qualify referral if pending
  const referral = await Referral.findOne({ refereeUserId: refereeUserId, status: "pending" }).session(session ?? null);
  if (referral) {
    const now = new Date();
    referral.status = "rewarded";
    referral.qualifiedAt = now;
    referral.rewardedAt = now;
    await referral.save({ session });

    await addLedgerRow({
      userId: referral.referrerUserId,
      bucket: "pending",
      delta: -referral.coins,
      reason: "release",
      refType: "referral",
      refId: referral._id,
      idemKey: coinIdemKey.referralRelease(referral._id, "pending"),
      createdBy: "system",
      session,
    });

    const availRow = await addLedgerRow({
      userId: referral.referrerUserId,
      bucket: "available",
      delta: referral.coins,
      reason: "release",
      refType: "referral",
      refId: referral._id,
      idemKey: coinIdemKey.referralRelease(referral._id, "available"),
      createdBy: "system",
      session,
    });

    await audit(
      null,
      {
        action: "referral.qualify",
        entity: "referral",
        entityId: referral._id,
        before: { status: "pending" },
        after: { status: "rewarded" },
        actorType: "system",
      },
      session,
    );

    if (availRow) {
      await audit(
        null,
        {
          action: "coin.credit",
          entity: "coin_ledger",
          entityId: availRow._id,
          after: { userId: referral.referrerUserId, bucket: "available", delta: referral.coins },
          userId: referral.referrerUserId,
          actorType: "system",
        },
        session,
      );
    }
  }

  // 2. Release welcome bonus for the referee if pending
  const welcomeHeld = await CoinLedger.findOne({
    userId: refereeUserId,
    idemKey: coinIdemKey.welcomeHold(refereeUserId),
  }).session(session ?? null);

  if (welcomeHeld) {
    const bonus = welcomeHeld.delta;
    await addLedgerRow({
      userId: refereeUserId,
      bucket: "pending",
      delta: -bonus,
      reason: "release",
      refType: "welcome",
      refId: refereeUserId,
      idemKey: coinIdemKey.welcomeRelease(refereeUserId, "pending"),
      createdBy: "system",
      session,
    });

    const availWelcome = await addLedgerRow({
      userId: refereeUserId,
      bucket: "available",
      delta: bonus,
      reason: "release",
      refType: "welcome",
      refId: refereeUserId,
      idemKey: coinIdemKey.welcomeRelease(refereeUserId, "available"),
      createdBy: "system",
      session,
    });

    if (availWelcome) {
      await audit(
        null,
        {
          action: "coin.credit",
          entity: "coin_ledger",
          entityId: availWelcome._id,
          after: { userId: refereeUserId, bucket: "available", delta: bonus },
          userId: refereeUserId,
          actorType: "system",
        },
        session,
      );
    }
  }

  return referral;
}

/**
 * Called when vendor submits onboarding wizard.
 * Credits welcome bonus (held in pending until qualified).
 */
export async function onOnboardingSubmitted(
  userId: string,
  session?: ClientSession,
): Promise<OnboardingReward> {
  const enabled = await getSetting("referral.enabled");
  if (!enabled) return null;

  const bonus = (await getSetting("referral.welcome_bonus")) ?? 25;

  if (bonus > 0) {
    const row = await addLedgerRow({
      userId,
      bucket: "pending",
      delta: bonus,
      reason: "welcome_bonus",
      refType: "welcome",
      refId: userId,
      idemKey: coinIdemKey.welcomeHold(userId),
      createdBy: "system",
      session,
    });

    if (row) {
      await audit(
        null,
        {
          action: "coin.credit",
          entity: "coin_ledger",
          entityId: row._id,
          after: { userId, bucket: "pending", delta: bonus },
          userId,
          actorType: "system",
        },
        session,
      );
    }
  }

  const bal = await getWalletBalance(userId, session);

  return {
    welcomeBonus: bonus,
    pendingReferralCoins: bal.pending,
    status: "pending",
  };
}

/**
 * When referee's KYC is rejected or account suspended:
 * Void still-pending referrals and pending welcome bonus.
 */
export async function onVendorRejected(userId: string, session?: ClientSession) {
  const enabled = await getSetting("referral.enabled");
  if (!enabled) return;

  const referral = await Referral.findOne({ refereeUserId: userId, status: "pending" }).session(session ?? null);
  if (referral) {
    referral.status = "rejected";
    referral.rejectedAt = new Date();
    referral.rejectionReason = "referee_rejected";
    await referral.save({ session });

    const revRow = await addLedgerRow({
      userId: referral.referrerUserId,
      bucket: "pending",
      delta: -referral.coins,
      reason: "reversal",
      refType: "referral",
      refId: referral._id,
      idemKey: coinIdemKey.referralVoid(referral._id),
      createdBy: "system",
      session,
    });

    await audit(
      null,
      {
        action: "referral.reject",
        entity: "referral",
        entityId: referral._id,
        before: { status: "pending" },
        after: { status: "rejected", reason: "referee_rejected" },
        actorType: "system",
      },
      session,
    );

    if (revRow) {
      await audit(
        null,
        {
          action: "coin.reverse",
          entity: "coin_ledger",
          entityId: revRow._id,
          after: { userId: referral.referrerUserId, bucket: "pending", delta: -referral.coins },
          userId: referral.referrerUserId,
          actorType: "system",
        },
        session,
      );
    }
  }

  const welcomeHeld = await CoinLedger.findOne({
    userId,
    idemKey: coinIdemKey.welcomeHold(userId),
  }).session(session ?? null);

  if (welcomeHeld) {
    const bonus = welcomeHeld.delta;
    const revBonus = await addLedgerRow({
      userId,
      bucket: "pending",
      delta: -bonus,
      reason: "reversal",
      refType: "welcome",
      refId: userId,
      idemKey: coinIdemKey.welcomeVoid(userId),
      createdBy: "system",
      session,
    });

    if (revBonus) {
      await audit(
        null,
        {
          action: "coin.reverse",
          entity: "coin_ledger",
          entityId: revBonus._id,
          after: { userId, bucket: "pending", delta: -bonus },
          userId,
          actorType: "system",
        },
        session,
      );
    }
  }
}
