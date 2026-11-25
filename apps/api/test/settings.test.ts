import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { DEFAULT_SYSTEM_SETTINGS } from "@oohrena/shared";
import { bearer, createStaff, startTestDb, stopTestDb, testApp, vendorPayload } from "./helpers.js";
import { AuditLog } from "../src/models/audit-log.js";
import { SystemSetting, SystemSettingHistory } from "../src/models/settings.js";
import { initSettings } from "../src/services/settings.js";

describe("V0.2 System Settings & Thresholds Core", () => {
  let app: ReturnType<typeof testApp>["app"];
  let admin1Token: string;
  let admin1Id: string;
  let admin2Token: string;
  let vendorToken: string;

  beforeAll(async () => {
    await startTestDb();
    const t = testApp();
    app = t.app;

    const a1 = await createStaff(app, t.cfg, "admin");
    admin1Token = a1.token;
    admin1Id = a1.userId;

    const a2 = await createStaff(app, t.cfg, "admin");
    admin2Token = a2.token;

    // Register a vendor to test role denial
    const vRes = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ email: "media@vendor.test" }));
    vendorToken = vRes.body.data.token;

    await initSettings();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("seeds all blueprint default settings on startup", async () => {
    const res = await request(app)
      .get("/api/v1/admin/settings")
      .set(bearer(admin1Token));
    expect(res.status).toBe(200);
    const settings = res.body.data as { key: string; value: unknown; status: string }[];
    expect(settings.length).toBeGreaterThanOrEqual(Object.keys(DEFAULT_SYSTEM_SETTINGS).length);

    const gps = settings.find((s) => s.key === "gps.max_accuracy_m");
    expect(gps).toBeDefined();
    expect(gps?.value).toBe(20);
    expect(gps?.status).toBe("active");

    const hold = settings.find((s) => s.key === "bank.payout_hold_h");
    expect(hold).toBeDefined();
    expect(hold?.value).toBe(48);

    const weights = settings.find((s) => s.key === "score.weights");
    expect(weights).toBeDefined();
    expect(weights?.value).toMatchObject({ inventory_accuracy: 25, response_time: 15 });
  });

  it("non-admin roles are rejected with 403 Forbidden", async () => {
    const getRes = await request(app)
      .get("/api/v1/admin/settings")
      .set(bearer(vendorToken));
    expect(getRes.status).toBe(403);

    const putRes = await request(app)
      .put("/api/v1/admin/settings/gps.max_accuracy_m")
      .set(bearer(vendorToken))
      .send({ value: 15, reason: "Attempted unauthorized change" });
    expect(putRes.status).toBe(403);
  });

  it("non-sensitive setting update applies immediately, bumps version, records history, and audits", async () => {
    const res = await request(app)
      .put("/api/v1/admin/settings/gps.max_accuracy_m")
      .set(bearer(admin1Token))
      .send({ value: 15, reason: "Tighter GPS requirement for metro assets" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.value).toBe(15);
    expect(res.body.data.version).toBe(2);

    // Verify history collection
    const history = await SystemSettingHistory.findOne({ key: "gps.max_accuracy_m", version: 2 }).lean();
    expect(history).toBeDefined();
    expect(history?.value).toBe(15);
    expect(history?.reason).toBe("Tighter GPS requirement for metro assets");

    // Verify audit log
    const auditEntry = await AuditLog.findOne({ action: "setting.update", entityId: "gps.max_accuracy_m" }).lean();
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.reason).toBe("Tighter GPS requirement for metro assets");
  });

  it("sensitive setting requires maker-checker: maker cannot approve own proposal; second admin approves", async () => {
    // Admin 1 proposes reducing payout hold from 48h to 24h
    const proposeRes = await request(app)
      .put("/api/v1/admin/settings/bank.payout_hold_h")
      .set(bearer(admin1Token))
      .send({ value: 24, reason: "Reduce payout hold window for faster payouts" });
    expect(proposeRes.status).toBe(200);
    expect(proposeRes.body.data.status).toBe("pending_approval");
    expect(proposeRes.body.data.value).toBe(48); // Current value stays 48
    expect(proposeRes.body.data.pendingValue).toBe(24);
    expect(proposeRes.body.data.pendingChangedBy).toBe(admin1Id);

    // Check DB reflects pending state and value is unchanged
    const dbSetting = await SystemSetting.findById("bank.payout_hold_h").lean();
    expect(dbSetting?.value).toBe(48);
    expect(dbSetting?.pendingValue).toBe(24);

    // Audit log recorded proposal
    const propAudit = await AuditLog.findOne({ action: "setting.propose", entityId: "bank.payout_hold_h" }).lean();
    expect(propAudit).toBeDefined();

    // Maker-checker check: Admin 1 (maker) attempts to approve own change -> 400 Bad Request
    const selfApprove = await request(app)
      .post("/api/v1/admin/settings/bank.payout_hold_h/approve")
      .set(bearer(admin1Token))
      .send({ reason: "Self approval attempt" });
    expect(selfApprove.status).toBe(400);
    expect(selfApprove.body.error.message).toContain("Maker cannot approve");

    // Admin 2 (checker) approves change -> 200 OK
    const checkerApprove = await request(app)
      .post("/api/v1/admin/settings/bank.payout_hold_h/approve")
      .set(bearer(admin2Token))
      .send({ reason: "Reviewed and approved by secondary finance admin" });
    expect(checkerApprove.status).toBe(200);
    expect(checkerApprove.body.data.status).toBe("active");
    expect(checkerApprove.body.data.value).toBe(24);
    expect(checkerApprove.body.data.pendingValue).toBeNull();
    expect(checkerApprove.body.data.version).toBe(2);

    // Verify DB updated
    const finalDb = await SystemSetting.findById("bank.payout_hold_h").lean();
    expect(finalDb?.value).toBe(24);
    expect(finalDb?.pendingValue).toBeNull();

    // Verify history and audit
    const history = await SystemSettingHistory.findOne({ key: "bank.payout_hold_h", version: 2 }).lean();
    expect(history?.value).toBe(24);
    const appAudit = await AuditLog.findOne({ action: "setting.approve", entityId: "bank.payout_hold_h" }).lean();
    expect(appAudit).toBeDefined();
  });

  it("updating a setting without a reason is rejected with 400 Bad Request", async () => {
    const res = await request(app)
      .put("/api/v1/admin/settings/verifier.sla_days")
      .set(bearer(admin1Token))
      .send({ value: 5, reason: "" });
    expect(res.status).toBe(400);
  });
});
