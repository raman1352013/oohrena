import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuditLog } from "../src/models/audit-log.js";
import { AvailabilityBlock } from "../src/models/availability.js";
import { expireHolds } from "../src/services/availability.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, dayPlus, liveListing } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-av-"));
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

const hold = (body: Record<string, unknown>, token = admin.token) => request(app).post("/api/v1/holds").set(bearer(token)).send(body);
const cal = (id: string, from: string, to: string) => request(app).get(`/api/v1/inventory/${id}/availability?from=${from}&to=${to}`);
const managed = (id: string) => request(app).patch(`/api/v1/vendors/me/inventory/${id}/availability-mode`).set(bearer(vendor.token)).send({ mode: "managed" });

describe("T-03 Public discovery by location", () => {
  let pune: string, nashik: string, draft: string, demo: string;
  beforeAll(async () => {
    pune = await liveListing(app, vendor.token, admin.token, { city: "Pune", locality: "Kothrud", landmark: "Opp. Karishma Society", pin: "411038", lat: 18.5074, lng: 73.8077 });
    nashik = await liveListing(app, vendor.token, admin.token, { city: "Nashik", locality: "College Road", landmark: "BYK College", pin: "422005", lat: 20.0059, lng: 73.7639 });
    demo = await liveListing(app, vendor.token, admin.token, { city: "Pune", locality: "Baner", pin: "411045", lat: 18.559, lng: 73.7868 });
    await request(app).patch(`/api/v1/admin/inventory/${demo}/data-type`).set(bearer(admin.token)).send({ dataType: "DEMO", reason: "Sample record" });
    const d = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(vendor.token)).send({ category: "hoarding", title: "Draft Pune", city: "Pune", locality: "Kothrud", address: "x", pin: "411038", lat: 18.5075, lng: 73.8078, rate: 1, pricingUnit: "per_month", attributes: { widthFt: 1, heightFt: 1 } });
    draft = d.body.data.inventoryId;
  });
  const ids = async (qs: string) => (await request(app).get(`/api/v1/inventory/search?${qs}`)).body.data.items.map((x: { inventoryId: string }) => x.inventoryId);

  it("finds by city, locality, landmark, PIN and GPS radius; never drafts or demo", async () => {
    expect(await ids("city=pune")).toEqual([pune]);
    expect(await ids("locality=kothrud")).toEqual([pune]);
    expect(await ids("landmark=BYK")).toEqual([nashik]);
    expect(await ids("pin=422005")).toEqual([nashik]);
    const near = await request(app).get("/api/v1/inventory/search?lat=18.52&lng=73.85&radiusKm=10");
    expect(near.body.data.items.map((x: { inventoryId: string }) => x.inventoryId)).toEqual([pune]);
    expect(near.body.data.items[0].distanceKm).toBeGreaterThan(0);
    for (const qs of ["city=pune", "q=Draft", "lat=18.52&lng=73.85&radiusKm=50"]) {
      const found = await ids(qs);
      expect(found).not.toContain(draft);
      expect(found).not.toContain(demo);
    }
    expect(await ids("city=pune&includeDemo=true")).toContain(demo);
  });

  it("map bounding box returns only items inside the viewport", async () => {
    const r = await request(app).get("/api/v1/inventory/search/geo?bbox=73.7,19.5,74.0,20.5");
    expect(r.body.data.items.map((x: { inventoryId: string }) => x.inventoryId)).toEqual([nashik]);
    expect((await request(app).get("/api/v1/inventory/search/geo")).status).toBe(400);
  });

  it("validates inputs (bad PIN, half a date range)", async () => {
    expect((await request(app).get("/api/v1/inventory/search?pin=12")).status).toBe(400);
    expect((await request(app).get(`/api/v1/inventory/search?from=${dayPlus(10)}`)).status).toBe(400);
  });
});

