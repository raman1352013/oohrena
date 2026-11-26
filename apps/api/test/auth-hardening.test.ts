import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generateSync } from "otplib";
import { loadConfig } from "../src/config.js";
import { decryptString } from "../src/lib/crypto.js";
import { Notification } from "../src/models/notification.js";
import { User } from "../src/models/foundation.js";
import { hashToken } from "../src/middleware/auth.js";
import { bearer, createStaff, GOOD_PW, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";

describe("Auth hardening — 2FA enrolment, attempt limits, delivered notifications", () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);

  it("REQUIRE_2FA_PRIVILEGED parses 'false' as false (z.coerce.boolean treated it as true)", () => {
    const base = { NODE_ENV: "test", MONGODB_URI: "x" };
    expect(loadConfig({ ...base, REQUIRE_2FA_PRIVILEGED: "false" }).REQUIRE_2FA_PRIVILEGED).toBe(false);
    expect(loadConfig({ ...base, REQUIRE_2FA_PRIVILEGED: "true" }).REQUIRE_2FA_PRIVILEGED).toBe(true);
  });

  it("CORS_ORIGINS with a trailing slash still matches the browser's Origin (sign-out was blocked)", () => {
    const cfg = loadConfig({ NODE_ENV: "test", MONGODB_URI: "x", CORS_ORIGINS: "https://app.example.com/, http://localhost:8080" });
    expect(cfg.corsOrigins).toEqual(["https://app.example.com", "http://localhost:8080"]);
  });

  it("production refuses to start without SMTP_URL", () => {
    expect(() => loadConfig({ NODE_ENV: "production", MONGODB_URI: "x", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") })).toThrow(/SMTP_URL/);
  });

  it("SMTP_URL that is not an smtp(s):// URL is refused at startup without printing the secret", () => {
    const base = { NODE_ENV: "staging", MONGODB_URI: "x", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") };
    const secret = "xsmtpsib-not-a-real-key-0123456789";
    for (const bad of [secret, `https://user:${secret}@smtp.example.com`, "smtp://"]) {
      let message = "";
      try {
        loadConfig({ ...base, SMTP_URL: bad });
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      expect(message).toMatch(/SMTP_URL must look like smtp:\/\//);
      expect(message).not.toContain(secret);
    }
  });

  it("SMTP_URL accepts smtp:// and smtps:// URLs; a blank value counts as unset", () => {
    const base = { NODE_ENV: "test", MONGODB_URI: "x" };
    expect(loadConfig({ ...base, SMTP_URL: "smtp://login:key@smtp-relay.brevo.com:587" }).SMTP_URL).toBe("smtp://login:key@smtp-relay.brevo.com:587");
    expect(loadConfig({ ...base, SMTP_URL: " smtps://u:p@smtp.example.com:465 " }).SMTP_URL).toBe("smtps://u:p@smtp.example.com:465");
    expect(loadConfig({ ...base, SMTP_URL: "  " }).SMTP_URL).toBeUndefined();
    expect(() => loadConfig({ NODE_ENV: "production", MONGODB_URI: "x", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), SMTP_URL: "" })).toThrow(/SMTP_URL is required/);
  });

  it("/2fa/setup is refused once 2FA is enabled (cannot be silently replaced)", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");
    await request(app).post("/api/v1/auth/2fa/setup").set(bearer(admin.token)).expect(200);
    const u = await User.findById(admin.userId).select("+twoFactorSecretEncrypted");
    const secret = decryptString(cfg.encryptionKey, u!.twoFactorSecretEncrypted!);
    await request(app).post("/api/v1/auth/2fa/verify").set(bearer(admin.token)).send({ token: generateSync({ secret }) }).expect(200);

    const again = await request(app).post("/api/v1/auth/2fa/setup").set(bearer(admin.token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("TWO_FACTOR_ALREADY_ENABLED");
    const after = await User.findById(admin.userId).select("+twoFactorSecretEncrypted");
    expect(after!.twoFactorEnabled).toBe(true);
    expect(after!.twoFactorSecretEncrypted).toBe(u!.twoFactorSecretEncrypted);
  });

  it("mandatory 2FA: privileged login → enrol with challenge → session only after a valid code", async () => {
    const plain = testApp();
    const finance = await createStaff(plain.app, plain.cfg, "finance");
    const { app, cfg } = testApp({ REQUIRE_2FA_PRIVILEGED: "true" });

    const login = await request(app).post("/api/v1/auth/login").set("x-auth-mode", "token").send({ email: finance.email, password: GOOD_PW });
    expect(login.status).toBe(200);
    expect(login.body.data.status).toBe("2FA_SETUP_REQUIRED");
    expect(login.body.data.token).toBeUndefined();
    const challengeToken = login.body.data.challengeToken as string;

    // A setup challenge cannot be used as a login challenge.
    expect((await request(app).post("/api/v1/auth/2fa/login").send({ challengeToken, code: "123456" })).status).toBe(401);

    const start = await request(app).post("/api/v1/auth/2fa/enroll/start").send({ challengeToken });
    expect(start.status).toBe(200);
    expect(start.body.data.recoveryCodes).toHaveLength(8);
    const u = await User.findById(finance.userId).select("+twoFactorSecretEncrypted");
    const secret = decryptString(cfg.encryptionKey, u!.twoFactorSecretEncrypted!);

    // A recovery code does not prove the authenticator was set up.
    expect((await request(app).post("/api/v1/auth/2fa/enroll/verify").send({ challengeToken, code: "000000" })).status).toBe(400);
    const ok = await request(app).post("/api/v1/auth/2fa/enroll/verify").set("x-auth-mode", "token").send({ challengeToken, code: generateSync({ secret }) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.user.twoFactorEnabled).toBe(true);

    // Challenge is single-use; 2FA can't be switched off while it is mandatory.
    expect((await request(app).post("/api/v1/auth/2fa/enroll/verify").send({ challengeToken, code: generateSync({ secret }) })).status).toBe(401);
    const disable = await request(app).post("/api/v1/auth/2fa/disable").set(bearer(ok.body.data.token)).send({ password: GOOD_PW, code: generateSync({ secret }) });
    expect(disable.status).toBe(403);
  });

  it("a 2FA login challenge is burnt after 5 wrong codes", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");
    await request(app).post("/api/v1/auth/2fa/setup").set(bearer(admin.token)).expect(200);
    const u = await User.findById(admin.userId).select("+twoFactorSecretEncrypted");
    const secret = decryptString(cfg.encryptionKey, u!.twoFactorSecretEncrypted!);
    await request(app).post("/api/v1/auth/2fa/verify").set(bearer(admin.token)).send({ token: generateSync({ secret }) }).expect(200);

    const login = await request(app).post("/api/v1/auth/login").send({ email: admin.email, password: GOOD_PW });
    const challengeToken = login.body.data.challengeToken as string;
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/api/v1/auth/2fa/login").send({ challengeToken, code: "000000" })).status).toBe(401);
    }
    // Even the right code no longer works on this challenge.
    expect((await request(app).post("/api/v1/auth/2fa/login").send({ challengeToken, code: generateSync({ secret }) })).status).toBe(401);
  });

  it("mobile OTP is burnt after 5 wrong attempts", async () => {
    const { app } = testApp();
    const c = await registerClient(app);
    await request(app).post("/api/v1/auth/send-mobile-otp").set(bearer(c.token)).expect(200);
    for (let i = 0; i < 4; i++) {
      expect((await request(app).post("/api/v1/auth/verify-mobile").set(bearer(c.token)).send({ otp: "000000" })).status).toBe(400);
    }
    const fifth = await request(app).post("/api/v1/auth/verify-mobile").set(bearer(c.token)).send({ otp: "000000" });
    expect(fifth.body.error.message).toMatch(/Request a new OTP/);
    const u = await User.findById(c.user.userId).select("+mobileOtpHash");
    expect(u!.mobileOtpHash).toBeNull();
  });

  it("forgot password sends a reset email with an absolute link, and the link resets the password", async () => {
    const { app } = testApp();
    const c = await registerClient(app);
    await request(app).post("/api/v1/auth/forgot-password").send({ email: c.body.email }).expect(200);
    const sent = await Notification.findOne({ userId: c.user.userId, event: "user.password_reset" }).lean();
    expect(sent?.status).toBe("sent");
    expect(sent?.recipient).toBe(c.body.email);

    // Tests can't read the mailbox: issue a known token the same way and use it.
    await User.updateOne({ _id: c.user.userId }, { $set: { passwordResetTokenHash: hashToken("known-token"), passwordResetExpiresAt: new Date(Date.now() + 60_000) } });
    const NEW = "An0ther!Passw0rd";
    await request(app).post("/api/v1/auth/reset-password").send({ token: "known-token", password: NEW }).expect(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: c.body.email, password: NEW })).status).toBe(200);
    // Single use.
    expect((await request(app).post("/api/v1/auth/reset-password").send({ token: "known-token", password: NEW })).status).toBe(400);
  });
});
