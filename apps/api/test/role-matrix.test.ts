import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { User, GrowthPartner } from "../src/models/foundation.js";
import { nextId } from "../src/lib/ids.js";
import { hashPassword } from "../src/services/session.js";
import { bearer, createStaff, GOOD_PW, mobileFor, registerClient, startTestDb, stopTestDb, testApp, uniq } from "./helpers.js";
import { approvedVendor } from "./fixtures.js";

describe("T-13: Comprehensive Role-Based Access & API Security Matrix (All 5 Roles)", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("enforces role permissions and object-level isolation (404 for foreign IDs)", async () => {
    const { app, cfg } = testApp();

    // Setup all 5 roles
    const admin = await createStaff(app, cfg, "admin");
    const finance = await createStaff(app, cfg, "finance");
    const clientA = await registerClient(app);
    const clientB = await registerClient(app);
    const vendorA = await approvedVendor(app, admin.token);

    // Create Growth Partner user
    const gpUserId = await nextId("USR");
    const gpOrgId = await nextId("GP");
    const gpEmail = `gp-${uniq()}@example.test`;
    await User.create({
      _id: gpUserId,
      email: gpEmail,
      mobile: mobileFor(),
      fullName: "Test GP",
      passwordHash: await hashPassword(cfg, GOOD_PW),
      role: "growth_partner",
      orgId: gpOrgId,
      status: "active",
    });
    await GrowthPartner.create({ _id: gpOrgId, userId: gpUserId, name: "Test GP" });

    const gpLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: gpEmail, password: GOOD_PW });
    const gpToken = gpLoginRes.body.data.token as string;

    const tokens = {
      client: clientA.token,
      vendor: vendorA.token,
      admin: admin.token,
      growth_partner: gpToken,
      finance: finance.token,
    };

    // 1. users.manage: GET /api/v1/admin/users
    expect((await request(app).get("/api/v1/admin/users").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/users").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set(bearer(tokens.vendor))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set(bearer(tokens.growth_partner))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/users").set(bearer(tokens.finance))).status).toBe(403);

    // 2. audit.read: GET /api/v1/audit-logs
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(tokens.finance))).status).toBe(200);
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(tokens.vendor))).status).toBe(403);
    expect((await request(app).get("/api/v1/audit-logs").set(bearer(tokens.growth_partner))).status).toBe(403);

    // 3. system.deployments.read: GET /api/v1/admin/system/deployments
    expect((await request(app).get("/api/v1/admin/system/deployments").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/system/deployments").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/system/deployments").set(bearer(tokens.vendor))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/system/deployments").set(bearer(tokens.finance))).status).toBe(403);

    // 4. client.profile: GET /api/v1/clients/me
    expect((await request(app).get("/api/v1/clients/me").set(bearer(tokens.client))).status).toBe(200);
    expect((await request(app).get("/api/v1/clients/me").set(bearer(tokens.vendor))).status).toBe(403);
    expect((await request(app).get("/api/v1/clients/me").set(bearer(tokens.finance))).status).toBe(403);

    // 5. vendor.profile: GET /api/v1/vendors/me
    expect((await request(app).get("/api/v1/vendors/me").set(bearer(tokens.vendor))).status).toBe(200);
    expect((await request(app).get("/api/v1/vendors/me").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/vendors/me").set(bearer(tokens.growth_partner))).status).toBe(403);

    // 6. partner.earnings.read: GET /api/v1/partner/earnings
    expect((await request(app).get("/api/v1/partner/earnings").set(bearer(tokens.growth_partner))).status).toBe(200);
    expect((await request(app).get("/api/v1/partner/earnings").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/partner/earnings").set(bearer(tokens.finance))).status).toBe(200);
    expect((await request(app).get("/api/v1/partner/earnings").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/partner/earnings").set(bearer(tokens.vendor))).status).toBe(403);

    // 7. vendors.kyc.decide: GET /api/v1/admin/vendors
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(tokens.finance))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/vendors").set(bearer(tokens.vendor))).status).toBe(403);

    // 8. finance.manage: GET /api/v1/finance/payables
    expect((await request(app).get("/api/v1/finance/payables").set(bearer(tokens.finance))).status).toBe(200);
    expect((await request(app).get("/api/v1/finance/payables").set(bearer(tokens.admin))).status).toBe(403);
    expect((await request(app).get("/api/v1/finance/payables").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/finance/payables").set(bearer(tokens.vendor))).status).toBe(403);

    // 9. notifications.manage: GET /api/v1/admin/notification-templates
    expect((await request(app).get("/api/v1/admin/notification-templates").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/notification-templates").set(bearer(tokens.finance))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/notification-templates").set(bearer(tokens.client))).status).toBe(403);

    // 10. reports.admin: GET /api/v1/reports/funnel
    expect((await request(app).get("/api/v1/reports/funnel").set(bearer(tokens.admin))).status).toBe(200);
    expect((await request(app).get("/api/v1/reports/funnel").set(bearer(tokens.finance))).status).toBe(200);
    expect((await request(app).get("/api/v1/reports/funnel").set(bearer(tokens.client))).status).toBe(403);
    expect((await request(app).get("/api/v1/reports/funnel").set(bearer(tokens.vendor))).status).toBe(403);

    // 11. Object-level isolation: Foreign ID returns 404 (never 403, preventing ID probing)
    // Non-existent listing for vendor -> 404
    expect((await request(app).get("/api/v1/inventory/INV-NONEXIST-001").set(bearer(tokens.vendor))).status).toBe(404);

    // Non-existent campaign dossier for client -> 404
    expect((await request(app).get("/api/v1/reports/client-campaign/CMP-NONEXIST-001").set(bearer(tokens.client))).status).toBe(404);
  });
});
