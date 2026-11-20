import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuditLog } from "../src/models/audit-log.js";
import { StoredFile } from "../src/models/files.js";
import { InventoryHistory } from "../src/models/inventory.js";
import { VendorBank } from "../src/models/vendor-kyc.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp, vendorPayload } from "./helpers.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-up-"));
const { app, cfg } = testApp({ UPLOAD_DIR: uploadDir });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
// 1×1 PNG; a second variant (different bytes) avoids identical-photo duplicate flags where not wanted.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (n: number) => Buffer.concat([PNG, Buffer.from(`#${n}`)]);

let admin: { token: string };
let finance: { token: string };

async function newVendor() {
  const res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
  expect(res.status).toBe(201);
  return { token: res.body.data.token as string, vendorId: res.body.data.vendorId as string };
}
async function uploadPan(token: string) {
  const r = await request(app).post("/api/v1/vendors/me/documents").set(bearer(token)).field("type", "pan").attach("file", PDF, { filename: "pan.pdf", contentType: "application/pdf" });
  expect(r.status).toBe(201);
  return r.body.data as { fileId: string };
}
async function approvedVendor() {
  const v = await newVendor();
  await uploadPan(v.token);
  const d = await request(app).post(`/api/v1/admin/vendors/${v.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "approve" });
  expect(d.status).toBe(200);
  return v;
}

let seq = 0;
const hoarding = (o: Record<string, unknown> = {}) => ({
  category: "hoarding", title: `Test Hoarding ${++seq}`, city: "Gwalior", locality: "Phoolbagh", landmark: "Near Phoolbagh Chowk",
  address: "Phoolbagh Road, Lashkar", pin: "474001", lat: 26.2124 + seq * 0.01, lng: 78.1772, rate: 40000, pricingUnit: "per_month", quantity: 1,
  attributes: { widthFt: 40, heightFt: 20, illuminated: true }, ...o,
});
async function createListing(token: string, o: Record<string, unknown> = {}) {
  const r = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(token)).send(hoarding(o));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data as { inventoryId: string; status: string };
}
async function addPhoto(token: string, id: string, n = Math.random()) {
  const r = await request(app).post(`/api/v1/vendors/me/inventory/${id}/photos`).set(bearer(token)).attach("photos", png(n), { filename: "site.png", contentType: "image/png" });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
}
async function liveListing(token: string, o: Record<string, unknown> = {}) {
  const l = await createListing(token, o);
  await addPhoto(token, l.inventoryId);
  expect((await request(app).post(`/api/v1/vendors/me/inventory/${l.inventoryId}/submit`).set(bearer(token))).status).toBe(200);
  const d = await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "approve", indicativePrice: 52000 });
  expect(d.status, JSON.stringify(d.body)).toBe(200);
  return l.inventoryId;
}

beforeAll(async () => {
  await startTestDb();
  admin = await createStaff(app, cfg, "admin");
  finance = await createStaff(app, cfg, "finance");
});
afterAll(async () => {
  await stopTestDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("T-01 Vendor registration & KYC approval", () => {
  it("uploads KYC encrypted at rest and rejects files by real type, not extension", async () => {
    const v = await newVendor();
    const doc = await uploadPan(v.token);
    const f = await StoredFile.findById(doc.fileId).lean();
    expect(f?.encrypted).toBe(true);
    const onDisk = readFileSync(path.join(uploadDir, f!.storagePath));
    expect(onDisk.subarray(0, 4).toString()).not.toBe("%PDF");
    const fake = await request(app).post("/api/v1/vendors/me/documents").set(bearer(v.token)).field("type", "gst").attach("file", Buffer.from("MZ not a pdf"), { filename: "gst.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(400);
    const me = await request(app).get("/api/v1/vendors/me").set(bearer(v.token));
    expect(me.body.data.kycStatus).toBe("pending");
    expect(me.body.data.missingDocuments).toEqual([]);
  });

  it("appears in the admin KYC queue; approval needs documents, rejection needs a reason; both are logged", async () => {
    const noDocs = await newVendor();
    const queue = await request(app).get("/api/v1/admin/vendors?kycStatus=pending").set(bearer(admin.token));
    expect(queue.body.data.items.map((x: { vendorId: string }) => x.vendorId)).toContain(noDocs.vendorId);
    expect((await request(app).post(`/api/v1/admin/vendors/${noDocs.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "approve" })).status).toBe(409);
    expect((await request(app).post(`/api/v1/admin/vendors/${noDocs.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "reject" })).status).toBe(400);
    const rej = await request(app).post(`/api/v1/admin/vendors/${noDocs.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "reject", reason: "PAN document missing" });
    expect(rej.body.data.kycStatus).toBe("rejected");
    expect((await request(app).get("/api/v1/vendors/me").set(bearer(noDocs.token))).body.data.kycReason).toBe("PAN document missing");
    expect(await AuditLog.countDocuments({ action: "vendor.kyc.reject", entityId: noDocs.vendorId, reason: "PAN document missing" })).toBe(1);

    // Vendor fixes and resubmits → pending → approved.
    await uploadPan(noDocs.token);
    expect((await request(app).post("/api/v1/vendors/me/kyc/resubmit").set(bearer(noDocs.token))).body.data.kycStatus).toBe("pending");
    const ok = await request(app).post(`/api/v1/admin/vendors/${noDocs.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "approve" });
    expect(ok.body.data.kycStatus).toBe("approved");
    expect(await AuditLog.countDocuments({ action: "vendor.kyc.approve", entityId: noDocs.vendorId })).toBe(1);
  });

  it("vendors can't decide KYC (their own or anyone's)", async () => {
    const v = await newVendor();
    expect((await request(app).post(`/api/v1/admin/vendors/${v.vendorId}/kyc-decision`).set(bearer(v.token)).send({ decision: "approve" })).status).toBe(403);
  });

  it("stores bank details encrypted, shows them masked and audits changes", async () => {
    const v = await newVendor();
    const put = await request(app).put("/api/v1/vendors/me/bank").set(bearer(v.token)).send({ accountName: "Test Media", accountNo: "123456789012", ifsc: "sbin0001234" });
    expect(put.status).toBe(200);
    expect(put.body.data.accountNo).toBe("XXXXXX9012");
    expect(put.body.data.ifsc).toBe("SBIN0001234");
    const raw = await VendorBank.findOne({}).select("+accountNoEnc").lean();
    expect(JSON.stringify(raw)).not.toContain("123456789012");
    const { token } = await registerClient(app);
    expect((await request(app).get("/api/v1/vendors/me/bank").set(bearer(token))).status).toBe(403);
    expect(JSON.stringify(await AuditLog.find({ action: "vendor.bank.update" }).lean())).not.toContain("123456789012");
  });

  it("KYC files are private: other vendors and clients get 404, Finance can open them (logged)", async () => {
    const a = await newVendor();
    const doc = await uploadPan(a.token);
    const b = await newVendor();
    const { token: client } = await registerClient(app);
    expect((await request(app).get(`/api/v1/files/${doc.fileId}`).set(bearer(a.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/files/${doc.fileId}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/files/${doc.fileId}`).set(bearer(client))).status).toBe(404);
    const fin = await request(app).get(`/api/v1/files/${doc.fileId}`).set(bearer(finance.token));
    expect(fin.status).toBe(200);
    expect(fin.body.subarray?.(0, 4).toString() ?? Buffer.from(fin.body).subarray(0, 4).toString()).toBe("%PDF");
    expect(await AuditLog.countDocuments({ action: "vendor.document.view", entityId: doc.fileId })).toBeGreaterThanOrEqual(2);
  });
});

