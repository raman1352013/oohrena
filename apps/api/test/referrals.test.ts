import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  bearer,
  clientPayload,
  createStaff,
  panFor,
  registerClient,
  startTestDb,
  stopTestDb,
  testApp,
  uniq,
  vendorPayload,
} from "./helpers.js";
import { PDF } from "./fixtures.js";
import { User, Vendor } from "../src/models/foundation.js";
import { CoinLedger, Referral } from "../src/models/referral.js";
import { approveSetting, proposeOrUpdateSetting } from "../src/services/settings.js";
import {
  addLedgerRow,
  getWalletBalance,
  onOnboardingSubmitted,
  onUserRegistered,
  tryQualify,
} from "../src/services/referrals.js";
import { ensureReferralCode } from "../src/lib/referral-code.js";

describe("T5 — Referral records and coin ledger", () => {
  const { app, cfg } = testApp();
  let adminToken: string;

  beforeAll(async () => {
    await startTestDb();
    const admin = await createStaff(app, cfg, "admin");
    adminToken = admin.token;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function setSettingValue(key: any, value: any) {
    await proposeOrUpdateSetting(key, value, "USR-000001", "Test change");
    await approveSetting(key, "USR-000002", "Test approve");
  }

  it("CoinLedger is append-only — updates and deletes throw", async () => {
    const row = await CoinLedger.create({
      _id: `CNL-TEST-${uniq()}`,
      userId: "USR-000001",
      bucket: "pending",
      delta: 50,
      reason: "referral_reward",
      idemKey: `test:hold:${uniq()}`,
      createdBy: "test",
    });

    await expect(CoinLedger.updateOne({ _id: row._id }, { $set: { delta: 100 } })).rejects.toThrow(
      "Coin ledger is append-only",
    );
    await expect(CoinLedger.deleteOne({ _id: row._id })).rejects.toThrow("Coin ledger is append-only");
    await expect(CoinLedger.deleteMany({ userId: "USR-000001" })).rejects.toThrow(
      "Coin ledger is append-only",
    );
  });

  it("addLedgerRow handles duplicate idemKey idempotently without throwing or double crediting", async () => {
    const idem = `idem-test-${uniq()}`;
    const first = await addLedgerRow({
      userId: "USR-000002",
      bucket: "available",
      delta: 100,
      reason: "admin_adjust",
      idemKey: idem,
    });
    expect(first).not.toBeNull();

    // Second call with same idemKey
    const second = await addLedgerRow({
      userId: "USR-000002",
      bucket: "available",
      delta: 100,
      reason: "admin_adjust",
      idemKey: idem,
    });
    expect(second).toBeNull();

    const bal = await getWalletBalance("USR-000002");
    expect(bal.available).toBe(100);
  });

  it("available bucket cannot go below zero", async () => {
    const userId = "USR-000003";
    await expect(
      addLedgerRow({
        userId,
        bucket: "available",
        delta: -50,
        reason: "reversal",
        idemKey: `neg:${uniq()}`,
      }),
    ).rejects.toThrow("Insufficient available coins");
  });

  it("self-referral and same mobile/email are rejected without creating referral or coins", async () => {
    const client = await registerClient(app);
    const userId = client.user.userId;
    const code = await ensureReferralCode(userId);
    expect(code).toBeTruthy();

    // Attempt self-referral
    const selfRes = await onUserRegistered({
      _id: userId,
      role: "client",
      email: client.user.email,
      mobile: client.body.mobile as string,
      referredByCode: code,
    });
    expect(selfRes).toBeNull();

    // Same email different ID
    const sameEmailRes = await onUserRegistered({
      _id: "USR-000099",
      role: "client",
      email: client.user.email,
      mobile: "+919876543210",
      referredByCode: code,
    });
    expect(sameEmailRes).toBeNull();

    // Same mobile different ID
    const sameMobileRes = await onUserRegistered({
      _id: "USR-000099",
      role: "client",
      email: "different@example.test",
      mobile: client.body.mobile as string,
      referredByCode: code,
    });
    expect(sameMobileRes).toBeNull();

    const referrals = await Referral.find({ referrerUserId: userId });
    expect(referrals.length).toBe(0);
  });

  it("awards correct coins by kind and respects settings overrides", async () => {
    // 1. Vendor -> Vendor (b2b: 100)
    const v1Res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    expect(v1Res.status).toBe(201);
    const v1Token = v1Res.body.data.token;
    const v1UserId = v1Res.body.data.user.userId;
    const v1Code = (await request(app).get("/api/v1/referrals/me").set(bearer(v1Token))).body.data.code;

    const v2Res = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ ref: v1Code }));
    expect(v2Res.status).toBe(201);

    const b2bBal = await getWalletBalance(v1UserId);
    expect(b2bBal.pending).toBe(100);
    expect(b2bBal.available).toBe(0);

    // 2. Vendor -> Client (b2c: 50)
    const c1Res = await request(app)
      .post("/api/v1/auth/register")
      .set("x-auth-mode", "token")
      .send(clientPayload({ ref: v1Code }));
    expect(c1Res.status).toBe(201);

    const afterC1Bal = await getWalletBalance(v1UserId);
    expect(afterC1Bal.pending).toBe(150);

    // 3. Client -> Client (c2c: 25)
    const c1Token = c1Res.body.data.token;
    const c1UserId = c1Res.body.data.user.userId;
    const c1Code = (await request(app).get("/api/v1/referrals/me").set(bearer(c1Token))).body.data.code;

    const c2Res = await request(app)
      .post("/api/v1/auth/register")
      .set("x-auth-mode", "token")
      .send(clientPayload({ ref: c1Code }));
    expect(c2Res.status).toBe(201);

    const c1Bal = await getWalletBalance(c1UserId);
    expect(c1Bal.pending).toBe(25);

    // 4. Change setting and verify new referral amount
    await setSettingValue("referral.coins.c2c", 75);

    const c3Res = await request(app)
      .post("/api/v1/auth/register")
      .set("x-auth-mode", "token")
      .send(clientPayload({ ref: c1Code }));
    expect(c3Res.status).toBe(201);

    const c1UpdatedBal = await getWalletBalance(c1UserId);
    expect(c1UpdatedBal.pending).toBe(100); // 25 + 75
  });

  it("qualification lifecycle: releases coins only after requirements are met; calling twice/parallel pays once", async () => {
    // Referrer: client A
    const refA = await registerClient(app);
    const codeA = (await request(app).get("/api/v1/referrals/me").set(bearer(refA.token))).body.data.code;

    // Referee: client B registering with code A
    const refB = await registerClient(app, { ref: codeA });
    const refereeUserId = refB.user.userId;

    // Check initially pending
    let balA = await getWalletBalance(refA.user.userId);
    expect(balA.pending).toBeGreaterThan(0);
    expect(balA.available).toBe(0);

    // Not qualified yet because mobile is unverified
    await tryQualify(refereeUserId);
    balA = await getWalletBalance(refA.user.userId);
    expect(balA.available).toBe(0);

    // Mark mobile verified
    await User.updateOne({ _id: refereeUserId }, { $set: { mobileVerifiedAt: new Date() } });

    // Call tryQualify in parallel
    const [p1, p2] = await Promise.all([tryQualify(refereeUserId), tryQualify(refereeUserId)]);
    expect(p1 || p2).toBeTruthy();

    balA = await getWalletBalance(refA.user.userId);
    expect(balA.available).toBeGreaterThan(0);
    expect(balA.pending).toBe(0);

    // Call tryQualify again (should be idempotent)
    await tryQualify(refereeUserId);
    const balAAfter = await getWalletBalance(refA.user.userId);
    expect(balAAfter.available).toBe(balA.available);
  });

  it("vendor referral requires both mobile verification AND KYC approval", async () => {
    const vReferrer = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    const referrerToken = vReferrer.body.data.token;
    const referrerUserId = vReferrer.body.data.user.userId;
    const refCode = (await request(app).get("/api/v1/referrals/me").set(bearer(referrerToken))).body.data.code;

    const vReferee = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ ref: refCode }));
    const refereeToken = vReferee.body.data.token;
    const refereeVendorId = vReferee.body.data.vendorId;
    const refereeUserId = vReferee.body.data.user.userId;

    // Referrer has pending coins
    let bal = await getWalletBalance(referrerUserId);
    expect(bal.pending).toBe(100);
    expect(bal.available).toBe(0);

    // Step 1: Mobile verified only -> Still NOT qualified (vendor KYC is required)
    await User.updateOne({ _id: refereeUserId }, { $set: { mobileVerifiedAt: new Date() } });
    await tryQualify(refereeUserId);
    bal = await getWalletBalance(referrerUserId);
    expect(bal.available).toBe(0);

    // Step 2: Upload KYC documents & Admin approves
    await Vendor.updateOne({ _id: refereeVendorId }, { $set: { pan: panFor() } });
    await request(app)
      .post("/api/v1/vendors/me/documents")
      .set(bearer(refereeToken))
      .field("type", "pan")
      .attach("file", PDF, { filename: "pan.pdf", contentType: "application/pdf" });

    const approveRes = await request(app)
      .post(`/api/v1/admin/vendors/${refereeVendorId}/kyc-decision`)
      .set(bearer(adminToken))
      .send({ decision: "approve" });
    expect(approveRes.status).toBe(200);

    // Now qualified & released!
    bal = await getWalletBalance(referrerUserId);
    expect(bal.available).toBe(100);
    expect(bal.pending).toBe(0);

    const ref = await Referral.findOne({ refereeUserId });
    expect(ref?.status).toBe("rewarded");
  });

  it("enforces daily referral cap", async () => {
    // Set daily cap to 2
    await setSettingValue("referral.daily_cap", 2);

    const referrer = await registerClient(app);
    const code = (await request(app).get("/api/v1/referrals/me").set(bearer(referrer.token))).body.data.code;

    // 1st referral
    const r1 = await registerClient(app, { ref: code });
    expect(r1.token).toBeTruthy();

    // 2nd referral
    const r2 = await registerClient(app, { ref: code });
    expect(r2.token).toBeTruthy();

    // 3rd referral (exceeds daily cap)
    const r3 = await registerClient(app, { ref: code });
    expect(r3.token).toBeTruthy();

    const count = await Referral.countDocuments({ referrerUserId: referrer.user.userId });
    expect(count).toBe(2);
  });

  it("KYC rejection voids pending referral and welcome bonus", async () => {
    const vReferrer = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    const referrerToken = vReferrer.body.data.token;
    const referrerUserId = vReferrer.body.data.user.userId;
    const refCode = (await request(app).get("/api/v1/referrals/me").set(bearer(referrerToken))).body.data.code;

    const vReferee = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ ref: refCode }));
    const refereeToken = vReferee.body.data.token;
    const refereeVendorId = vReferee.body.data.vendorId;
    const refereeUserId = vReferee.body.data.user.userId;

    // Grant referee welcome bonus
    await onOnboardingSubmitted(refereeUserId);
    const refereeBalBefore = await getWalletBalance(refereeUserId);
    expect(refereeBalBefore.pending).toBe(25);

    // Reject vendor KYC
    const rejectRes = await request(app)
      .post(`/api/v1/admin/vendors/${refereeVendorId}/kyc-decision`)
      .set(bearer(adminToken))
      .send({ decision: "reject", reason: "Illegible PAN document" });
    expect(rejectRes.status).toBe(200);

    // Referral is marked rejected and referrer's pending coins voided
    const ref = await Referral.findOne({ refereeUserId });
    expect(ref?.status).toBe("rejected");
    expect(ref?.rejectionReason).toBe("referee_rejected");

    const referrerBal = await getWalletBalance(referrerUserId);
    expect(referrerBal.pending).toBe(0);

    // Referee's pending welcome bonus is voided
    const refereeBalAfter = await getWalletBalance(refereeUserId);
    expect(refereeBalAfter.pending).toBe(0);
  });

  it("GET /referrals/me returns masked referee names without leaking email or mobile", async () => {
    const referrer = await registerClient(app);
    const code = (await request(app).get("/api/v1/referrals/me").set(bearer(referrer.token))).body.data.code;

    // Register referee named "Raman Kumar"
    await registerClient(app, { fullName: "Raman Kumar", ref: code });

    const res = await request(app).get("/api/v1/referrals/me").set(bearer(referrer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe(code);
    expect(res.body.data.shareLink).toContain(code);
    expect(res.body.data.rates).toBeDefined();

    const refs = res.body.data.referrals;
    expect(refs.length).toBe(1);
    expect(refs[0].refereeName).toBe("Ra*** Ku***");
    expect(refs[0].status).toBe("pending");
    // Ensure no sensitive fields leaked
    expect(refs[0].email).toBeUndefined();
    expect(refs[0].mobile).toBeUndefined();
    expect(refs[0].refereeUserId).toBeUndefined();
  });

  it("GET /wallet/me returns balance and paged ledger rows", async () => {
    const client = await registerClient(app);
    await addLedgerRow({
      userId: client.user.userId,
      bucket: "available",
      delta: 50,
      reason: "welcome_bonus",
      idemKey: `wb:${uniq()}`,
    });

    const res = await request(app).get("/api/v1/wallet/me").set(bearer(client.token));
    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(50);
    expect(res.body.data.pending).toBe(0);
    expect(res.body.data.rows.length).toBe(1);
    expect(res.body.data.rows[0].reason).toBe("welcome_bonus");
    expect(res.body.data.pagination).toBeDefined();
  });

  it("GET /wallet/:userId enforces permissions: client cannot view others (404), admin can", async () => {
    const u1 = await registerClient(app);
    const u2 = await registerClient(app);

    // u1 tries to view u2's wallet -> 404 (non-probeable per §4)
    const probeRes = await request(app).get(`/api/v1/wallet/${u2.user.userId}`).set(bearer(u1.token));
    expect(probeRes.status).toBe(404);

    // Admin views u2's wallet -> 200
    const adminRes = await request(app).get(`/api/v1/wallet/${u2.user.userId}`).set(bearer(adminToken));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.available).toBe(0);
  });

  it("POST /wallet/adjust adjusts balance, rejects missing reason, and guards against >1000 without maker-checker", async () => {
    const client = await registerClient(app);
    const userId = client.user.userId;

    // Missing reason -> 400
    const noReasonRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(adminToken))
      .send({ userId, delta: 50, reason: "  " });
    expect(noReasonRes.status).toBe(400);

    // Delta = 0 -> 400
    const zeroRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(adminToken))
      .send({ userId, delta: 0, reason: "Zero test" });
    expect(zeroRes.status).toBe(400);

    // Delta > 1000 -> 400 (maker-checker guard)
    const overLimitRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(adminToken))
      .send({ userId, delta: 2000, reason: "High reward" });
    expect(overLimitRes.status).toBe(400);
    expect(overLimitRes.body.error.message).toContain("maker-checker");

    // Client trying to adjust -> 403
    const clientRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(client.token))
      .send({ userId, delta: 50, reason: "Hack attempt" });
    expect(clientRes.status).toBe(403);

    // Valid admin adjust +100
    const validRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(adminToken))
      .send({ userId, delta: 100, reason: "Community contest winner" });
    expect(validRes.status).toBe(200);
    expect(validRes.body.data.balance.available).toBe(100);

    // Valid admin adjust -30
    const deductRes = await request(app)
      .post("/api/v1/wallet/adjust")
      .set(bearer(adminToken))
      .send({ userId, delta: -30, reason: "Correction of over-credit" });
    expect(deductRes.status).toBe(200);
    expect(deductRes.body.data.balance.available).toBe(70);
  });
});
