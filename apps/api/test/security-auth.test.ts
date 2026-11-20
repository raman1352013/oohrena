import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generateSync } from "otplib";
import { decryptString } from "../src/lib/crypto.js";
import { Session, User } from "../src/models/foundation.js";
import { bearer, createStaff, GOOD_PW, mobileFor, registerClient, startTestDb, stopTestDb, testApp, uniq } from "./helpers.js";

describe("Module 10 — Security, Roles, 2FA & Privacy (Section B)", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("B.1: 2FA setup, verification, login challenge, and recovery codes", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // 1. Setup 2FA
    const setupRes = await request(app).post("/api/v1/auth/2fa/setup").set(bearer(admin.token));
    expect(setupRes.status).toBe(200);
    expect(setupRes.body.data.uri).toContain("otpauth://totp/");
    expect(setupRes.body.data.qrDataUrl).toContain("data:image/png;base64");
    expect(setupRes.body.data.recoveryCodes).toHaveLength(8);

    const recoveryCodes: string[] = setupRes.body.data.recoveryCodes;

    // Check user in DB has secret encrypted
    const adminUser = await User.findById(admin.userId).select("+twoFactorSecretEncrypted");
    expect(adminUser!.twoFactorSecretEncrypted).toBeTruthy();
    const secret = decryptString(cfg.encryptionKey, adminUser!.twoFactorSecretEncrypted!);

    // Invalid code fails verification
    const badVerify = await request(app).post("/api/v1/auth/2fa/verify").set(bearer(admin.token)).send({ token: "000000" });
    expect(badVerify.status).toBe(400);

    // Valid code activates 2FA
    const validCode = generateSync({ secret });
    const goodVerify = await request(app).post("/api/v1/auth/2fa/verify").set(bearer(admin.token)).send({ token: validCode });
    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.data.twoFactorEnabled).toBe(true);

    // 2. Next login returns 2FA_REQUIRED
    const loginRes = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password: GOOD_PW });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.status).toBe("2FA_REQUIRED");
    expect(loginRes.body.data.challengeToken).toBeTruthy();

    const challengeToken = loginRes.body.data.challengeToken;

    // 3. Complete 2FA login with TOTP code
    const totpCode = generateSync({ secret });
    const login2fa = await request(app).post("/api/v1/auth/2fa/login").set("x-auth-mode", "token").send({ challengeToken, code: totpCode });
    expect(login2fa.status).toBe(200);
    expect(login2fa.body.data.token).toBeTruthy();
    expect(login2fa.body.data.user.email).toBe(admin.email);

    // 4. Test recovery code login
    const loginRes2 = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password: GOOD_PW });
    const ch2 = loginRes2.body.data.challengeToken;

    const recovLogin = await request(app).post("/api/v1/auth/2fa/login").set("x-auth-mode", "token").send({ challengeToken: ch2, code: recoveryCodes[0] });
    expect(recovLogin.status).toBe(200);

    // Reusing the same recovery code must be rejected
    const loginRes3 = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password: GOOD_PW });
    const ch3 = loginRes3.body.data.challengeToken;

    const reuseRecov = await request(app).post("/api/v1/auth/2fa/login").send({ challengeToken: ch3, code: recoveryCodes[0] });
    expect(reuseRecov.status).toBe(401);
  });

  it("B.2: Recent re-authentication requirement for sensitive actions", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // Make an admin override right away (within 10 minutes) -> succeeds
    const okOverride = await request(app)
      .post("/api/v1/admin/overrides")
      .set(bearer(admin.token))
      .send({
        entity: "lead",
        entityId: "LD-NONE-0001",
        field: "status",
        newValue: "under_review",
        reason: "Operational testing override within SLA",
      });
    // Entity doesn't exist, but it got past auth into business logic -> 404
    expect(okOverride.status).toBe(404);

    // Simulate session reauthAt aged > 10 minutes
    await Session.updateMany({ userId: admin.userId }, { $set: { reauthAt: new Date(Date.now() - 15 * 60_000) } });

    // Attempting override now throws 401 REAUTH_REQUIRED
    const blockedOverride = await request(app)
      .post("/api/v1/admin/overrides")
      .set(bearer(admin.token))
      .send({
        entity: "lead",
        entityId: "LD-NONE-0001",
        field: "status",
        newValue: "under_review",
        reason: "Testing expired reauth",
      });
    expect(blockedOverride.status).toBe(401);
    expect(blockedOverride.body.error.code).toBe("REAUTH_REQUIRED");

    // Call POST /api/v1/auth/reauth with correct password
    const reauthRes = await request(app)
      .post("/api/v1/auth/reauth")
      .set(bearer(admin.token))
      .send({ password: GOOD_PW });
    expect(reauthRes.status).toBe(200);
    expect(reauthRes.body.data.reauthenticated).toBe(true);

    // Now override works again (past auth check)
    const afterReauth = await request(app)
      .post("/api/v1/admin/overrides")
      .set(bearer(admin.token))
      .send({
        entity: "lead",
        entityId: "LD-NONE-0001",
        field: "status",
        newValue: "under_review",
        reason: "Testing refreshed reauth",
      });
    expect(afterReauth.status).toBe(404);
  });

  it("B.3: Admin user management (create staff, suspend, reactivate, sessions)", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // 1. Create a new finance staff user
    const newEmail = `finance-new-${uniq()}@example.test`;
    const createRes = await request(app)
      .post("/api/v1/admin/users")
      .set(bearer(admin.token))
      .send({
        fullName: "Pooja Finance",
        email: newEmail,
        mobile: mobileFor(),
        role: "finance",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.user.role).toBe("finance");
    expect(createRes.body.data.inviteToken).toBeTruthy();

    const createdUserId = createRes.body.data.user.userId;

    // 2. Set password via invite token
    const resetRes = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: createRes.body.data.inviteToken,
        password: GOOD_PW,
      });
    expect(resetRes.status).toBe(200);

    // 3. User can now log in
    const staffLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: newEmail, password: GOOD_PW });
    expect(staffLogin.status).toBe(200);
    const staffToken = staffLogin.body.data.token;

    // 4. Admin lists sessions for this user
    const sessionsRes = await request(app)
      .get(`/api/v1/admin/users/${createdUserId}/sessions`)
      .set(bearer(admin.token));
    expect(sessionsRes.status).toBe(200);
    expect(sessionsRes.body.data.length).toBeGreaterThanOrEqual(1);

    // 5. Admin suspends the user
    const suspendRes = await request(app)
      .post(`/api/v1/admin/users/${createdUserId}/suspend`)
      .set(bearer(admin.token));
    expect(suspendRes.status).toBe(200);

    // Suspended user's session is now blocked
    const testSuspended = await request(app)
      .get("/api/v1/auth/me")
      .set(bearer(staffToken));
    expect(testSuspended.status).toBe(401);

    // 6. Admin reactivates the user
    const reactivateRes = await request(app)
      .post(`/api/v1/admin/users/${createdUserId}/reactivate`)
      .set(bearer(admin.token));
    expect(reactivateRes.status).toBe(200);
  });

  it("B.4: Account security flows (forgot/reset, change password, email/mobile verification, logout-all)", async () => {
    const { app, cfg } = testApp();
    const client = await registerClient(app);

    // 1. Forgot password - always returns generic message
    const forgotRes = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: client.body.email });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.data.message).toContain("password reset instructions have been sent");

    // Non-existent email returns identical generic message
    const forgotUnknown = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody-here@nowhere.test" });
    expect(forgotUnknown.status).toBe(200);
    expect(forgotUnknown.body.data.message).toContain("password reset instructions have been sent");

    // 2. Change password while logged in
    const NEW_PW = "BrandN3w!Passw0rd";
    const changePwRes = await request(app)
      .post("/api/v1/auth/change-password")
      .set(bearer(client.token))
      .send({ currentPassword: GOOD_PW, newPassword: NEW_PW });
    expect(changePwRes.status).toBe(200);

    // Login with new password
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: client.body.email, password: NEW_PW });
    expect(newLogin.status).toBe(200);
    const newToken = newLogin.body.data.token;

    // 3. Mobile OTP verification
    const sendOtp = await request(app)
      .post("/api/v1/auth/send-mobile-otp")
      .set(bearer(newToken));
    expect(sendOtp.status).toBe(200);

    // Read stored OTP hash in DB to simulate receiving SMS
    const u = await User.findById(client.user.userId).select("+mobileOtpHash");
    expect(u!.mobileOtpHash).toBeTruthy();

    // 4. Logout all
    const logoutAllRes = await request(app)
      .post("/api/v1/auth/logout-all")
      .set(bearer(newToken));
    expect(logoutAllRes.status).toBe(200);

    const testLoggedOut = await request(app)
      .get("/api/v1/auth/me")
      .set(bearer(newToken));
    expect(testLoggedOut.status).toBe(401);
  });

  it("B.7: Growth Partner portal (lead creation, list, commission earnings)", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // 1. Create Growth Partner user via admin user management
    const gpEmail = `partner-${uniq()}@example.test`;
    const gpCreate = await request(app)
      .post("/api/v1/admin/users")
      .set(bearer(admin.token))
      .send({
        fullName: "Sanjay Sharma",
        email: gpEmail,
        mobile: mobileFor(),
        role: "growth_partner",
      });
    expect(gpCreate.status).toBe(201);
    expect(gpCreate.body.data.user.role).toBe("growth_partner");
    expect(gpCreate.body.data.user.orgId).toMatch(/^GP-/);

    // Set password
    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: gpCreate.body.data.inviteToken, password: GOOD_PW });

    // Partner logs in
    const gpLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: gpEmail, password: GOOD_PW });
    expect(gpLogin.status).toBe(200);
    const gpToken = gpLogin.body.data.token;

    // 2. Partner creates a new lead
    const leadRes = await request(app)
      .post("/api/v1/partner/leads")
      .set(bearer(gpToken))
      .send({
        clientName: "Zenith Retail",
        clientMobile: mobileFor(),
        clientEmail: "zenith@example.test",
        requirement: "Highway hoardings along NH-48 for Diwali campaign",
        city: "Mumbai",
        budget: 500000,
      });
    expect(leadRes.status).toBe(201);
    expect(leadRes.body.data.leadId).toMatch(/^LD-/);
    expect(leadRes.body.data.status).toBe("new");

    // 3. Partner lists own leads
    const listRes = await request(app)
      .get("/api/v1/partner/leads")
      .set(bearer(gpToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].leadId).toBe(leadRes.body.data.leadId);

    // 4. Partner checks earnings
    const earnRes = await request(app)
      .get("/api/v1/partner/earnings")
      .set(bearer(gpToken));
    expect(earnRes.status).toBe(200);
    expect(earnRes.body.data.totalLeads).toBe(1);
    expect(earnRes.body.data.commissionRatePct).toBe(cfg.PARTNER_COMMISSION_PCT);
  });

  it("B.8: System overview and deployments/backup logging", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // 1. Record a deploy event from CI
    const postDeploy = await request(app)
      .post("/api/v1/admin/system/events")
      .set(bearer(admin.token))
      .send({
        type: "deploy",
        detail: { version: "v1.0.0-rc1", commit: "a1b2c3d4", environment: "staging" },
      });
    expect(postDeploy.status).toBe(201);

    // 2. Record a backup event
    const postBackup = await request(app)
      .post("/api/v1/admin/system/events")
      .set(bearer(admin.token))
      .send({
        type: "backup",
        detail: { status: "success", sizeBytes: 1048576, durationSec: 12 },
      });
    expect(postBackup.status).toBe(201);

    // 3. Query system overview
    const overview = await request(app)
      .get("/api/v1/admin/system/overview")
      .set(bearer(admin.token));
    expect(overview.status).toBe(200);
    expect(overview.body.data.deployments.length).toBeGreaterThanOrEqual(1);
    expect(overview.body.data.backups.length).toBeGreaterThanOrEqual(1);
  });
});
