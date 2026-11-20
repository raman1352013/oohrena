import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeQuoteTotals } from "@oohrena/shared";
import { AuditLog } from "../src/models/audit-log.js";
import { AvailabilityBlock } from "../src/models/availability.js";
import { Quote } from "../src/models/booking.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp, vendorPayload } from "./helpers.js";
import { approvedVendor, dayPlus, liveListing } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-qb-"));
const { app, cfg } = testApp({ UPLOAD_DIR: uploadDir });
let admin: { token: string; userId: string };
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

const A = () => bearer(admin.token);
const managed = (id: string) => request(app).patch(`/api/v1/vendors/me/inventory/${id}/availability-mode`).set(bearer(vendor.token)).send({ mode: "managed" });

/** Client inquiry on one fresh listing, reviewed and assigned to its (approved) vendor. */
async function assignedLead(o: { from?: string; to?: string } = {}) {
  const inv = await liveListing(app, vendor.token, admin.token, {}, 50000);
  await managed(inv);
  const client = await registerClient(app);
  const from = o.from ?? dayPlus(40);
  const to = o.to ?? dayPlus(69);
  const l = await request(app).post("/api/v1/leads").set(bearer(client.token)).send({ inventoryIds: [inv], from, to, requirement: "Festive campaign for new branch" });
  const leadId = l.body.data.leadId as string;
  expect((await request(app).post(`/api/v1/admin/leads/${leadId}/status`).set(A()).send({ status: "under_review" })).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/leads/${leadId}/assign`).set(A()).send({ vendorId: vendor.vendorId })).status).toBe(201);
  return { inv, client, leadId, from, to };
}
const itemFor = (x: { inv: string; from: string; to: string }) => ({ inventoryId: x.inv, from: x.from, to: x.to, qty: 1, production: 14400, installation: 12000 });
async function releasedQuote(o: { from?: string; to?: string } = {}) {
  const x = await assignedLead(o);
  const q = await request(app).post("/api/v1/admin/quotes").set(A()).send({ leadId: x.leadId, items: [itemFor(x)] });
  expect(q.status, JSON.stringify(q.body)).toBe(201);
  const rel = await request(app).post(`/api/v1/admin/quotes/${q.body.data.quoteId}/approve`).set(A());
  expect(rel.status, JSON.stringify(rel.body)).toBe(200);
  return { ...x, quoteId: q.body.data.quoteId as string };
}

describe("T-06/T-07 Admin inbox and vendor assignment", () => {
  it("collects web, phone and partner leads in one inbox with source tags", async () => {
    const phone = await request(app).post("/api/v1/admin/leads").set(A()).send({ source: "phone", contact: { name: "Rakesh", mobile: "+919812345678" }, city: "Gwalior", from: dayPlus(20), to: dayPlus(50), requirement: "Called about hoardings near station" });
    const gp = await request(app).post("/api/v1/admin/leads").set(A()).send({ source: "growth_partner", contact: { name: "Partner Lead", mobile: "+919812345679" }, city: "Indore", from: dayPlus(20), to: dayPlus(50), requirement: "Referral from city growth partner" });
    expect([phone.status, gp.status]).toEqual([201, 201]);
    const inbox = (await request(app).get("/api/v1/admin/leads").set(A())).body.data.items;
    const srcs = new Map(inbox.map((x: { leadId: string; source: string }) => [x.leadId, x.source]));
    expect(srcs.get(phone.body.data.leadId)).toBe("phone");
    expect(srcs.get(gp.body.data.leadId)).toBe("growth_partner");
  });

  it("blocks assignment to an unapproved vendor and records assignment history", async () => {
    const pending = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    const x = await assignedLead();
    const bad = await request(app).post(`/api/v1/admin/leads/${x.leadId}/assign`).set(A()).send({ vendorId: pending.body.data.vendorId });
    expect(bad.status).toBe(409);
    expect(bad.body.error.message).toMatch(/not an approved vendor/);
    const d = (await request(app).get(`/api/v1/admin/leads/${x.leadId}`).set(A())).body.data;
    expect(d.status).toBe("assigned");
    expect(d.assignments).toEqual([expect.objectContaining({ vendorId: vendor.vendorId, status: "active" })]);
    expect(await AuditLog.countDocuments({ action: "lead.assign", entityId: x.leadId })).toBe(1);
    expect(await AuditLog.countDocuments({ action: "lead.assign.blocked", entityId: x.leadId })).toBe(1);
  });

  it("refuses to quote items whose vendor isn't assigned", async () => {
    const inv = await liveListing(app, vendor.token, admin.token);
    const client = await registerClient(app);
    const l = await request(app).post("/api/v1/leads").set(bearer(client.token)).send({ inventoryIds: [inv], from: dayPlus(40), to: dayPlus(69), requirement: "Needs a quote quickly" });
    await request(app).post(`/api/v1/admin/leads/${l.body.data.leadId}/status`).set(A()).send({ status: "under_review" });
    const q = await request(app).post("/api/v1/admin/quotes").set(A()).send({ leadId: l.body.data.leadId, items: [{ inventoryId: inv, from: dayPlus(40), to: dayPlus(69) }] });
    expect(q.status).toBe(409);
    expect(JSON.stringify(q.body.error.details)).toMatch(/assign vendor/);
  });
});

describe("T-08 Quotation creation and client decision", () => {
  it("itemises media, production, installation, fee and GST with a server-computed total", async () => {
    const x = await assignedLead({ from: dayPlus(40), to: dayPlus(69) });
    const q = await request(app).post("/api/v1/admin/quotes").set(A()).send({ leadId: x.leadId, items: [{ ...itemFor(x), rate: 1, vendorCost: 1 }].map((i) => ({ ...i, rate: 50000 })), total: 1 });
    const d = q.body.data;
    expect(d.quoteId).toMatch(/^QT-\d{4}-\d{6}-V1$/);
    const manual = computeQuoteTotals([{ rate: 50000, qty: 1, billableUnits: 1, production: 14400, installation: 12000 }], 5);
    expect(d).toMatchObject({ subtotal: 76400, serviceFee: manual.serviceFee, cgst: manual.cgst, sgst: manual.sgst, total: manual.total, status: "draft" });
    expect(d.items[0]).toMatchObject({ media: 50000, production: 14400, installation: 12000, billableUnits: 1 });
    expect(d.margin).toBe(76400 - 1); // vendorCost from the request; admin-only
  });

  it("client sees the released quote without vendor cost, approves / rejects / revises with comments", async () => {
    const x = await releasedQuote();
    const view = await request(app).get(`/api/v1/quotes/${x.quoteId}`).set(bearer(x.client.token));
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.body)).not.toMatch(/vendorCost|vendorId|margin/);
    expect(view.body.data.items[0].lineTotal).toBe(76400);
    // Lead and quote statuses moved on, holds placed for the dates.
    expect((await request(app).get(`/api/v1/admin/leads/${x.leadId}`).set(A())).body.data.status).toBe("quoted");
    expect(await AvailabilityBlock.countDocuments({ inventoryId: x.inv, kind: "hold", status: "held" })).toBe(1);

    expect((await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "reject" })).status).toBe(400); // reason needed
    const rej = await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "reject", comment: "Budget changed" });
    expect(rej.body.data).toMatchObject({ status: "rejected", decisionComment: "Budget changed" });
    expect(await AvailabilityBlock.countDocuments({ inventoryId: x.inv, kind: "hold", status: "held" })).toBe(0); // dates released
    expect(await AuditLog.countDocuments({ action: "quote.client.reject", entityId: x.quoteId, reason: "Budget changed" })).toBe(1);
  });

  it("revision creates V2 and V1 stays readable", async () => {
    const x = await releasedQuote();
    await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "revise", comment: "Please drop installation" });
    const v2 = await request(app).post(`/api/v1/admin/quotes/${x.quoteId}/revise`).set(A());
    expect(v2.status).toBe(201);
    expect(v2.body.data.quoteId).toBe(x.quoteId.replace(/-V1$/, "-V2"));
    await request(app).patch(`/api/v1/admin/quotes/${v2.body.data.quoteId}`).set(A()).send({ items: [{ ...itemFor(x), installation: 0 }] });
    const rel = await request(app).post(`/api/v1/admin/quotes/${v2.body.data.quoteId}/approve`).set(A());
    expect(rel.body.data.total).toBeLessThan((await Quote.findById(x.quoteId).lean())!.total!);
    const v1 = await request(app).get(`/api/v1/quotes/${x.quoteId}`).set(bearer(x.client.token));
    expect(v1.body.data).toMatchObject({ status: "superseded", decisionComment: "Please drop installation" });
    expect(v1.body.data.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    // Exactly one live hold: V1's hold was released when V2 went out.
    expect(await AvailabilityBlock.countDocuments({ inventoryId: x.inv, kind: "hold", status: "held" })).toBe(1);
  });

  it("an expired quote can't be approved", async () => {
    const x = await releasedQuote();
    await Quote.updateOne({ _id: x.quoteId }, { $set: { validUntil: new Date(Date.now() - 3 * 86_400_000) } });
    const r = await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "approve" });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/expired/);
  });

  it("only Admin creates quotes; clients can't see or decide on other clients' quotes", async () => {
    const x = await releasedQuote();
    const other = await registerClient(app);
    expect((await request(app).post("/api/v1/admin/quotes").set(bearer(x.client.token)).send({ leadId: x.leadId, items: [itemFor(x)] })).status).toBe(403);
    expect((await request(app).get(`/api/v1/quotes/${x.quoteId}`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(other.token)).send({ decision: "approve" })).status).toBe(404);
  });
});

describe("T-09 Booking and Work Order generation", () => {
  it("booking only from an approved quote; holds become booked; WO visible to the assigned vendor only", async () => {
    const x = await releasedQuote();
    expect((await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: x.quoteId })).status).toBe(409); // not approved yet
    await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "approve" });
    const b = await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: x.quoteId });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(b.body.data.bookingId).toMatch(/^BK-\d{4}-\d{6}$/);
    expect(b.body.data.status).toBe("confirmed");
    expect((await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: x.quoteId })).status).toBe(409); // once only
    const days = (await request(app).get(`/api/v1/inventory/${x.inv}/availability?from=${x.from}&to=${x.from}`)).body.data.days;
    expect(days[0].state).toBe("booked");
    expect((await request(app).get(`/api/v1/admin/leads/${x.leadId}`).set(A())).body.data.status).toBe("won");

    const wo = await request(app).post(`/api/v1/admin/bookings/${b.body.data.bookingId}/work-order`).set(A()).send({ instructions: "Mount flex by 9am on start date; day and night photos." });
    expect(wo.status).toBe(201);
    const woId = wo.body.data[0].workOrderId;
    expect(woId).toMatch(/^WO-\d{4}-\d{6}$/);

    const mine = await request(app).get("/api/v1/vendors/me/work-orders").set(bearer(vendor.token));
    expect(mine.body.data.map((w: { workOrderId: string }) => w.workOrderId)).toContain(woId);
    expect(JSON.stringify(mine.body)).not.toMatch(/lineTotal|"rate"|clientId/); // no client price or identity
    const other = await approvedVendor(app, admin.token);
    expect((await request(app).get(`/api/v1/work-orders/${woId}`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).get("/api/v1/vendors/me/work-orders").set(bearer(other.token))).body.data).toEqual([]);
    expect((await request(app).post(`/api/v1/work-orders/${woId}/acknowledge`).set(bearer(vendor.token))).status).toBe(200);

    const detail = await request(app).get(`/api/v1/bookings/${b.body.data.bookingId}`).set(bearer(x.client.token));
    expect(detail.body.data.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(["confirmed"]);
    expect(detail.body.data.workOrders[0].workOrderId).toBe(woId);
  });

  it("cancellation applies the fee rule for the cancel date and releases dates", async () => {
    const early = await releasedQuote({ from: dayPlus(60), to: dayPlus(89) });
    await request(app).post(`/api/v1/quotes/${early.quoteId}/decision`).set(bearer(early.client.token)).send({ decision: "approve" });
    const b1 = (await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: early.quoteId })).body.data;
    const c1 = await request(app).post(`/api/v1/bookings/${b1.bookingId}/cancel`).set(bearer(early.client.token)).send({ reason: "Campaign postponed" });
    expect(c1.body.data.cancellation).toMatchObject({ feePct: 10, fee: Math.round(b1.total * 0.1) });

    const late = await releasedQuote({ from: dayPlus(10), to: dayPlus(39) });
    await request(app).post(`/api/v1/quotes/${late.quoteId}/decision`).set(bearer(late.client.token)).send({ decision: "approve" });
    const b2 = (await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: late.quoteId })).body.data;
    const c2 = await request(app).post(`/api/v1/bookings/${b2.bookingId}/cancel`).set(A()).send({ reason: "Client request" });
    expect(c2.body.data.cancellation.feePct).toBe(50);
    expect((await request(app).get(`/api/v1/inventory/${late.inv}/availability?from=${late.from}&to=${late.from}`)).body.data.days[0].state).toBe("available");
    expect((await request(app).post(`/api/v1/bookings/${b2.bookingId}/cancel`).set(A()).send({ reason: "Again" })).status).toBe(409);
    const other = await registerClient(app);
    expect((await request(app).post(`/api/v1/bookings/${b1.bookingId}/cancel`).set(bearer(other.token)).send({ reason: "Not mine" })).status).toBe(404);
  });

  it("reschedule moves dates only when the new period is free", async () => {
    const a = await releasedQuote({ from: dayPlus(100), to: dayPlus(129) });
    await request(app).post(`/api/v1/quotes/${a.quoteId}/decision`).set(bearer(a.client.token)).send({ decision: "approve" });
    const b = (await request(app).post("/api/v1/admin/bookings").set(A()).send({ quoteId: a.quoteId })).body.data;
    await request(app).post("/api/v1/holds").set(A()).send({ inventoryId: a.inv, from: dayPlus(200), to: dayPlus(220) });
    expect((await request(app).post(`/api/v1/admin/bookings/${b.bookingId}/reschedule`).set(A()).send({ newFrom: dayPlus(190), reason: "Client asked" })).status).toBe(409);
    const ok = await request(app).post(`/api/v1/admin/bookings/${b.bookingId}/reschedule`).set(A()).send({ newFrom: dayPlus(140), reason: "Client asked" });
    expect(ok.body.data).toMatchObject({ start: dayPlus(140), end: dayPlus(169) });
    expect((await request(app).get(`/api/v1/inventory/${a.inv}/availability?from=${dayPlus(100)}&to=${dayPlus(100)}`)).body.data.days[0].state).toBe("available");
  });
});

describe("Module 3 — overrides and dashboard", () => {
  it("override without a reason fails; with a reason it applies and is logged", async () => {
    const x = await releasedQuote();
    await Quote.updateOne({ _id: x.quoteId }, { $set: { validUntil: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await request(app).post("/api/v1/admin/overrides").set(A()).send({ entity: "quote", entityId: x.quoteId, field: "validUntil", newValue: dayPlus(5) })).status).toBe(400);
    const ok = await request(app).post("/api/v1/admin/overrides").set(A()).send({ entity: "quote", entityId: x.quoteId, field: "validUntil", newValue: dayPlus(5), reason: "Client was travelling; extended by GM" });
    expect(ok.status).toBe(201);
    expect((await request(app).post(`/api/v1/quotes/${x.quoteId}/decision`).set(bearer(x.client.token)).send({ decision: "approve" })).status).toBe(200);
    expect(await AuditLog.findOne({ action: "override", entityId: x.quoteId }).lean()).toMatchObject({ reason: "Client was travelling; extended by GM", after: { validUntil: dayPlus(5) } });
    expect((await request(app).post("/api/v1/admin/overrides").set(bearer(x.client.token)).send({ entity: "lead", entityId: x.leadId, field: "status", newValue: "won", reason: "Trying to cheat" })).status).toBe(403);
  });

  it("dashboard counts match the underlying lists", async () => {
    const dash = (await request(app).get("/api/v1/admin/dashboard").set(A())).body.data;
    const inbox = (await request(app).get("/api/v1/admin/leads?pageSize=100").set(A())).body.data.items as { status: string }[];
    for (const s of ["new", "assigned", "quoted", "won"]) expect(dash.leads[s] ?? 0, s).toBe(inbox.filter((l) => l.status === s).length);
    const bookings = (await request(app).get("/api/v1/admin/bookings").set(A())).body.data as { status: string }[];
    expect(dash.bookings.confirmed ?? 0).toBe(bookings.filter((b) => b.status === "confirmed").length);
    expect(dash.bookings.cancelled ?? 0).toBe(bookings.filter((b) => b.status === "cancelled").length);
    const holds = (await request(app).get("/api/v1/holds").set(A())).body.data as unknown[];
    expect(dash.activeHolds).toBe(holds.length);
  });
});