describe("T-04 Date-wise availability", () => {
  it("hoarding periods can't overlap and have a minimum length", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    await managed(id);
    const a = await hold({ inventoryId: id, from: dayPlus(40), to: dayPlus(69) });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data.status).toBe("held");
    const overlap = await hold({ inventoryId: id, from: dayPlus(54), to: dayPlus(84) });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.details.unavailableDays.length).toBe(16);
    expect((await hold({ inventoryId: id, from: dayPlus(100), to: dayPlus(105) })).status).toBe(400); // < 15 days
    expect((await hold({ inventoryId: id, from: dayPlus(70), to: dayPlus(84) })).status).toBe(201); // back-to-back is fine
    const days = (await cal(id, dayPlus(68), dayPlus(71))).body.data.days;
    expect(days.map((d: { state: string }) => d.state)).toEqual(["hold", "hold", "hold", "hold"]);
  });

  it("LED slots and fleet quantities decrement correctly", async () => {
    const led = await liveListing(app, vendor.token, admin.token, { category: "led_screen", pricingUnit: "per_slot", attributes: { widthFt: 20, heightFt: 10, slotLengthSec: 10, loopLengthSec: 50 } });
    await managed(led);
    expect((await hold({ inventoryId: led, from: dayPlus(10), to: dayPlus(12), qty: 2 })).status).toBe(201);
    const l = (await cal(led, dayPlus(10), dayPlus(10))).body.data;
    expect(l).toMatchObject({ capacityModel: "slots", unitLabel: "slots" });
    expect(l.days[0]).toMatchObject({ capacity: 5, used: 2, free: 3, state: "available" });

    const fleet = await liveListing(app, vendor.token, admin.token, { category: "erickshaw_auto", pricingUnit: "per_vehicle_month", quantity: 10, attributes: { fleetSize: 10 } });
    await managed(fleet);
    expect((await hold({ inventoryId: fleet, from: dayPlus(10), to: dayPlus(20), qty: 3 })).status).toBe(201);
    expect((await cal(fleet, dayPlus(15), dayPlus(15))).body.data.days[0]).toMatchObject({ capacity: 10, free: 7 });
    expect((await hold({ inventoryId: fleet, from: dayPlus(10), to: dayPlus(20), qty: 8 })).status).toBe(409);
    expect((await hold({ inventoryId: fleet, from: dayPlus(10), to: dayPlus(20), qty: 7 })).status).toBe(201);
  });

  it("unconfirmed availability is labelled 'Subject to vendor confirmation'", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    const before = (await cal(id, dayPlus(5), dayPlus(6))).body.data;
    expect(before.summary.confirmed).toBe(false);
    expect(before.note).toBe("Subject to vendor confirmation");
    const s = await request(app).get(`/api/v1/inventory/search?q=${id}&from=${dayPlus(5)}&to=${dayPlus(30)}`);
    expect(s.body.data.items[0].availability).toMatchObject({ state: "available", confirmed: false });
    await managed(id);
    expect((await cal(id, dayPlus(5), dayPlus(6))).body.data).toMatchObject({ note: null, summary: { confirmed: true } });
  });

  it("search can hide items that aren't free for the dates", async () => {
    const id = await liveListing(app, vendor.token, admin.token, { city: "Indore", lat: 22.7196, lng: 75.8577 });
    await managed(id);
    await hold({ inventoryId: id, from: dayPlus(30), to: dayPlus(50) });
    const all = await request(app).get(`/api/v1/inventory/search?city=indore&from=${dayPlus(35)}&to=${dayPlus(55)}`);
    expect(all.body.data.items[0].availability.state).toBe("limited");
    expect((await request(app).get(`/api/v1/inventory/search?city=indore&from=${dayPlus(35)}&to=${dayPlus(55)}&onlyAvailable=true`)).body.data.total).toBe(0);
  });
});

