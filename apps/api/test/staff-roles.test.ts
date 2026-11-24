import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { User } from "../src/models/foundation.js";
import { AuditLog } from "../src/models/audit-log.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";

describe("V0.3: New staff roles (verifier, ops, auditor) & Maker-Checker", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("gating: verifier can review KYC and inventory, but cannot touch finance, users or quotes", async () => {
    const { app, cfg } = testApp();
    const verifier = await createStaff(app, cfg, "verifier");

    // KYC & Inventory review permitted
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(verifier.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/inventory").set(bearer(verifier.token))).status).toBe(200);

    // Forbidden from finance, user management, leads and overrides
    expect((await request(app).get("/api/v1/admin/users").set(bearer(verifier.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/finance/overview").set(bearer(verifier.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/leads").set(bearer(verifier.token))).status).toBe(403);
    expect(
      (await request(app).post("/api/v1/admin/overrides").set(bearer(verifier.token)).send({
        entity: "lead",
        entityId: "LD-001",
        field: "status",
        newValue: "approved",
        reason: "Test",
      })).status,
    ).toBe(403);
  });

  it("gating: ops can manage work orders, proofs, campaigns and leads, but cannot decide KYC or touch finance", async () => {
    const { app, cfg } = testApp();
    const ops = await createStaff(app, cfg, "ops");

    // Ops permissions permitted
    expect((await request(app).get("/api/v1/admin/leads").set(bearer(ops.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/campaigns").set(bearer(ops.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/issues").set(bearer(ops.token))).status).toBe(200);

    // Forbidden from KYC decisions, user management, finance, overrides
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(ops.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set(bearer(ops.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/finance/overview").set(bearer(ops.token))).status).toBe(403);
    expect(
      (await request(app).post("/api/v1/admin/overrides").set(bearer(ops.token)).send({
        entity: "lead",
        entityId: "LD-001",
        field: "status",
        newValue: "approved",
        reason: "Test",
      })).status,
    ).toBe(403);
  });

  it("gating: auditor has read-only access to audit logs and reports, zero write access", async () => {
    const { app, cfg } = testApp();
    const auditor = await createStaff(app, cfg, "auditor");

    // Permitted to read audit logs and reports
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(auditor.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/reports/funnel").set(bearer(auditor.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/system/deployments").set(bearer(auditor.token))).status).toBe(200);

    // Forbidden from writing any user changes or settings
    expect(
      (await request(app).post("/api/v1/admin/users").set(bearer(auditor.token)).send({
        fullName: "Fake User",
        email: "fake@example.test",
        mobile: "+919999999999",
        role: "admin",
      })).status,
    ).toBe(403);
    expect(
      (await request(app).put("/api/v1/admin/settings/gps.max_accuracy_m").set(bearer(auditor.token)).send({
        value: 25,
        reason: "Unauthorized attempt",
      })).status,
    ).toBe(403);
  });

  it("maker-checker: role change to a staff role requires second admin approval", async () => {
    const { app, cfg } = testApp();
    const admin1 = await createStaff(app, cfg, "admin");
    const admin2 = await createStaff(app, cfg, "admin");
    const client = await registerClient(app);

    // Admin 1 proposes changing client to verifier
    const proposeRes = await request(app)
      .post(`/api/v1/admin/users/${client.user.userId}/role`)
      .set(bearer(admin1.token))
      .send({ role: "verifier", reason: "Promoted to verifier" });

    expect(proposeRes.status).toBe(202);
    expect(proposeRes.body.data.pending).toBe(true);
    expect(proposeRes.body.data.pendingAction).toMatchObject({
      type: "role_change",
      targetRole: "verifier",
      proposedBy: admin1.userId,
    });

    // Target user's role has not changed yet
    const midUser = await User.findById(client.user.userId).lean();
    expect(midUser?.role).toBe("client");

    // Admin 1 (maker) cannot self-approve
    const selfApprove = await request(app)
      .post(`/api/v1/admin/users/${client.user.userId}/approve-action`)
      .set(bearer(admin1.token))
      .send({ reason: "Self approval attempt" });
    expect(selfApprove.status).toBe(400);

    // Admin 2 (checker) approves
    const checkerApprove = await request(app)
      .post(`/api/v1/admin/users/${client.user.userId}/approve-action`)
      .set(bearer(admin2.token))
      .send({ reason: "Checked qualifications, approved" });
    expect(checkerApprove.status).toBe(200);
    expect(checkerApprove.body.data.role).toBe("verifier");

    // Target user is now verifier
    const afterUser = await User.findById(client.user.userId).lean();
    expect(afterUser?.role).toBe("verifier");
    expect(afterUser?.pendingAction).toBeNull();

    // Audit log recorded
    const auditRecord = await AuditLog.findOne({ action: "user.role.assign", entityId: client.user.userId }).lean();
    expect(auditRecord).toBeTruthy();
    expect(auditRecord?.userId).toBe(admin2.userId);
  });

  it("maker-checker: staff suspension requires second admin approval", async () => {
    const { app, cfg } = testApp();
    const admin1 = await createStaff(app, cfg, "admin");
    const admin2 = await createStaff(app, cfg, "admin");
    const opsStaff = await createStaff(app, cfg, "ops");

    // Admin 1 proposes suspension for ops staff
    const suspendPropose = await request(app)
      .post(`/api/v1/admin/users/${opsStaff.userId}/suspend`)
      .set(bearer(admin1.token))
      .send({ reason: "Security violation under investigation" });

    expect(suspendPropose.status).toBe(202);
    expect(suspendPropose.body.data.pending).toBe(true);
    expect(suspendPropose.body.data.pendingAction.type).toBe("suspend");

    // Ops user is still active before checker approval
    const midOps = await User.findById(opsStaff.userId).lean();
    expect(midOps?.status).toBe("active");

    // Admin 1 cannot self-approve
    const selfApprove = await request(app)
      .post(`/api/v1/admin/users/${opsStaff.userId}/approve-action`)
      .set(bearer(admin1.token))
      .send({});
    expect(selfApprove.status).toBe(400);

    // Admin 2 approves suspension
    const checkerApprove = await request(app)
      .post(`/api/v1/admin/users/${opsStaff.userId}/approve-action`)
      .set(bearer(admin2.token))
      .send({ reason: "Confirmed violation" });
    expect(checkerApprove.status).toBe(200);

    // User is now suspended
    const afterOps = await User.findById(opsStaff.userId).lean();
    expect(afterOps?.status).toBe("suspended");

    // Session is revoked
    const testSession = await request(app).get("/api/v1/auth/me").set(bearer(opsStaff.token));
    expect(testSession.status).toBe(401);
  });

  it("maker-checker: staff reinstatement requires second admin approval", async () => {
    const { app, cfg } = testApp();
    const admin1 = await createStaff(app, cfg, "admin");
    const admin2 = await createStaff(app, cfg, "admin");
    const verifier = await createStaff(app, cfg, "verifier");

    // Suspend verifier directly in DB for testing reinstatement
    await User.updateOne({ _id: verifier.userId }, { $set: { status: "suspended" } });

    // Admin 1 proposes reinstatement
    const reactivatePropose = await request(app)
      .post(`/api/v1/admin/users/${verifier.userId}/reactivate`)
      .set(bearer(admin1.token))
      .send({ reason: "Investigation cleared" });

    expect(reactivatePropose.status).toBe(202);
    expect(reactivatePropose.body.data.pending).toBe(true);
    expect(reactivatePropose.body.data.pendingAction.type).toBe("reactivate");

    // Admin 1 cannot self-approve
    expect(
      (await request(app).post(`/api/v1/admin/users/${verifier.userId}/approve-action`).set(bearer(admin1.token)).send({})).status,
    ).toBe(400);

    // Admin 2 approves
    const checkerApprove = await request(app)
      .post(`/api/v1/admin/users/${verifier.userId}/approve-action`)
      .set(bearer(admin2.token))
      .send({ reason: "Cleared by HR" });
    expect(checkerApprove.status).toBe(200);
    expect(checkerApprove.body.data.status).toBe("active");

    const afterVerifier = await User.findById(verifier.userId).lean();
    expect(afterVerifier?.status).toBe("active");
  });

  it("maker-checker: checker can reject a pending proposal with mandatory reason", async () => {
    const { app, cfg } = testApp();
    const admin1 = await createStaff(app, cfg, "admin");
    const admin2 = await createStaff(app, cfg, "admin");
    const auditor = await createStaff(app, cfg, "auditor");

    // Admin 1 proposes suspension
    await request(app)
      .post(`/api/v1/admin/users/${auditor.userId}/suspend`)
      .set(bearer(admin1.token))
      .send({ reason: "Suspected leak" });

    // Rejection without reason fails validation
    const noReason = await request(app)
      .post(`/api/v1/admin/users/${auditor.userId}/reject-action`)
      .set(bearer(admin2.token))
      .send({});
    expect(noReason.status).toBe(400);

    // Admin 2 rejects the proposal
    const rejectRes = await request(app)
      .post(`/api/v1/admin/users/${auditor.userId}/reject-action`)
      .set(bearer(admin2.token))
      .send({ reason: "Investigation found no evidence, proposal dismissed" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.rejected).toBe(true);

    const user = await User.findById(auditor.userId).lean();
    expect(user?.status).toBe("active");
    expect(user?.pendingAction).toBeNull();
  });
});