describe("T-02 Inventory upload & admin approval", () => {
  it("rejects a listing with missing mandatory or category fields", async () => {
    const v = await newVendor();
    const missing = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(v.token)).send(hoarding({ pin: "" }));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.fieldErrors.pin).toBeTruthy();
    const led = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(v.token)).send(hoarding({ category: "led_screen", pricingUnit: "per_slot", attributes: { widthFt: 20, heightFt: 10 } }));
    expect(led.status).toBe(400);
    expect(JSON.stringify(led.body.error.details)).toMatch(/Slot length is required/);
    const unit = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(v.token)).send(hoarding({ pricingUnit: "per_vehicle_month" }));
    expect(unit.status).toBe(400);
  });

  it("gives each item a unique Inventory ID and Draft status", async () => {
    const v = await newVendor();
    const a = await createListing(v.token);
    const b = await createListing(v.token);
    expect(a.inventoryId).toMatch(/^INV-HRD-\d{6}$/);
    expect(a.inventoryId).not.toBe(b.inventoryId);
    expect([a.status, b.status]).toEqual(["draft", "draft"]);
  });

  it("only Approved + Verified listings reach the public catalogue, without vendor identity or rate", async () => {
    const v = await newVendor();
    const l = await createListing(v.token);
    const pub = () => request(app).get("/api/v1/inventory?pageSize=100");
    const ids = async () => (await pub()).body.data.items.map((x: { inventoryId: string }) => x.inventoryId);

    expect((await request(app).post(`/api/v1/vendors/me/inventory/${l.inventoryId}/submit`).set(bearer(v.token))).body.error.details.problems).toContain("Add at least one photo of the site");
    await addPhoto(v.token, l.inventoryId);
    expect((await request(app).post(`/api/v1/vendors/me/inventory/${l.inventoryId}/submit`).set(bearer(v.token))).body.data.status).toBe("pending");
    expect(await ids()).not.toContain(l.inventoryId);
    expect((await request(app).get(`/api/v1/inventory/${l.inventoryId}`)).status).toBe(404);

    // Vendor KYC still pending → listing approval is blocked.
    expect((await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "approve" })).status).toBe(409);
    await uploadPan(v.token);
    await request(app).post(`/api/v1/admin/vendors/${v.vendorId}/kyc-decision`).set(bearer(admin.token)).send({ decision: "approve" });
    const ok = await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "approve", indicativePrice: 50000 });
    expect(ok.body.data).toMatchObject({ status: "approved", dataType: "VERIFIED", indicativePrice: 50000 });

    expect(await ids()).toContain(l.inventoryId);
    const detail = await request(app).get(`/api/v1/inventory/${l.inventoryId}`);
    expect(detail.body.data).toMatchObject({ verified: true, bookable: true, indicativePrice: 50000 });
    const body = JSON.stringify(detail.body);
    expect(body).not.toContain(v.vendorId);
    expect(body).not.toMatch(/"rate"|vendorId|address/);
    expect((await request(app).get(detail.body.data.photos[0].replace(/^\/api\/v1/, "/api/v1"))).status).toBe(200);
  });

  it("vendors can't approve their own listing or set its data type", async () => {
    const v = await approvedVendor();
    const l = await createListing(v.token);
    expect((await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(v.token)).send({ decision: "approve" })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/admin/inventory/${l.inventoryId}/data-type`).set(bearer(v.token)).send({ dataType: "VERIFIED", reason: "self" })).status).toBe(403);
    // A draft can't be rejected — only pending listings are reviewed.
    expect((await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "reject", reason: "Not ready" })).status).toBe(409);
  });

  it("rejection needs a reason and the vendor sees it", async () => {
    const v = await approvedVendor();
    const l = await createListing(v.token);
    await addPhoto(v.token, l.inventoryId);
    await request(app).post(`/api/v1/vendors/me/inventory/${l.inventoryId}/submit`).set(bearer(v.token));
    expect((await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "reject" })).status).toBe(400);
    await request(app).post(`/api/v1/admin/inventory/${l.inventoryId}/decision`).set(bearer(admin.token)).send({ decision: "reject", reason: "Photo does not show the site" });
    const mine = await request(app).get(`/api/v1/vendors/me/inventory/${l.inventoryId}`).set(bearer(v.token));
    expect(mine.body.data).toMatchObject({ status: "rejected", statusReason: "Photo does not show the site" });
  });
});

describe("Module 4 — versioned edits, demo flag, isolation", () => {
  it("critical edits on an approved listing go back to Pending with history; minor edits don't", async () => {
    const v = await approvedVendor();
    const id = await liveListing(v.token);
    const before = (await request(app).get(`/api/v1/vendors/me/inventory/${id}`).set(bearer(v.token))).body.data;

    const minor = await request(app).patch(`/api/v1/vendors/me/inventory/${id}`).set(bearer(v.token)).send({ description: "Lit till midnight" });
    expect(minor.body.data.status).toBe("approved");
    expect(new Date(minor.body.data.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());

    const rate = await request(app).patch(`/api/v1/vendors/me/inventory/${id}`).set(bearer(v.token)).send({ rate: 45000 });
    expect(rate.body.data.status).toBe("pending");
    expect(rate.body.data.version).toBe(before.version + 2);
    const hist = await InventoryHistory.find({ inventoryId: id }).lean();
    expect(hist).toEqual(expect.arrayContaining([expect.objectContaining({ field: "rate", old: 40000, new: 45000 }), expect.objectContaining({ field: "status", old: "approved", new: "pending" })]));
    // Pending listings leave the public catalogue and are locked for editing.
    expect((await request(app).get(`/api/v1/inventory/${id}`)).status).toBe(404);
    expect((await request(app).patch(`/api/v1/vendors/me/inventory/${id}`).set(bearer(v.token)).send({ rate: 1 })).status).toBe(409);
    expect((await request(app).get(`/api/v1/vendors/me/inventory/${id}/history`).set(bearer(v.token))).body.data.length).toBeGreaterThan(2);
  });

  it("DEMO records are badged, hidden by default and never bookable", async () => {
    const v = await approvedVendor();
    const id = await liveListing(v.token);
    expect((await request(app).patch(`/api/v1/admin/inventory/${id}/data-type`).set(bearer(admin.token)).send({ dataType: "DEMO" })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/admin/inventory/${id}/data-type`).set(bearer(admin.token)).send({ dataType: "DEMO", reason: "Sample record for training" })).status).toBe(200);
    const def = await request(app).get("/api/v1/inventory?pageSize=100");
    expect(def.body.data.items.map((x: { inventoryId: string }) => x.inventoryId)).not.toContain(id);
    const all = await request(app).get("/api/v1/inventory?pageSize=100&includeDemo=true");
    expect(all.body.data.items.find((x: { inventoryId: string }) => x.inventoryId === id)).toMatchObject({ dataType: "DEMO", verified: false, bookable: false });
  });

  it("Vendor A can't read or edit Vendor B's listing or photos", async () => {
    const a = await newVendor();
    const b = await newVendor();
    const l = await createListing(b.token);
    await addPhoto(b.token, l.inventoryId);
    expect((await request(app).get(`/api/v1/vendors/me/inventory/${l.inventoryId}`).set(bearer(a.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/vendors/me/inventory/${l.inventoryId}`).set(bearer(a.token)).send({ title: "Hijack" })).status).toBe(404);
    expect((await request(app).post(`/api/v1/vendors/me/inventory/${l.inventoryId}/submit`).set(bearer(a.token))).status).toBe(404);
    const mine = (await request(app).get(`/api/v1/vendors/me/inventory/${l.inventoryId}`).set(bearer(b.token))).body.data;
    expect((await request(app).get(`/api/v1/files/${mine.photos[0].fileId}`).set(bearer(a.token))).status).toBe(404);
    const list = await request(app).get("/api/v1/vendors/me/inventory").set(bearer(a.token));
    expect(list.body.data.items.map((x: { inventoryId: string }) => x.inventoryId)).not.toContain(l.inventoryId);
  });
});

describe("Module 3 — duplicate listing detection", () => {
  it("flags a near-identical listing (same category within 30 m) for admin review", async () => {
    const a = await approvedVendor();
    const b = await approvedVendor();
    const first = await liveListing(a.token, { lat: 23.2599, lng: 77.4126 });
    const copy = await createListing(b.token, { lat: 23.25992, lng: 77.41262 });
    await addPhoto(b.token, copy.inventoryId);
    await request(app).post(`/api/v1/vendors/me/inventory/${copy.inventoryId}/submit`).set(bearer(b.token));
    const flags = await request(app).get("/api/v1/admin/duplicates").set(bearer(admin.token));
    const f = flags.body.data.find((x: { entityA: string; entityB: string }) => [x.entityA, x.entityB].sort().join() === [first, copy.inventoryId].sort().join());
    expect(f).toMatchObject({ resolution: "open", reasons: expect.arrayContaining(["Same category within 30 m"]) });
    const review = await request(app).get("/api/v1/admin/inventory?status=pending").set(bearer(admin.token));
    expect(review.body.data.items.find((x: { inventoryId: string }) => x.inventoryId === copy.inventoryId).openDuplicates).toHaveLength(1);
    expect((await request(app).post(`/api/v1/admin/duplicates/${f.flagId}/resolve`).set(bearer(admin.token)).send({ resolution: "dismissed", note: "Different faces of the same junction" })).status).toBe(200);
  });
});

describe("Module 4 — CSV bulk import", () => {
  const header = "title,category,city,locality,landmark,address,pin,lat,lng,rate,pricing_unit,quantity,attr_widthFt,attr_heightFt,attr_fleetSize";
  const good = (n: number) => `CSV Hoarding ${n},hoarding,Gwalior,City Centre,,"Main Rd, Block ${n}",474001,26.2${n},78.17,30000,per_month,1,30,15,`;

  it("reports every bad row and imports nothing", async () => {
    const v = await newVendor();
    const csv = [header, good(1), `Bad PIN,hoarding,Gwalior,X,,Addr,12,26.2,78.1,30000,per_month,1,30,15,`, `No fleet,erickshaw_auto,Gwalior,X,,Addr,474001,26.2,78.1,800,per_vehicle_month,1,,,`, `Wrong unit,hoarding,Gwalior,X,,Addr,474001,26.2,78.1,30000,per_slot,1,30,15,`].join("\n");
    const r = await request(app).post("/api/v1/vendors/me/inventory/import").set(bearer(v.token)).send({ csv });
    expect(r.status).toBe(400);
    expect([...new Set(r.body.error.details.rows.map((x: { row: number }) => x.row))]).toEqual([3, 4, 5]);
    expect((await request(app).get("/api/v1/vendors/me/inventory").set(bearer(v.token))).body.data.total).toBe(0);
  });

  it("imports valid rows as drafts with unique IDs", async () => {
    const v = await newVendor();
    const r = await request(app).post("/api/v1/vendors/me/inventory/import").set(bearer(v.token)).send({ csv: [header, good(1), good(2), good(3)].join("\r\n") });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(new Set(r.body.data.created).size).toBe(3);
    const list = await request(app).get("/api/v1/vendors/me/inventory").set(bearer(v.token));
    expect(list.body.data.items.every((x: { status: string }) => x.status === "draft")).toBe(true);
  });
});