describe("T-05 Double-booking prevention", () => {
  it("of two simultaneous holds for the same dates exactly one succeeds", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    await managed(id);
    const body = { inventoryId: id, from: dayPlus(200), to: dayPlus(229) };
    const results = await Promise.all([hold(body), hold(body), hold(body)]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.message).toMatch(/Not available/);
    expect(await AvailabilityBlock.countDocuments({ inventoryId: id, status: "held" })).toBe(1);
  });

  it("holds expire and release stock", async () => {
    const short = testApp({ UPLOAD_DIR: uploadDir, HOLD_HOURS: 1 / 3600 }); // 1-second holds
    const id = await liveListing(app, vendor.token, admin.token);
    await managed(id);
    const staff = await createStaff(short.app, short.cfg, "admin");
    const h = await request(short.app).post("/api/v1/holds").set(bearer(staff.token)).send({ inventoryId: id, from: dayPlus(300), to: dayPlus(320) });
    expect(h.status).toBe(201);
    expect((await cal(id, dayPlus(300), dayPlus(300))).body.data.days[0].state).toBe("hold");
    await new Promise((r) => setTimeout(r, 1200));
    expect((await cal(id, dayPlus(300), dayPlus(300))).body.data.days[0].state).toBe("available");
    expect(await expireHolds()).toBeGreaterThanOrEqual(1);
    const list = await request(app).get(`/api/v1/holds?inventoryId=${id}&status=all`).set(bearer(admin.token));
    expect(list.body.data[0].status).toBe("expired");
    expect(await AuditLog.countDocuments({ action: "availability.hold.expire", entityId: id })).toBe(1);
  });

  it("demo inventory can never be held; clients and vendors can't place holds", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    const { token: client } = await registerClient(app);
    expect((await hold({ inventoryId: id, from: dayPlus(10), to: dayPlus(30) }, client)).status).toBe(403);
    expect((await hold({ inventoryId: id, from: dayPlus(10), to: dayPlus(30) }, vendor.token)).status).toBe(403);
    await request(app).patch(`/api/v1/admin/inventory/${id}/data-type`).set(bearer(admin.token)).send({ dataType: "DEMO", reason: "Training sample" });
    const r = await hold({ inventoryId: id, from: dayPlus(10), to: dayPlus(30) });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Demo/);
  });
});

describe("Vendor confirmation flow", () => {
  it("holds on on-request listings wait for the owning vendor, who confirms or declines (logged)", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    const h = await hold({ inventoryId: id, from: dayPlus(60), to: dayPlus(80) });
    expect(h.body.data.status).toBe("pending_vendor");
    expect((await cal(id, dayPlus(60), dayPlus(60))).body.data.days[0].state).toBe("pending_vendor");

    const reqs = await request(app).get("/api/v1/availability-requests").set(bearer(vendor.token));
    const mine = reqs.body.data.find((x: { holdId: string }) => x.holdId === h.body.data.holdId);
    expect(mine.status).toBe("pending");

    const other = await approvedVendor(app, admin.token);
    expect((await request(app).post(`/api/v1/availability-requests/${mine.requestId}/vendor-response`).set(bearer(other.token)).send({ response: "confirm" })).status).toBe(404);

    const ok = await request(app).post(`/api/v1/availability-requests/${mine.requestId}/vendor-response`).set(bearer(vendor.token)).send({ response: "confirm" });
    expect(ok.body.data.status).toBe("confirmed");
    expect((await cal(id, dayPlus(60), dayPlus(60))).body.data.days[0].state).toBe("hold");
    expect((await request(app).post(`/api/v1/availability-requests/${mine.requestId}/vendor-response`).set(bearer(vendor.token)).send({ response: "decline" })).status).toBe(409);
    expect(await AuditLog.findOne({ action: "availability.vendor.confirm", entityId: id }).lean()).toMatchObject({ after: { channel: "vendor_portal" } });

    // Decline releases the dates.
    const h2 = await hold({ inventoryId: id, from: dayPlus(90), to: dayPlus(110) });
    const r2 = (await request(app).get("/api/v1/availability-requests").set(bearer(vendor.token))).body.data.find((x: { holdId: string }) => x.holdId === h2.body.data.holdId);
    await request(app).post(`/api/v1/availability-requests/${r2.requestId}/vendor-response`).set(bearer(vendor.token)).send({ response: "decline", note: "Under repair" });
    expect((await cal(id, dayPlus(95), dayPlus(95))).body.data.days[0].state).toBe("available");
  });

  it("vendor and admin can block dates with a reason; clients can't change availability", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    expect((await request(app).post(`/api/v1/vendors/me/inventory/${id}/availability`).set(bearer(vendor.token)).send({ from: dayPlus(5), to: dayPlus(7) })).status).toBe(400);
    const b = await request(app).post(`/api/v1/vendors/me/inventory/${id}/availability`).set(bearer(vendor.token)).send({ from: dayPlus(5), to: dayPlus(7), reason: "Structure repainting" });
    expect(b.status).toBe(201);
    expect((await cal(id, dayPlus(6), dayPlus(6))).body.data.days[0].state).toBe("blocked");
    const { token: client } = await registerClient(app);
    expect((await request(app).post(`/api/v1/admin/inventory/${id}/block`).set(bearer(client)).send({ from: dayPlus(9), to: dayPlus(9), reason: "x y z" })).status).toBe(403);
    expect((await request(app).post(`/api/v1/admin/inventory/${id}/block`).set(bearer(admin.token)).send({ from: dayPlus(9), to: dayPlus(9), reason: "Municipal notice" })).status).toBe(201);
    expect((await request(app).delete(`/api/v1/vendors/me/inventory/${id}/availability/${b.body.data.holdId}`).set(bearer(vendor.token))).status).toBe(200);
    expect((await cal(id, dayPlus(6), dayPlus(6))).body.data.days[0].state).toBe("available");
  });
});

