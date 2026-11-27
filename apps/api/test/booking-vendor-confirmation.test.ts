import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, dayPlus, liveListing } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-bvc-"));
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

/** Inquiry → assign → quote released → client approves, on an "on request" listing (the default). */
async function approvedQuote(offset: number) {
  const A = bearer(admin.token);
  const inv = await liveListing(app, vendor.token, admin.token);
  const client = await registerClient(app);
  const from = dayPlus(20 + offset);
  const to = dayPlus(49 + offset);
  const leadId = (await request(app).post("/api/v1/leads").set(bearer(client.token)).send({ inventoryIds: [inv], from, to })).body.data.leadId;
  await request(app).post(`/api/v1/admin/leads/${leadId}/status`).set(A).send({ status: "under_review" });
  await request(app).post(`/api/v1/admin/leads/${leadId}/assign`).set(A).send({ vendorId: vendor.vendorId });
  const quoteId = (await request(app).post("/api/v1/admin/quotes").set(A).send({ leadId, items: [{ inventoryId: inv, from, to }] })).body.data.quoteId;
  expect((await request(app).post(`/api/v1/admin/quotes/${quoteId}/approve`).set(A)).status).toBe(200);
  expect((await request(app).post(`/api/v1/quotes/${quoteId}/decision`).set(bearer(client.token)).send({ decision: "approve" })).status).toBe(200);
  const reqs = await request(app).get("/api/v1/availability-requests").set(bearer(vendor.token));
  const r = (reqs.body.data as { requestId: string; inventoryId: string; status: string }[]).find((x) => x.inventoryId === inv && x.status === "pending");
  expect(r, "vendor should have a pending confirmation request").toBeTruthy();
  return { inv, leadId, quoteId, requestId: r!.requestId };
}

// Founder blueprint §6.1: a booking is confirmed only after the vendor has confirmed availability.
describe("Booking waits for vendor confirmation", () => {
  it("refuses the booking while the vendor has not confirmed, shows it on the lead, then books once confirmed", async () => {
    const A = bearer(admin.token);
    const q = await approvedQuote(0);

    const lead = await request(app).get(`/api/v1/admin/leads/${q.leadId}`).set(A);
    expect(lead.body.data.latestQuoteHolds).toEqual([expect.objectContaining({ inventoryId: q.inv, status: "pending_vendor" })]);

    const early = await request(app).post("/api/v1/admin/bookings").set(A).send({ quoteId: q.quoteId });
    expect(early.status).toBe(409);
    expect(early.body.error.details.problems.join(" ")).toMatch(/waiting for the vendor/);

    const ok = await request(app).post(`/api/v1/availability-requests/${q.requestId}/vendor-response`).set(bearer(vendor.token)).send({ response: "confirm" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);

    const booked = await request(app).post("/api/v1/admin/bookings").set(A).send({ quoteId: q.quoteId });
    expect(booked.status, JSON.stringify(booked.body)).toBe(201);
    expect(booked.body.data.bookingId).toMatch(/^BK-/);
  });

  it("a vendor decline blocks the booking with a clear reason", async () => {
    const A = bearer(admin.token);
    const q = await approvedQuote(60);
    await request(app).post(`/api/v1/availability-requests/${q.requestId}/vendor-response`).set(bearer(vendor.token)).send({ response: "decline", note: "Sold elsewhere" });
    const res = await request(app).post("/api/v1/admin/bookings").set(A).send({ quoteId: q.quoteId });
    expect(res.status).toBe(409);
    expect(res.body.error.details.problems.join(" ")).toMatch(/declined/);
  });
});
