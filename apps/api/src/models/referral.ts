import mongoose, { Schema } from "mongoose";
import {
  COIN_BUCKETS,
  COIN_REASONS,
  REFERRAL_KINDS,
  REFERRAL_STATUSES,
} from "@oohrena/shared";

const referralSchema = new Schema(
  {
    _id: { type: String, required: true }, // RFL-2026-000001
    referrerUserId: { type: String, required: true, index: true },
    refereeUserId: { type: String, required: true, unique: true },
    kind: { type: String, enum: REFERRAL_KINDS, required: true },
    status: { type: String, enum: REFERRAL_STATUSES, default: "pending" },
    coins: { type: Number, required: true },
    reason: { type: String, default: null },
    qualifiedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true },
);

referralSchema.index({ referrerUserId: 1, createdAt: -1 });
referralSchema.index({ status: 1 });

export const Referral = mongoose.model("Referral", referralSchema, "referrals");

const coinLedgerSchema = new Schema(
  {
    _id: { type: String, required: true }, // CNL-2026-000001
    userId: { type: String, required: true, index: true },
    bucket: { type: String, enum: COIN_BUCKETS, required: true },
    delta: { type: Number, required: true },
    reason: { type: String, enum: COIN_REASONS, required: true },
    refType: { type: String, default: null },
    refId: { type: String, default: null },
    idemKey: { type: String, required: true, unique: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date(), immutable: true },
  },
  { versionKey: false },
);

coinLedgerSchema.index({ userId: 1, createdAt: -1 });

const APPEND_ONLY = "Coin ledger is append-only";
const blocked = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const;
for (const op of blocked) {
  coinLedgerSchema.pre(op, function () {
    throw new Error(APPEND_ONLY);
  });
}

export const CoinLedger = mongoose.model("CoinLedger", coinLedgerSchema, "coin_ledger");
