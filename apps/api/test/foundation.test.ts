import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditLog } from "../src/models/audit-log.js";
import { Consent } from "../src/models/foundation.js";
import { nextId } from "../src/lib/ids.js";
import { GOOD_PW, ORIGIN, bearer, clientPayload, createStaff, registerClient, startTestDb, stopTestDb, testApp, vendorPayload } from "./helpers.js";

const { app, cfg } = testApp();

beforeAll(startTestDb);
afterAll(stopTestDb);

describe("Module 1/10 — client registration & login", () => {
  it("registers a client with server-generated IDs, consents and an audit entry", async () => {
    const body = clientPayload({ role: "admin" }); // role in body must be ignored
    const res = await request(app).post("/api/v1/auth/register").send(body);
    expect(res.status).toBe(201);
    const u = res.body.data.user;
    expect(u.role).toBe("client");
    expect(u.userId).toMatch(/^USR-\d{6}$/);
    expect(u.orgId).toMatch(/^CLT-\d{6}$/);
    expect(res.body.data.token).toBeUndefined(); // browser flow: cookie only
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/oohrena_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(await Consent.countDocuments({ userId: u.userId })).toBe(3);
    expect(await AuditLog.countDocuments({ action: "auth.register", entityId: u.userId })).toBe(1);
  });

  it("rejects duplicate email with 409 and weak input with 400 field details", async () => {
    const first = await registerClient(app);
    const dup = await request(app).post("/api/v1/auth/register").send(clientPayload({ email: first.body.email }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");

    const bad = await request(app).post("/api/v1/auth/register").send(clientPayload({ password: "short", gstin: "123", acceptTerms: false }));
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(["password", "gstin", "acceptTerms"]));
  });

  it("logs in, reads /me, logs out and the token stops working", async () => {
    const { body } = await registerClient(app);
    const login = await request(app).post("/api/v1/auth/login").set("x-auth-mode", "token").send({ email: body.email, password: GOOD_PW });
    expect(login.status).toBe(200);
    const t = login.body.data.token;
    expect((await request(app).get("/api/v1/auth/me").set(bearer(t))).body.data.user.email).toBe(body.email);
    expect((await request(app).post("/api/v1/auth/logout").set(bearer(t))).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set(bearer(t))).status).toBe(401);
  });

  it("edits the business profile; change persists and is audited with before/after", async () => {
    const { token, user } = await registerClient(app);
    const put = await request(app).put("/api/v1/clients/me").set(bearer(token)).send({ gstin: "27AAPFU0939F1ZV" });
    expect(put.status).toBe(200);
    expect((await request(app).get("/api/v1/clients/me").set(bearer(token))).body.data.gstin).toBe("27AAPFU0939F1ZV");
    const log = await AuditLog.findOne({ action: "client.profile.update", entityId: user.orgId }).lean();
    expect(log?.before).toEqual({ gstin: null });
    expect(log?.after).toEqual({ gstin: "27AAPFU0939F1ZV" });
    // Unknown fields are rejected, not silently stored.
    expect((await request(app).put("/api/v1/clients/me").set(bearer(token)).send({ role: "admin" })).status).toBe(400);
  });
});

describe("Module 2 — vendor registration", () => {
  it("starts vendor KYC as pending, masks PAN, and blocks client-only routes", async () => {
    const res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toMatch(/^VND-\d{6}$/);
    expect(res.body.data.kycStatus).toBe("pending");
    const t = res.body.data.token;
    const me = await request(app).get("/api/v1/vendors/me").set(bearer(t));
    expect(me.body.data.pan).toMatch(/^[A-Z]{2}X{5}/);
    expect((await request(app).get("/api/v1/clients/me").set(bearer(t))).status).toBe(403);
  });
});

