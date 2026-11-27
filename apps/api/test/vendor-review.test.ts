import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { AuditLog } from "../src/models/audit-log.js";
import { Vendor } from "../src/models/foundation.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp, vendorPayload } from "./helpers.js";


const { app, cfg } = testApp();
let admin: { token: string };
let verifier: { token: string };

beforeAll(async () => {
  await startTestDb();
  admin = await createStaff(app, cfg, "admin");
  verifier = await createStaff(app, cfg, "verifier");
});
afterAll(stopTestDb);

async function submittedVendor(submittedAt: Date) {
  const res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
  expect(res.status).toBe(201);
  const vendorId = res.body.data.vendorId as string;
  await Vendor.updateOne({ _id: vendorId }, { $set: { "onboarding.submittedAt": submittedAt } });
  return { vendorId, token: res.body.data.token as string };
}

const review = {
  identity: "verified",
  ownership: "verified",
  assets: "partial",
  permission: "pending",
  rateCard: "clarification",
  siteVisitRequired: true,
  territoryNote: "Jhansi + Orai",
  remarks: "Lease copy for 2 sites pending",
  nextReviewDate: "2026-12-15",
};

describe("T8 admin vendor review (§L office use)", () => {
  it("verifier saves the checklist; it is audited, returned on the detail view and never changes kycStatus", async () => {
    const v = await submittedVendor(new Date());
    const res = await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(verifier.token)).send(review);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ ...review, reason: null });
    expect(res.body.data.reviewedBy).toMatch(/^USR-/);

    const detail = await request(app).get(`/api/v1/admin/vendors/${v.vendorId}`).set(bearer(admin.token));
    expect(detail.body.data.review).toMatchObject(review);
    expect(detail.body.data.kycStatus).toBe("pending");

    const log = await AuditLog.findOne({ action: "vendor.review", entityId: v.vendorId }).lean();
    expect(log).not.toBeNull();
  });

  it("a rejected item without a reason is 400; with a reason it saves the reason", async () => {
    const v = await submittedVendor(new Date());
    const bad = await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(admin.token)).send({ ...review, ownership: "rejected" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    const ok = await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(admin.token)).send({ ...review, ownership: "rejected", reason: "Lease expired" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.reason).toBe("Lease expired");
  });

  it("rejects unknown fields (cannot sneak in kycStatus)", async () => {
    const v = await submittedVendor(new Date());
    const res = await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(admin.token)).send({ ...review, kycStatus: "approved" });
    expect(res.status).toBe(400);
    expect((await Vendor.findById(v.vendorId).lean())!.kycStatus).toBe("pending");
  });

  it("client and vendor get 403; unknown vendor is 404", async () => {
    const v = await submittedVendor(new Date());
    const client = await registerClient(app);
    expect((await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(client.token)).send(review)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/admin/vendors/${v.vendorId}/review`).set(bearer(v.token)).send(review)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/admin/vendors/VND-999999/review`).set(bearer(admin.token)).send(review)).status).toBe(404);
  });

  it("queue=submitted lists only pending vendors who submitted onboarding, oldest first", async () => {
    const older = await submittedVendor(new Date("2026-01-01T00:00:00Z"));
    const newer = await submittedVendor(new Date("2026-01-02T00:00:00Z"));
    const notSubmitted = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    const res = await request(app).get("/api/v1/admin/vendors?queue=submitted").set(bearer(verifier.token));
    expect(res.status).toBe(200);
    const ids = (res.body.data.items as { vendorId: string; submittedAt: string | null }[]).map((x) => x.vendorId);
    expect(ids.indexOf(older.vendorId)).toBeLessThan(ids.indexOf(newer.vendorId));
    expect(ids).not.toContain(notSubmitted.body.data.vendorId);
    expect(res.body.data.items.every((x: { submittedAt: string | null }) => x.submittedAt)).toBe(true);
  });
});
