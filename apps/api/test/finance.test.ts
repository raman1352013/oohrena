import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuditLog } from "../src/models/audit-log.js";
import { Booking } from "../src/models/booking.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { PDF, approvedVendor, bookedWorkOrder, png } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-fin-"));
const { app, cfg } = testApp({ UPLOAD_DIR: uploadDir });
let admin: { token: string; userId: string };
let fin1: { token: string; userId: string };
let fin2: { token: string; userId: string };
let vendor: { token: string; vendorId: string };

beforeAll(async () => {
  await startTestDb();
  admin = await createStaff(app, cfg, "admin");
  fin1 = await createStaff(app, cfg, "finance");
  fin2 = await createStaff(app, cfg, "finance");
  vendor = await approvedVendor(app, admin.token);
});
afterAll(async () => {
  await stopTestDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

const today = () => new Date().toISOString().slice(0, 10);
function pay(kind: "payments" | "vendor-payments" | "refunds", token: string, fields: Record<string, string | number>, withProof = true) {
  let r = request(app).post(`/api/v1/finance/${kind}`).set(bearer(token));
  for (const [k, v] of Object.entries({ mode: "neft", reference: `UTR${Math.floor(Math.random() * 1e9)}`, paidOn: today(), ...fields })) r = r.field(k, String(v));
  return withProof ? r.attach("file", PDF, { filename: "utr.pdf", contentType: "application/pdf" }) : r;
}
const verify = (id: string, token: string, decision = "verify", reason?: string) => request(app).post(`/api/v1/finance/payments/${id}/verify`).set(bearer(token)).send(reason ? { decision, reason } : { decision });
async function invoiced() {
  const x = await bookedWorkOrder(app, admin.token, vendor);
  const inv = await request(app).post("/api/v1/finance/invoices").set(bearer(fin1.token)).send({ bookingId: x.bookingId });
  expect(inv.status, JSON.stringify(inv.body)).toBe(201);
  const b = await Booking.findById(x.bookingId).lean();
  return { ...x, invoice: inv.body.data, total: b!.total as number, vendorCost: b!.items[0]!.vendorCost };
}

describe("T-11 Payment recorded with evidence and verified by a second user", () => {
  it("blocks payment without proof; second Finance user verifies; maker can't verify own entry", async () => {
    const x = await invoiced();
    expect(x.invoice.invoiceId).toMatch(/^TXI-\d{4}-\d{6}$/);
    expect(x.invoice).toMatchObject({ total: x.total, advancePct: 50, advanceAmount: Math.round(x.total / 2), status: "issued" });

    expect((await pay("payments", fin1.token, { bookingId: x.bookingId, amount: 1000 }, false)).status).toBe(400);
    const p = await pay("payments", fin1.token, { bookingId: x.bookingId, amount: x.invoice.advanceAmount });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect(p.body.data).toMatchObject({ status: "unverified", direction: "client_receipt" });
    expect(p.body.data.paymentId).toMatch(/^PAY-\d{4}-\d{6}$/);

    const self = await verify(p.body.data.paymentId, fin1.token);
    expect(self.status).toBe(403);
    expect(self.body.error.message).toMatch(/Maker-checker/);
    expect((await verify(p.body.data.paymentId, admin.token)).status).toBe(403); // Admin can't be checker
    expect((await verify(p.body.data.paymentId, fin2.token)).body.data.status).toBe("verified");

    const rec = (await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}`).set(bearer(fin2.token))).body.data;
    expect(rec.client).toMatchObject({ received: x.invoice.advanceAmount, balanceDue: x.total - x.invoice.advanceAmount, advanceReceived: true });
    expect(await AuditLog.countDocuments({ action: "payment.verify", entityId: p.body.data.paymentId, userId: fin2.userId })).toBe(1);
  });

  it("admin can record (maker) but sees status only; clients can't touch finance", async () => {
    const x = await invoiced();
    const p = await pay("payments", admin.token, { bookingId: x.bookingId, amount: 5000 });
    expect(p.status).toBe(201);
    expect((await verify(p.body.data.paymentId, fin1.token)).body.data.status).toBe("verified");
    const st = (await request(app).get(`/api/v1/finance/bookings/${x.bookingId}/status`).set(bearer(admin.token))).body.data;
    expect(st.invoice.status).toBe("partially_paid");
    expect(JSON.stringify(st)).not.toMatch(/amount|total|received/);
    expect((await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}`).set(bearer(admin.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/finance/overview").set(bearer(x.client.token))).status).toBe(403);
    expect((await pay("payments", x.client.token, { bookingId: x.bookingId, amount: 1 })).status).toBe(403);
    const mine = (await request(app).get("/api/v1/clients/me/payments").set(bearer(x.client.token))).body.data;
    expect(mine.invoices[0].invoiceId).toBe(x.invoice.invoiceId);
    expect(mine.payments[0]).toMatchObject({ status: "verified", amount: 5000 });
    expect(JSON.stringify(mine)).not.toMatch(/recordedBy|proofFileId/);
  });

  it("refuses over-collection beyond the invoice", async () => {
    const x = await invoiced();
    expect((await pay("payments", fin1.token, { bookingId: x.bookingId, amount: x.total + 100 })).status).toBe(409);
  });
});

describe("Vendor payable, commission and reconciliation", () => {
  it("payable becomes due after verified proof, is paid out with maker-checker, and the statement balances", async () => {
    const x = await invoiced();
    let pv = (await request(app).get("/api/v1/vendors/me/payables").set(bearer(vendor.token))).body.data.payables.find((p: { bookingId: string }) => p.bookingId === x.bookingId);
    expect(pv).toMatchObject({ amount: x.vendorCost, gst: 0, status: "pending" }); // vendor has no GSTIN → no GST on payable
    expect((await pay("vendor-payments", fin1.token, { bookingId: x.bookingId, vendorId: vendor.vendorId, amount: 100 })).status).toBe(409); // not due yet

    // Execution evidence: proof uploaded and verified → payable due.
    const proof = await request(app).post(`/api/v1/work-orders/${x.woId}/proofs`).set(bearer(vendor.token)).field("inventoryId", x.inv).attach("file", png(1), { filename: "p.png", contentType: "image/png" });
    await request(app).post(`/api/v1/admin/proofs/${proof.body.data.proofId}/decision`).set(bearer(admin.token)).send({ decision: "verify" });
    pv = (await request(app).get("/api/v1/vendors/me/payables").set(bearer(vendor.token))).body.data.payables.find((p: { bookingId: string }) => p.bookingId === x.bookingId);
    expect(pv.status).toBe("due");

    const out = await pay("vendor-payments", fin1.token, { bookingId: x.bookingId, vendorId: vendor.vendorId, amount: x.vendorCost });
    expect(out.status, JSON.stringify(out.body)).toBe(201);
    await verify(out.body.data.paymentId, fin2.token);
    const full = await pay("payments", fin1.token, { bookingId: x.bookingId, amount: x.total });
    await verify(full.body.data.paymentId, fin2.token);

    const rec = (await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}`).set(bearer(fin1.token))).body.data;
    expect(rec.vendors[0]).toMatchObject({ payable: x.vendorCost, paid: x.vendorCost, balance: 0, status: "paid" });
    expect(rec.client).toMatchObject({ billed: x.total, received: x.total, balanceDue: 0 });
    const b = await Booking.findById(x.bookingId).lean();
    expect(rec.platform.commission).toBe((b!.subtotal as number) - x.vendorCost);
    expect(rec.platform.commission + x.vendorCost + rec.platform.serviceFee + rec.platform.outputGst).toBe(x.total); // ties out
    expect(rec.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);

    // Other vendor sees nothing of it.
    const other = await approvedVendor(app, admin.token);
    expect((await request(app).get("/api/v1/vendors/me/payables").set(bearer(other.token))).body.data.payables).toEqual([]);

    const csv = await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}?format=csv`).set(bearer(fin1.token));
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain(`Client received (verified),${x.total}`);
    const pdf = await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}?format=pdf`).set(bearer(fin1.token)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect(await AuditLog.countDocuments({ action: "finance.export", entityId: x.bookingId })).toBe(2);
  });
});

describe("Refunds follow the cancellation rule", () => {
  it("refund is capped by the rule and linked to it", async () => {
    const x = await invoiced();
    const p = await pay("payments", fin1.token, { bookingId: x.bookingId, amount: x.total });
    await verify(p.body.data.paymentId, fin2.token);
    expect((await pay("refunds", fin1.token, { bookingId: x.bookingId, amount: 100, reason: "test" })).status).toBe(409); // not cancelled
    const c = await request(app).post(`/api/v1/bookings/${x.bookingId}/cancel`).set(bearer(x.client.token)).send({ reason: "Campaign dropped" });
    const { refundable, rule } = c.body.data.cancellation;
    expect((await pay("refunds", fin1.token, { bookingId: x.bookingId, amount: refundable + 500, reason: "Cancellation refund" })).status).toBe(409);
    const ok = await pay("refunds", fin1.token, { bookingId: x.bookingId, amount: refundable, reason: "Cancellation refund" });
    expect(ok.status).toBe(201);
    expect(ok.body.data.ruleApplied).toContain(rule);
    await verify(ok.body.data.paymentId, fin2.token);
    const rec = (await request(app).get(`/api/v1/finance/reconciliation/${x.bookingId}`).set(bearer(fin1.token))).body.data;
    expect(rec.client).toMatchObject({ refunded: refundable, balanceDue: rec.client.billed - (x.total - refundable) });
    expect(rec.checks.every((c2: { ok: boolean }) => c2.ok)).toBe(true);
  });
});

describe("Payment edits are fully logged; no edits after verification", () => {
  it("records old/new value, user and time", async () => {
    const x = await invoiced();
    const p = (await pay("payments", fin1.token, { bookingId: x.bookingId, amount: 2000, reference: "UTR-OLD-1" })).body.data;
    expect((await request(app).patch(`/api/v1/finance/payments/${p.paymentId}`).set(bearer(fin1.token)).send({ reference: "UTR-NEW-1" })).status).toBe(400); // reason required
    await request(app).patch(`/api/v1/finance/payments/${p.paymentId}`).set(bearer(fin1.token)).send({ reference: "UTR-NEW-1", reason: "Typo in UTR" });
    const h = (await request(app).get(`/api/v1/finance/payments/${p.paymentId}/history`).set(bearer(fin2.token))).body.data;
    expect(h[0]).toMatchObject({ field: "reference", old: "UTR-OLD-1", new: "UTR-NEW-1", changedBy: fin1.userId, reason: "Typo in UTR" });
    expect(h[0].at).toBeTruthy();
    await verify(p.paymentId, fin2.token);
    expect((await request(app).patch(`/api/v1/finance/payments/${p.paymentId}`).set(bearer(fin1.token)).send({ amount: 1, reason: "change after verify" })).status).toBe(409);
  });
});

describe("Bank details", () => {
  it("full account number only for Finance, every view logged", async () => {
    await request(app).put("/api/v1/vendors/me/bank").set(bearer(vendor.token)).send({ accountName: "Vendor A", accountNo: "123456789012", ifsc: "HDFC0001234" });
    const f = await request(app).get(`/api/v1/finance/vendors/${vendor.vendorId}/bank`).set(bearer(fin1.token));
    expect(f.body.data.accountNo).toBe("123456789012");
    expect(await AuditLog.countDocuments({ action: "vendor.bank.view", entityId: vendor.vendorId })).toBe(1);
    expect((await request(app).get(`/api/v1/finance/vendors/${vendor.vendorId}/bank`).set(bearer(admin.token))).status).toBe(403);
    const c = await registerClient(app);
    expect((await request(app).get(`/api/v1/finance/vendors/${vendor.vendorId}/bank`).set(bearer(c.token))).status).toBe(403);
  });
});