describe("T-06 Inquiry submission and unique Lead ID", () => {
  it("issues unique Lead IDs, lands in the admin inbox, and keeps clients apart", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    const a = await registerClient(app);
    const b = await registerClient(app);
    const body = { inventoryIds: [id], from: dayPlus(30), to: dayPlus(59), budget: 120000, requirement: "Brand launch campaign near the station" };
    const l1 = await request(app).post("/api/v1/leads").set(bearer(a.token)).send(body);
    const l2 = await request(app).post("/api/v1/leads").set(bearer(a.token)).send({ ...body, requirement: "Second inquiry for festive season" });
    expect(l1.status, JSON.stringify(l1.body)).toBe(201);
    expect(l1.body.data.leadId).toMatch(/^LD-\d{4}-\d{6}$/);
    expect(l1.body.data.leadId).not.toBe(l2.body.data.leadId);
    expect(l2.body.data.possibleDuplicateOf).toBe(l1.body.data.leadId);

    const inbox = await request(app).get("/api/v1/admin/leads?status=new").set(bearer(admin.token));
    const row = inbox.body.data.items.find((x: { leadId: string }) => x.leadId === l1.body.data.leadId);
    expect(row).toMatchObject({ source: "web", status: "new" });
    expect(row.possibleDuplicates).toContain(l2.body.data.leadId);

    expect((await request(app).get(`/api/v1/leads/${l1.body.data.leadId}`).set(bearer(a.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/leads/${l1.body.data.leadId}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).get("/api/v1/leads").set(bearer(b.token))).body.data).toEqual([]);
    expect((await request(app).get("/api/v1/admin/leads").set(bearer(a.token))).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: "lead.create", entityId: l1.body.data.leadId })).toBe(1);
  });

  it("rejects inquiries on demo or unknown inventory and validates the form", async () => {
    const id = await liveListing(app, vendor.token, admin.token);
    await request(app).patch(`/api/v1/admin/inventory/${id}/data-type`).set(bearer(admin.token)).send({ dataType: "DEMO", reason: "Sample" });
    const c = await registerClient(app);
    const demo = await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ inventoryIds: [id], from: dayPlus(30), to: dayPlus(59), requirement: "Want this demo site please" });
    expect(demo.status).toBe(409);
    expect((await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ inventoryIds: ["INV-HRD-999999"], from: dayPlus(30), to: dayPlus(59), requirement: "Unknown item request" })).status).toBe(409);
    const bad = await request(app).post("/api/v1/leads").set(bearer(c.token)).send({ from: dayPlus(30), to: dayPlus(10), requirement: "short" });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(["to", "requirement", "city"]));
  });
});

describe("Shortlist & compare", () => {
  it("adds, dedupes, removes and compares", async () => {
    const x = await liveListing(app, vendor.token, admin.token);
    const y = await liveListing(app, vendor.token, admin.token);
    const c = await registerClient(app);
    await request(app).post("/api/v1/shortlists").set(bearer(c.token)).send({ inventoryId: x });
    await request(app).post("/api/v1/shortlists").set(bearer(c.token)).send({ inventoryId: x });
    const s = await request(app).post("/api/v1/shortlists").set(bearer(c.token)).send({ inventoryId: y });
    expect(s.body.data.map((i: { inventoryId: string }) => i.inventoryId)).toEqual([x, y]);
    expect((await request(app).delete(`/api/v1/shortlists/${x}`).set(bearer(c.token))).body.data).toHaveLength(1);
    const cmp = await request(app).get(`/api/v1/inventory/compare?ids=${x},${y}`);
    expect(cmp.body.data.map((i: { inventoryId: string }) => i.inventoryId)).toEqual([x, y]);
    expect((await request(app).get("/api/v1/shortlists").set(bearer(vendor.token))).status).toBe(403);
  });
});