describe("Module 10 — access control", () => {
  it("returns 401 without a session and 403 for the wrong role", async () => {
    expect((await request(app).get("/api/v1/admin/users")).status).toBe(401);
    const { token } = await registerClient(app);
    for (const path of ["/api/v1/admin/users", "/api/v1/audit-logs", "/api/v1/admin/system/deployments", "/api/v1/vendors/me"]) {
      expect((await request(app).get(path).set(bearer(token))).status, path).toBe(403);
    }
  });

  it("client A only ever sees their own profile via /clients/me", async () => {
    const a = await registerClient(app, { companyName: "Alpha Ltd" });
    const b = await registerClient(app, { companyName: "Beta Ltd" });
    expect((await request(app).get("/api/v1/clients/me").set(bearer(a.token))).body.data.companyName).toBe("Alpha Ltd");
    expect((await request(app).get("/api/v1/clients/me").set(bearer(b.token))).body.data.companyName).toBe("Beta Ltd");
  });

  it("role change needs a reason, is audited, revokes the user's sessions, and can't target yourself", async () => {
    const admin = await createStaff(app, cfg, "admin");
    const target = await registerClient(app);
    const path = `/api/v1/admin/users/${target.user.userId}/role`;
    expect((await request(app).post(path).set(bearer(admin.token)).send({ role: "growth_partner" })).status).toBe(400);
    const ok = await request(app).post(path).set(bearer(admin.token)).send({ role: "growth_partner", reason: "Moved to partner programme" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe("growth_partner");
    expect((await request(app).get("/api/v1/auth/me").set(bearer(target.token))).status).toBe(401);
    const log = await AuditLog.findOne({ action: "user.role.assign", entityId: target.user.userId }).lean();
    expect(log).toMatchObject({ userId: admin.userId, before: { role: "client" }, after: { role: "growth_partner" }, reason: "Moved to partner programme" });
    const self = await request(app).post(`/api/v1/admin/users/${admin.userId}/role`).set(bearer(admin.token)).send({ role: "client", reason: "x" });
    expect(self.status).toBe(403);
  });

  it("blocks cookie-authenticated writes from foreign or missing origins (CSRF)", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(clientPayload());
    const cookie = res.headers["set-cookie"]!;
    const noOrigin = await request(app).put("/api/v1/clients/me").set("Cookie", cookie).send({ companyName: "X" });
    expect(noOrigin.status).toBe(403);
    const evil = await request(app).put("/api/v1/clients/me").set("Cookie", cookie).set("Origin", "https://evil.example").send({ companyName: "X" });
    expect(evil.status).toBe(403);
    const good = await request(app).put("/api/v1/clients/me").set("Cookie", cookie).set("Origin", ORIGIN).send({ companyName: "Good Co" });
    expect(good.status).toBe(200);
  });
});

describe("Module 10 — brute-force protection", () => {
  it("locks the account after 5 failures, even for the right password, and logs it", async () => {
    const { body, user } = await registerClient(app);
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/api/v1/auth/login").send({ email: body.email, password: "Wrong!Pass123" })).status).toBe(401);
    }
    const locked = await request(app).post("/api/v1/auth/login").send({ email: body.email, password: GOOD_PW });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(await AuditLog.countDocuments({ action: "auth.locked", entityId: user.userId })).toBe(1);
  });

  it("gives the same answer for unknown emails and wrong passwords", async () => {
    const r = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.test", password: "Whatever!123" });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe("Email or password is incorrect");
  });

  it("rate-limits the login endpoint per IP", async () => {
    const limited = testApp({ AUTH_RATE_LIMIT_PER_MINUTE: 3 }).app;
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(limited).post("/api/v1/auth/login").send({ email: "x@example.test", password: "y" })).status);
    expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(3)).toEqual([429, 429]);
  });
});

describe("Module 9/10 — audit trail", () => {
  it("is append-only through the model", async () => {
    await expect(AuditLog.updateOne({}, { $set: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndDelete({})).rejects.toThrow(/append-only/);
    const doc = await AuditLog.findOne();
    doc!.set("reason", "edited");
    await expect(doc!.save()).rejects.toThrow(/append-only/);
  });

  it("is searchable by Finance/Audit and never exposes secrets", async () => {
    const fin = await createStaff(app, cfg, "finance");
    const res = await request(app).get("/api/v1/audit-logs?action=auth.register&pageSize=5").set(bearer(fin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/password|tokenHash/i);
  });
});

describe("Unique IDs", () => {
  it("never repeats under concurrent allocation", async () => {
    const ids = await Promise.all(Array.from({ length: 50 }, () => nextId("LD")));
    expect(new Set(ids).size).toBe(50);
    expect(ids[0]).toMatch(new RegExp(`^LD-${new Date().getFullYear()}-\\d{6}$`));
  });
});

describe("System", () => {
  it("health check reports db status without sensitive data", async () => {
    const r = await request(app).get("/api/v1/system/health");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data).sort()).toEqual(["db", "status", "time"]);
  });

  it("unknown routes and malformed JSON return the standard error envelope", async () => {
    expect((await request(app).get("/api/v1/nope")).body.error.code).toBe("NOT_FOUND");
    const r = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{bad json");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
  });
});
