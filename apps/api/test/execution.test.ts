import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuditLog } from "../src/models/audit-log.js";
import { WorkOrder } from "../src/models/booking.js";
import { ProofSchedule } from "../src/models/execution.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, bookedWorkOrder, png } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-ex-"));
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

const A = () => bearer(admin.token);
const V = () => bearer(vendor.token);
const exec = (woId: string, token = vendor.token) => request(app).get(`/api/v1/work-orders/${woId}/execution`).set(bearer(token));
const setStatus = (woId: string, status: string, token = vendor.token) => request(app).post(`/api/v1/work-orders/${woId}/status`).set(bearer(token)).send({ status });
function upload(woId: string, inv: string, fields: Record<string, string | number> = {}, token = vendor.token) {
  let r = request(app).post(`/api/v1/work-orders/${woId}/proofs`).set(bearer(token)).field("inventoryId", inv);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, String(v));
  return r.attach("file", png(Math.random()), { filename: "proof.png", contentType: "image/png" });
}

describe("Campaign start", () => {
  it("issuing a work order creates the campaign and a proof schedule linked to booking and work order", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const e = (await exec(x.woId)).body.data;
    expect(e.campaignId).toMatch(/^CMP-\d{4}-\d{6}$/);
    const types = e.schedule.map((s: { type: string }) => s.type);
    expect(types[0]).toBe("before");
    expect(types.at(-1)).toBe("after");
    expect(types.filter((t: string) => t === "periodic").length).toBe(4); // 30-day campaign → 4 weekly checks
    expect(e.schedule[0]).toMatchObject({ workOrderId: x.woId, inventoryId: x.inv, dueDate: x.from, status: "due" });
  });
});

