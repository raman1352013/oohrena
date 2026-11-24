import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditLog } from "../src/models/audit-log.js";
import { audit, computeLogHash, redact, verifyAuditChain } from "../src/lib/audit.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";

describe("V0.4: Audit log hardening, hash chain & append-only protection", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("AT-AUD-01: Critical actions write tamper-evident audit entries with hash chain, actorType & requestId", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    // Clear prior logs in test collection to test fresh chain
    // (Notice Mongoose blocks deleteMany directly, so we use the underlying collection if needed, but let's test fresh append)
    const initialCount = await AuditLog.countDocuments();

    // Perform an audit log write via audit() with request context
    const fakeReq: any = {
      user: { userId: admin.userId, role: "admin" },
      ip: "127.0.0.1",
      get: (header: string) => (header === "user-agent" ? "TestAgent/1.0" : null),
      headers: { "x-request-id": "req-test-12345" },
    };

    await audit(fakeReq, {
      action: "listing.rate.update",
      entity: "inventory",
      entityId: "INV-001",
      before: { baseRate: 10000, accountNo: "1234567890", twoFactorSecretEncrypted: "secret123" },
      after: { baseRate: 12000, accountNo: "1234567890", twoFactorSecretEncrypted: "secret123" },
      reason: "Annual rate revision",
    });

    const entries = await AuditLog.find({ action: "listing.rate.update" }).lean();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;

    expect(entry.actorType).toBe("user");
    expect(entry.userId).toBe(admin.userId);
    expect(entry.role).toBe("admin");
    expect(entry.requestId).toBe("req-test-12345");
    expect(entry.ip).toBe("127.0.0.1");
    expect(entry.prevHash).toBeDefined();
    expect(entry.hash).toBeDefined();

    // Verify secrets redaction
    expect((entry.before as any).accountNo).toBeUndefined();
    expect((entry.before as any).twoFactorSecretEncrypted).toBeUndefined();
    expect((entry.before as any).baseRate).toBe(10000);
    expect((entry.after as any).baseRate).toBe(12000);

    // Verify hash calculation integrity
    const recomputed = computeLogHash({
      prevHash: entry.prevHash,
      at: entry.at,
      userId: entry.userId,
      role: entry.role,
      actorType: entry.actorType,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
      requestId: entry.requestId,
    });
    expect(entry.hash).toBe(recomputed);
  });

  it("AT-AUD-02: App-level immutability throws on any update/delete operation", async () => {
    const log = await AuditLog.findOne().sort({ _id: -1 });
    expect(log).not.toBeNull();

    // 1. updateOne throws
    await expect(AuditLog.updateOne({ _id: log!._id }, { reason: "Tampered" })).rejects.toThrow(
      "Audit log is append-only",
    );

    // 2. deleteOne throws
    await expect(AuditLog.deleteOne({ _id: log!._id })).rejects.toThrow("Audit log is append-only");

    // 3. deleteMany throws
    await expect(AuditLog.deleteMany({})).rejects.toThrow("Audit log is append-only");

    // 4. findOneAndUpdate throws
    await expect(AuditLog.findOneAndUpdate({ _id: log!._id }, { reason: "Tampered" })).rejects.toThrow(
      "Audit log is append-only",
    );

    // 5. doc.save() after mutation throws
    log!.reason = "Modified directly";
    await expect(log!.save()).rejects.toThrow("Audit log is append-only");
  });

  it("Hash-chain verification detects tamper or broken links", async () => {
    const logs = await AuditLog.find().sort({ _id: 1 }).lean();
    expect(logs.length).toBeGreaterThan(0);

    // Legitimate chain passes
    const cleanResult = verifyAuditChain(logs);
    expect(cleanResult.valid).toBe(true);

    // Tampered payload breaks self-hash verification
    const tampered = logs.map((l, idx) => (idx === logs.length - 1 ? { ...l, reason: "Hacked reason" } : l));
    const tamperedResult = verifyAuditChain(tampered);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.brokenAt).toBe(logs.length - 1);

    // Tampered hash breaks next link in chain
    if (logs.length >= 2) {
      const brokenLink = logs.map((l, idx) => (idx === 0 ? { ...l, hash: "00000000000000000000" } : l));
      const brokenResult = verifyAuditChain(brokenLink);
      expect(brokenResult.valid).toBe(false);
    }
  });

  it("GET /api/v1/audit-logs/verify-chain verifies the entire audit log collection", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");
    const auditor = await createStaff(app, cfg, "auditor");
    const client = await registerClient(app);

    // Admin & Auditor can verify chain
    const adminRes = await request(app).get("/api/v1/audit-logs/verify-chain").set(bearer(admin.token));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.valid).toBe(true);
    expect(adminRes.body.data.totalChecked).toBeGreaterThan(0);

    const auditorRes = await request(app).get("/api/v1/audit-logs/verify-chain").set(bearer(auditor.token));
    expect(auditorRes.status).toBe(200);
    expect(auditorRes.body.data.valid).toBe(true);

    // Client is forbidden (403)
    const clientRes = await request(app).get("/api/v1/audit-logs/verify-chain").set(bearer(client.token));
    expect(clientRes.status).toBe(403);
  });

  it("CSV export includes Actor Type, Request ID, and Hash columns", async () => {
    const { app, cfg } = testApp();
    const auditor = await createStaff(app, cfg, "auditor");

    const res = await request(app).get("/api/v1/audit-logs?format=csv").set(bearer(auditor.token));
    expect(res.status).toBe(200);
    expect(res.text).toContain("Actor Type");
    expect(res.text).toContain("Request ID");
    expect(res.text).toContain("Hash");
  });
});
