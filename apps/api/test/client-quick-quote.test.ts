import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "../src/models/foundation.js";
import { bearer, clientPayload, createStaff, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, dayPlus, liveListing } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-qq-"));
const { app, cfg } = testApp({ UPLOAD_DIR: uploadDir });
let admin: { token: string };
let vendor: { token: string; vendorId: string };

beforeAll(async () => {
  await startTestDb();
  admin = await createStaff(app, cfg, "admin");
  vendor = await approvedVendor(app, admin.token);
});
afterAll(async () => {
  await stopTestDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

async function quickClient() {
  const body = clientPayload();
  delete (body as Record<string, unknown>).companyName;
  delete (body as Record<string, unknown>).gstin;
  const res = await request(app).post("/api/v1/auth/register").set("x-auth-mode", "token").send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { token: res.body.data.token as string, orgId: res.body.data.user.orgId as string };
}

describe("Client quick quote: quote first, company later", () => {
  it("a client can sign up with just name, email, mobile and password", async () => {
    const c = await quickClient();
    const doc = await Client.findById(c.orgId).lean();
    expect(doc!.companyName).toBeNull();
  });

  it("an inquiry for chosen sites needs no written requirement; an open brief still does", async () => {
    const c = await quickClient();
    const inv = await liveListing(app, vendor.token, admin.token);
    const withSites = await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ inventoryIds: [inv], from: dayPlus(10), to: dayPlus(39) });
    expect(withSites.status, JSON.stringify(withSites.body)).toBe(201);
    expect(withSites.body.data.leadId).toMatch(/^LD-\d{4}-\d{6}$/);

    const brief = await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ city: "Gwalior", from: dayPlus(10), to: dayPlus(39), requirement: "short" });
    expect(brief.status).toBe(400);
    expect(brief.body.error.details.fieldErrors?.requirement ?? brief.body.error.details).toBeTruthy();
  });

  it("approving a quote asks for the company name first; after adding it, approval works", async () => {
    const A = bearer(admin.token);
    const c = await quickClient();
    const inv = await liveListing(app, vendor.token, admin.token);
    await request(app).patch(`/api/v1/vendors/me/inventory/${inv}/availability-mode`).set(bearer(vendor.token)).send({ mode: "managed" });
    const from = dayPlus(12);
    const to = dayPlus(41);
    const leadId = (await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ inventoryIds: [inv], from, to })).body.data.leadId;
    await request(app).post(`/api/v1/admin/leads/${leadId}/status`).set(A).send({ status: "under_review" });
    await request(app).post(`/api/v1/admin/leads/${leadId}/assign`).set(A).send({ vendorId: vendor.vendorId });
    const quoteId = (await request(app).post("/api/v1/admin/quotes").set(A).send({ leadId, items: [{ inventoryId: inv, from, to, production: 1000, installation: 1000 }] })).body.data.quoteId;
    expect((await request(app).post(`/api/v1/admin/quotes/${quoteId}/approve`).set(A)).status).toBe(200);

    const blocked = await request(app).post(`/api/v1/quotes/${quoteId}/decision`).set(bearer(c.token)).send({ decision: "approve" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.details.field).toBe("companyName");

    expect((await request(app).put("/api/v1/clients/me").set(bearer(c.token)).send({ companyName: "Quick Brands Pvt Ltd" })).status).toBe(200);
    const ok = await request(app).post(`/api/v1/quotes/${quoteId}/decision`).set(bearer(c.token)).send({ decision: "approve" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});