describe("T-10 Proof upload and verification", () => {
  it("work order status follows the allowed transitions", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    expect((await setStatus(x.woId, "completed")).status).toBe(409); // Scheduled → Completed jump
    const noProof = await setStatus(x.woId, "installed");
    expect(noProof.status).toBe(409);
    expect(noProof.body.error.message).toMatch(/installation proof/);
    expect((await upload(x.woId, x.inv, { lat: 26.21, lng: 78.17 })).status).toBe(201);
    expect((await setStatus(x.woId, "installed")).body.data.status).toBe("installed");
    expect((await setStatus(x.woId, "installed")).status).toBe(409);
    // Booking and campaign follow: first site live → booking Live, with history.
    const b = (await request(app).get(`/api/v1/bookings/${x.bookingId}`).set(bearer(x.client.token))).body.data;
    expect(b.status).toBe("live");
    expect(b.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(["confirmed", "live"]);
    expect(await AuditLog.countDocuments({ action: "workorder.status", entityId: x.woId })).toBe(1);
  });

  it("proof carries the server timestamp, links to Booking/WO/Campaign, and labels GPS exactly", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const before = Date.now();
    const deviceTime = "2020-01-01T10:00:00+05:30"; // a wrong phone clock must not become the proof time
    const withGps = await upload(x.woId, x.inv, { lat: 26.2124, lng: 78.1772, accuracyM: 8, capturedAt: deviceTime });
    const d = withGps.body.data;
    expect(d.proofId).toMatch(/^PRF-\d{4}-\d{6}$/);
    expect(new Date(d.uploadedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(d.capturedAt).toISOString()).toBe(new Date(deviceTime).toISOString());
    expect(d).toMatchObject({ bookingId: x.bookingId, workOrderId: x.woId, type: "before", gpsSource: "device" });
    expect(d.campaignId).toMatch(/^CMP-/);
    expect(d.gpsLabel).toMatch(/^Location captured by device \(±8 m\) · \d+ m from site$/);
    const noGps = await upload(x.woId, x.inv);
    expect(noGps.body.data).toMatchObject({ gpsSource: "none", gpsLabel: "Location not captured" });
    expect(JSON.stringify([d, noGps.body.data])).not.toMatch(/verified/i);
  });

  it("rejection needs a reason, returns to the vendor, and re-upload replaces it", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const p = (await upload(x.woId, x.inv)).body.data;
    expect((await request(app).post(`/api/v1/admin/proofs/${p.proofId}/decision`).set(A()).send({ decision: "reject" })).status).toBe(400);
    const rej = await request(app).post(`/api/v1/admin/proofs/${p.proofId}/decision`).set(A()).send({ decision: "reject", reason: "Creative not visible — photo too dark" });
    expect(rej.body.data.status).toBe("rejected");
    const e = (await exec(x.woId)).body.data;
    expect(e.proofs[0]).toMatchObject({ status: "rejected", rejectReason: "Creative not visible — photo too dark" });
    expect(e.schedule[0].status).toBe("rejected");
    const again = (await upload(x.woId, x.inv)).body.data;
    expect(again.type).toBe("before");
    expect((await exec(x.woId)).body.data.schedule[0]).toMatchObject({ status: "uploaded", latestProofId: again.proofId });
    expect((await request(app).post(`/api/v1/admin/proofs/${p.proofId}/decision`).set(A()).send({ decision: "verify" })).status).toBe(409);
    expect(await AuditLog.countDocuments({ action: "proof.reupload", entityId: again.proofId })).toBe(1);
  });

  it("client gallery shows only verified proof for their own booking, via expiring signed links", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const a = (await upload(x.woId, x.inv)).body.data;
    await upload(x.woId, x.inv); // second, left unverified
    await request(app).post(`/api/v1/admin/proofs/${a.proofId}/decision`).set(A()).send({ decision: "verify" });
    const g = (await request(app).get(`/api/v1/bookings/${x.bookingId}/proofs`).set(bearer(x.client.token))).body.data;
    expect(g.proofs.map((p: { proofId: string }) => p.proofId)).toEqual([a.proofId]);
    expect(JSON.stringify(g)).not.toMatch(/"lat"|vendorId|rejectReason/);
    const img = await request(app).get(g.proofs[0].url); // no session needed — the signature is the credential
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    const tampered = g.proofs[0].url.replace(/sig=[^&]+/, "sig=AAAA");
    expect((await request(app).get(tampered)).status).toBe(404);
    const expired = g.proofs[0].url.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) - 5}`);
    expect((await request(app).get(expired)).status).toBe(404);
    const other = await registerClient(app);
    expect((await request(app).get(`/api/v1/bookings/${x.bookingId}/proofs`).set(bearer(other.token))).status).toBe(404);
  });

  it("only the assigned vendor (or Admin) can upload or see execution; clients can't upload", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const other = await approvedVendor(app, admin.token);
    expect((await upload(x.woId, x.inv, {}, other.token)).status).toBe(404);
    expect((await exec(x.woId, other.token)).status).toBe(404);
    expect((await upload(x.woId, x.inv, {}, x.client.token)).status).toBe(403);
    const bad = await request(app).post(`/api/v1/work-orders/${x.woId}/proofs`).set(V()).field("inventoryId", x.inv).attach("file", Buffer.from("not an image at all"), { filename: "x.png", contentType: "image/png" });
    expect(bad.status).toBe(400);
  });

  it("overdue proof shows up for admin, the vendor and the dashboard", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    await ProofSchedule.updateOne({ workOrderId: x.woId, type: "before" }, { $set: { dueDate: new Date(Date.now() - 2 * 86_400_000) } });
    const adminList = (await request(app).get("/api/v1/admin/proofs/overdue").set(A())).body.data;
    expect(adminList.some((s: { workOrderId: string }) => s.workOrderId === x.woId)).toBe(true);
    const mine = (await request(app).get("/api/v1/vendors/me/proofs/overdue").set(V())).body.data;
    expect(mine.some((s: { workOrderId: string }) => s.workOrderId === x.woId)).toBe(true);
    expect((await request(app).get("/api/v1/admin/dashboard").set(A())).body.data.exceptions.overdueProofs).toBe(adminList.length);
  });
});

describe("Issue Raised workflow → admin issue tracker", () => {
  it("raising an issue pauses the work order; resolving it (with notes) restores the previous state", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    await upload(x.woId, x.inv);
    await setStatus(x.woId, "installed");
    const campaignId = (await exec(x.woId)).body.data.campaignId;
    const iss = await request(app).post(`/api/v1/campaigns/${campaignId}/issues`).set(V()).send({ workOrderId: x.woId, category: "damage", description: "Flex torn by storm on day 3" });
    expect(iss.status).toBe(201);
    expect(iss.body.data.issueId).toMatch(/^ISS-\d{4}-\d{6}$/);
    expect((await exec(x.woId)).body.data).toMatchObject({ status: "issue_raised", previousStatus: "installed" });
    expect((await setStatus(x.woId, "inspection_due")).body.error.message).toMatch(/Resolve the open issue/);

    const list = (await request(app).get("/api/v1/admin/issues").set(A())).body.data;
    expect(list.find((i: { issueId: string }) => i.issueId === iss.body.data.issueId)).toMatchObject({ status: "open", category: "damage" });
    await request(app).patch(`/api/v1/admin/issues/${iss.body.data.issueId}`).set(A()).send({ owner: "Ops — Rahul", dueDate: "2026-12-20", status: "in_progress" });
    expect((await request(app).patch(`/api/v1/admin/issues/${iss.body.data.issueId}`).set(A()).send({ status: "resolved" })).status).toBe(400);
    const done = await request(app).patch(`/api/v1/admin/issues/${iss.body.data.issueId}`).set(A()).send({ status: "resolved", resolutionNote: "Vendor replaced flex; new proof uploaded" });
    expect(done.body.data).toMatchObject({ status: "resolved", owner: "Ops — Rahul", dueDate: "2026-12-20" });
    expect((await exec(x.woId)).body.data.status).toBe("installed");
  });

  it("the booking's client can raise a complaint; other clients can't", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    const c = (await request(app).get(`/api/v1/campaigns/by-booking/${x.bookingId}`).set(bearer(x.client.token))).body.data;
    expect((await request(app).post(`/api/v1/campaigns/${c.campaignId}/issues`).set(bearer(x.client.token)).send({ category: "visibility", description: "Hoarding blocked by a tree from the main road" })).status).toBe(201);
    const other = await registerClient(app);
    expect((await request(app).post(`/api/v1/campaigns/${c.campaignId}/issues`).set(bearer(other.token)).send({ category: "other", description: "Trying to complain on someone else's campaign" })).status).toBe(404);
  });
});

describe("Completion", () => {
  it("can't complete before the end date; completing every site completes the booking", async () => {
    const x = await bookedWorkOrder(app, admin.token, vendor);
    await upload(x.woId, x.inv);
    await setStatus(x.woId, "installed");
    await setStatus(x.woId, "inspection_due");
    expect((await setStatus(x.woId, "completed")).status).toBe(409);
    await WorkOrder.updateOne({ _id: x.woId }, { $set: { "items.0.to": new Date(Date.now() - 86_400_000) } });
    expect((await setStatus(x.woId, "completed", admin.token)).body.data.status).toBe("completed");
    expect((await request(app).get(`/api/v1/bookings/${x.bookingId}`).set(bearer(x.client.token))).body.data.status).toBe("completed");
    expect((await upload(x.woId, x.inv)).status).toBe(409);
  });
});
