import express, { type Router } from "express";
import {
  coinAdjustInput,
  coinIdemKey,
  maskName,
  type CoinAdjustInput,
  type CoinBucket,
  type CoinLedgerItem,
  type CoinReason,
  type ReferralKind,
  type ReferralListItem,
  type ReferralStatus,
} from "@oohrena/shared";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { ensureReferralCode } from "../lib/referral-code.js";
import { requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { User } from "../models/foundation.js";
import { CoinLedger, Referral } from "../models/referral.js";
import { addLedgerRow, getWalletBalance } from "../services/referrals.js";
import { getSetting } from "../services/settings.js";

/** Referral routes: /api/v1/referrals */
export function referralRoutes(cfg: Config): Router {
  const r = express.Router();

  /** GET /referrals/me — get my referral code, rates, and list of referees (masked) */
  r.get("/me", requirePermission("referral.read"), async (req, res) => {
    const userId = req.user!.userId;
    const code = await ensureReferralCode(userId);

    const webOrigin = cfg.PUBLIC_WEB_URL || cfg.corsOrigins[0] || "http://localhost:8080";
    const shareLink = code ? `${webOrigin}/register?ref=${code}` : null;

    const [b2b, b2c, c2c, c2v, welcomeBonus] = await Promise.all([
      getSetting("referral.coins.b2b"),
      getSetting("referral.coins.b2c"),
      getSetting("referral.coins.c2c"),
      getSetting("referral.coins.c2v"),
      getSetting("referral.welcome_bonus"),
    ]);

    const rates = {
      b2b: b2b ?? 100,
      b2c: b2c ?? 50,
      c2c: c2c ?? 25,
      c2v: c2v ?? 50,
      welcomeBonus: welcomeBonus ?? 25,
    };

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Referral.find({ referrerUserId: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Referral.countDocuments({ referrerUserId: userId }),
    ]);

    const refereeUserIds = items.map((ref) => ref.refereeUserId);
    const refereeUsers = await User.find({ _id: { $in: refereeUserIds } }).select("_id fullName").lean();
    const nameMap = new Map(refereeUsers.map((u) => [u._id, u.fullName]));

    const referrals: ReferralListItem[] = items.map((ref) => ({
      id: ref._id,
      refereeName: maskName(nameMap.get(ref.refereeUserId) || "User"),
      kind: ref.kind as ReferralKind,
      status: ref.status as ReferralStatus,
      coins: ref.coins,
      createdAt: (ref as any).createdAt ? (ref as any).createdAt.toISOString() : new Date().toISOString(),
    }));

    res.json({
      data: {
        code,
        shareLink,
        rates,
        referrals,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  });

  return r;
}

/** Wallet routes: /api/v1/wallet */
export function walletRoutes(): Router {
  const r = express.Router();

  /** GET /wallet/me — caller's own coin wallet balance and paged ledger history */
  r.get("/me", requirePermission("wallet.read"), async (req, res) => {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const balance = await getWalletBalance(userId);
    const [rows, total] = await Promise.all([
      CoinLedger.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CoinLedger.countDocuments({ userId }),
    ]);

    const ledgerItems: CoinLedgerItem[] = rows.map((row) => ({
      id: row._id,
      bucket: row.bucket as CoinBucket,
      delta: row.delta,
      reason: row.reason as CoinReason,
      createdAt: row.createdAt.toISOString(),
    }));

    res.json({
      data: {
        available: balance.available,
        pending: balance.pending,
        rows: ledgerItems,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  });

  /** POST /wallet/adjust — admin coin adjustment */
  r.post("/adjust", requirePermission("wallet.adjust"), validateBody(coinAdjustInput), async (req, res) => {
    const input = req.body as CoinAdjustInput;
    const targetUser = await User.findById(input.userId).lean();
    if (!targetUser) throw notFound("User not found");

    if (Math.abs(input.delta) > 1000) {
      throw badRequest("Adjustments exceeding ±1,000 coins require maker-checker approval");
    }

    const row = await addLedgerRow({
      userId: input.userId,
      bucket: "available",
      delta: input.delta,
      reason: "admin_adjust",
      idemKey: coinIdemKey.adjust(await nextId("CNL")),
      createdBy: req.user!.userId,
    });

    await audit(req, {
      action: "coin.adjust",
      entity: "user",
      entityId: input.userId,
      reason: input.reason,
      after: { delta: input.delta, ledgerId: row?._id },
    });

    const balance = await getWalletBalance(input.userId);
    res.json({ data: { ok: true, balance } });
  });

  /** GET /wallet/:userId — view wallet of a user (admin/finance/auditor, or self) */
  r.get("/:userId", requirePermission("wallet.read"), async (req, res) => {
    const targetUserId = String(req.params.userId);
    const isSelf = targetUserId === req.user!.userId;
    const isStaff = ["admin", "finance", "auditor"].includes(req.user!.role);

    if (!isSelf && !isStaff) {
      // Non-accessible existing record returns 404 per AGENTS.md §4
      throw notFound("User not found");
    }

    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) throw notFound("User not found");

    if (!isSelf) {
      await audit(req, {
        action: "wallet.view",
        entity: "user",
        entityId: targetUserId,
      });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const balance = await getWalletBalance(targetUserId);
    const [rows, total] = await Promise.all([
      CoinLedger.find({ userId: targetUserId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CoinLedger.countDocuments({ userId: targetUserId }),
    ]);

    const ledgerItems: CoinLedgerItem[] = rows.map((row) => ({
      id: row._id,
      bucket: row.bucket as CoinBucket,
      delta: row.delta,
      reason: row.reason as CoinReason,
      createdAt: row.createdAt.toISOString(),
    }));

    res.json({
      data: {
        available: balance.available,
        pending: balance.pending,
        rows: ledgerItems,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  });

  return r;
}
