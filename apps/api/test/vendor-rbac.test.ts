import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { bearer, createStaff, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, bookedWorkOrder, listingBody, liveListing, png } from "./fixtures.js";

describe("V0.1 Vendor RBAC & §2.1 Matrix (AT-RBAC-01, AT-WO-01, AT-WO-02, AT-SEC-01)", () => {
  let app: ReturnType<typeof testApp>["app"];
  let adminToken: string;
  let vendorOwner: { token: string; vendorId: string };
  let managerToken: string;
  let fieldToken: string;
  let fieldUserId: string;
  let accountsToken: string;

  beforeAll(async () => {
    await startTestDb();
    const t = testApp();
    app = t.app;
    const admin = await createStaff(app, t.cfg, "admin");
    adminToken = admin.token;
    vendorOwner = await approvedVendor(app, adminToken);

    // Owner invites Manager
    const mgrRes = await request(app)
      .post("/api/v1/vendors/me/team/invite")
      .set(bearer(vendorOwner.token))
      .send({
        fullName: "Operations Manager",
        email: "mgr@vendor.test",
        mobile: "+919876543210",
        role: "manager",
      });
    expect(mgrRes.status, JSON.stringify(mgrRes.body)).toBe(201);
    const mgrLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: "mgr@vendor.test", password: mgrRes.body.data.tempPassword });
    expect(mgrLogin.status, JSON.stringify(mgrLogin.body)).toBe(200);
    managerToken = mgrLogin.body.data.token;

    // Owner invites Field staff
    const fieldRes = await request(app)
      .post("/api/v1/vendors/me/team/invite")
      .set(bearer(vendorOwner.token))
      .send({
        fullName: "Field Officer",
        email: "field@vendor.test",
        mobile: "+919876543211",
        role: "field",
      });
    expect(fieldRes.status, JSON.stringify(fieldRes.body)).toBe(201);
    fieldUserId = fieldRes.body.data.userId;
    const fieldLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: "field@vendor.test", password: fieldRes.body.data.tempPassword });
    expect(fieldLogin.status, JSON.stringify(fieldLogin.body)).toBe(200);
    fieldToken = fieldLogin.body.data.token;

    // Owner invites Accounts staff
    const accRes = await request(app)
      .post("/api/v1/vendors/me/team/invite")
      .set(bearer(vendorOwner.token))
      .send({
        fullName: "Accounts Executive",
        email: "acc@vendor.test",
        mobile: "+919876543212",
        role: "accounts",
      });
    expect(accRes.status, JSON.stringify(accRes.body)).toBe(201);
    const accLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: "acc@vendor.test", password: accRes.body.data.tempPassword });
    expect(accLogin.status, JSON.stringify(accLogin.body)).toBe(200);
    accountsToken = accLogin.body.data.token;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  describe("AT-RBAC-01: Vendor team roles and matrix enforcement", () => {
    it("non-owner cannot invite staff members (403)", async () => {
      const res = await request(app)
        .post("/api/v1/vendors/me/team/invite")
        .set(bearer(managerToken))
        .send({
          name: "Rogue User",
          email: "rogue@vendor.test",
          mobile: "+919876543299",
          role: "field",
        });
      expect(res.status).toBe(403);
    });

    it("accounts and field cannot create inventory assets (403)", async () => {
      const accRes = await request(app)
        .post("/api/v1/vendors/me/inventory")
        .set(bearer(accountsToken))
        .send(listingBody());
      expect(accRes.status).toBe(403);

      const fieldRes = await request(app)
        .post("/api/v1/vendors/me/inventory")
        .set(bearer(fieldToken))
        .send(listingBody());
      expect(fieldRes.status).toBe(403);
    });

    it("owner and manager can create inventory assets (201)", async () => {
      const mgrRes = await request(app)
        .post("/api/v1/vendors/me/inventory")
        .set(bearer(managerToken))
        .send(listingBody());
      expect(mgrRes.status).toBe(201);

      const ownerRes = await request(app)
        .post("/api/v1/vendors/me/inventory")
        .set(bearer(vendorOwner.token))
        .send(listingBody());
      expect(ownerRes.status).toBe(201);
    });

    it("bank account is owner-only: manager, field, accounts get 403", async () => {
      expect((await request(app).get("/api/v1/vendors/me/bank").set(bearer(managerToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/bank").set(bearer(fieldToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/bank").set(bearer(accountsToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/bank").set(bearer(vendorOwner.token))).status).toBe(200);
    });

    it("payables view is owner + accounts only: manager and field get 403", async () => {
      expect((await request(app).get("/api/v1/vendors/me/payables").set(bearer(managerToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/payables").set(bearer(fieldToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/payables").set(bearer(accountsToken))).status).toBe(200);
      expect((await request(app).get("/api/v1/vendors/me/payables").set(bearer(vendorOwner.token))).status).toBe(200);
    });

    it("audit log is owner-only for vendors: manager, field, accounts get 403", async () => {
      expect((await request(app).get("/api/v1/vendors/me/audit").set(bearer(managerToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/audit").set(bearer(fieldToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/audit").set(bearer(accountsToken))).status).toBe(403);
      expect((await request(app).get("/api/v1/vendors/me/audit").set(bearer(vendorOwner.token))).status).toBe(200);
    });
  });

  describe("AT-WO-01 & AT-WO-02: Work order field assignment & proof upload", () => {
    let woAssignedId: string;
    let woUnassignedId: string;
    let assignedInvId: string;

    beforeAll(async () => {
      const b1 = await bookedWorkOrder(app, adminToken, vendorOwner);
      woAssignedId = b1.woId;
      assignedInvId = b1.inv;

      const b2 = await bookedWorkOrder(app, adminToken, vendorOwner);
      woUnassignedId = b2.woId;

      // Owner/Manager assigns woAssignedId to field user
      const assignRes = await request(app)
        .patch(`/api/v1/vendors/me/work-orders/${woAssignedId}/assign`)
        .set(bearer(managerToken))
        .send({ assignedUserId: fieldUserId });
      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.assignedUserId).toBe(fieldUserId);
    });

    it("assigning non-field user fails (400)", async () => {
      const res = await request(app)
        .patch(`/api/v1/vendors/me/work-orders/${woAssignedId}/assign`)
        .set(bearer(managerToken))
        .send({ assignedUserId: "USR-NONEXISTENT" });
      expect(res.status).toBe(400);
    });

    it("AT-WO-01: field user lists only assigned work orders and price/rate fields are stripped", async () => {
      const res = await request(app)
        .get("/api/v1/vendors/me/work-orders")
        .set(bearer(fieldToken));
      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(list.length).toBe(1);
      expect(list[0].workOrderId).toBe(woAssignedId);

      // Verify rates, vendor costs, media line totals are completely stripped
      const item = list[0].items[0];
      expect(item.inventoryId).toBeDefined();
      expect(item.rate).toBeUndefined();
      expect(item.vendorCost).toBeUndefined();
      expect(item.media).toBeUndefined();
      expect(item.production).toBeUndefined();
      expect(item.installation).toBeUndefined();
      expect(item.lineTotal).toBeUndefined();

      // Attempt to view unassigned work order directly via GET /work-orders/:id -> 404
      const unassignedView = await request(app)
        .get(`/api/v1/work-orders/${woUnassignedId}`)
        .set(bearer(fieldToken));
      expect(unassignedView.status).toBe(404);
    });

    it("AT-WO-02: field user uploading proof on unassigned work order gets 403 Forbidden", async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${woUnassignedId}/proofs`)
        .set(bearer(fieldToken))
        .field("inventoryId", assignedInvId)
        .attach("file", png(1), { filename: "proof.png", contentType: "image/png" });
      expect(res.status).toBe(403);
    });

    it("AT-WO-02: field user uploading proof on assigned work order succeeds (201)", async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${woAssignedId}/proofs`)
        .set(bearer(fieldToken))
        .field("inventoryId", assignedInvId)
        .attach("file", png(2), { filename: "proof.png", contentType: "image/png" });
      expect(res.status).toBe(201);
      expect(res.body.data.proofId).toBeDefined();
    });
  });

  describe("AT-SEC-01: Cross-vendor data isolation", () => {
    let foreignVendor: { token: string; vendorId: string };
    let foreignInvId: string;

    beforeAll(async () => {
      foreignVendor = await approvedVendor(app, adminToken);
      foreignInvId = await liveListing(app, foreignVendor.token, adminToken);
    });

    it("vendor accessing another vendor's inventory via vendor route returns 404", async () => {
      // Vendor A attempts to edit foreign vendor's inventory
      const res = await request(app)
        .patch(`/api/v1/vendors/me/inventory/${foreignInvId}`)
        .set(bearer(vendorOwner.token))
        .send({ title: "Hacked Title" });
      expect(res.status).toBe(404);
    });
  });
});
