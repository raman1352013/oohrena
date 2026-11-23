import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { approvedVendor, bookedWorkOrder, PDF, png } from "./fixtures.js";
import { bearer, createStaff, mobileFor, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { ReportExport } from "../src/models/report-export.js";
import { Notification } from "../src/models/notification.js";

describe("Module 9 — Reporting, Notifications & Audit Trail", () => {
  let app: import("express").Express;
  let cfg: import("../src/config.js").Config;
  let adminToken: string;
  let financeToken: string;

  beforeAll(async () => {
    await startTestDb();
    const t = testApp();
    app = t.app;
    cfg = t.cfg;
    const a = await createStaff(app, cfg, "admin");
    adminToken = a.token;
    const f = await createStaff(app, cfg, "finance");
    financeToken = f.token;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("T-12: generates client campaign report (JSON/CSV/PDF) and reconciles booking, proof and payment numbers", async () => {
    const A = bearer(adminToken);
    const F = bearer(financeToken);

    // 1. Setup vendor and booked work order
    const vendor = await approvedVendor(app, adminToken);
    const chain = await bookedWorkOrder(app, adminToken, vendor);

    // 2. Upload proof and have admin verify it
    const uploadRes = await request(app)
      .post(`/api/v1/work-orders/${chain.woId}/proofs`)
      .set(bearer(vendor.token))
      .field("inventoryId", chain.inv)
      .field("lat", 26.205)
      .field("lng", 78.175)
      .attach("file", png(1), { filename: "installation.png", contentType: "image/png" });
    expect(uploadRes.status).toBe(201);
    const proofId = uploadRes.body.data.proofId as string;

    const verifyProofRes = await request(app)
      .post(`/api/v1/admin/proofs/${proofId}/decision`)
      .set(A)
      .send({ decision: "verify" });
    expect(verifyProofRes.status).toBe(200);

    // 3. Issue tax invoice and record + verify payment
    const invRes = await request(app)
      .post("/api/v1/finance/invoices")
      .set(F)
      .send({ bookingId: chain.bookingId, advancePct: 100, dueDate: chain.from });
    expect(invRes.status).toBe(201);
    const invoiceTotal = invRes.body.data.total as number;

    const payRes = await request(app)
      .post("/api/v1/finance/payments")
      .set(F)
      .field("bookingId", chain.bookingId)
      .field("amount", invoiceTotal)
      .field("mode", "neft")
      .field("reference", "UTR-CAMP-1234")
      .field("paidOn", new Date().toISOString().slice(0, 10))
      .attach("file", PDF, { filename: "bank-rec.pdf", contentType: "application/pdf" });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.data.paymentId as string;

    const finance2 = await createStaff(app, cfg, "finance");
    const verifyPayRes = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/verify`)
      .set(bearer(finance2.token))
      .send({ decision: "verify" });
    expect(verifyPayRes.status).toBe(200);

    // Retrieve the campaign ID
    const woDetail = await request(app).get(`/api/v1/work-orders/${chain.woId}`).set(A);
    const campaignId = (await request(app).get(`/api/v1/bookings/${chain.bookingId}/proofs`).set(bearer(chain.client.token))).body.data.campaignId as string;
    expect(campaignId).toMatch(/^CMP-/);

    // 4. Fetch Client Campaign Report as JSON
    const reportRes = await request(app)
      .get(`/api/v1/reports/client-campaign/${campaignId}?format=json`)
      .set(bearer(chain.client.token));
    expect(reportRes.status).toBe(200);
    const rep = reportRes.body.data;

    // Compare numbers
    expect(rep.campaignId).toBe(campaignId);
    expect(rep.bookingId).toBe(chain.bookingId);
    expect(rep.spend.invoiced).toBe(invoiceTotal);
    expect(rep.spend.received).toBe(invoiceTotal);
    expect(rep.spend.balance).toBe(0);
    expect(rep.proofs.length).toBe(1);
    expect(rep.proofs[0].proofId).toBe(proofId);
    expect(rep.proofs[0].url).toContain("/api/v1/files/signed/");
    expect(rep.proofs[0].gpsLabel).toBeDefined();

    // 5. Test CSV and PDF formats
    const csvRes = await request(app)
      .get(`/api/v1/reports/client-campaign/${campaignId}?format=csv`)
      .set(bearer(chain.client.token));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.text).toContain("CAMPAIGN REPORT");
    expect(csvRes.text).toContain(campaignId);
    expect(csvRes.text).toContain(String(invoiceTotal));

    const pdfRes = await request(app)
      .get(`/api/v1/reports/client-campaign/${campaignId}?format=pdf`)
      .set(bearer(chain.client.token));
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");
    expect(pdfRes.body.slice(0, 4).toString()).toBe("%PDF");

    // 6. Security: Another client gets 404
    const otherClient = await registerClient(app);
    const forbiddenRes = await request(app)
      .get(`/api/v1/reports/client-campaign/${campaignId}?format=json`)
      .set(bearer(otherClient.token));
    expect(forbiddenRes.status).toBe(404);

    // 7. Security: Admin and Finance can access
    const adminRep = await request(app).get(`/api/v1/reports/client-campaign/${campaignId}`).set(A);
    expect(adminRep.status).toBe(200);
    const finRep = await request(app).get(`/api/v1/reports/client-campaign/${campaignId}`).set(F);
    expect(finRep.status).toBe(200);
  });

  it("A.1: logs every report, audit and reconciliation export in report_exports", async () => {
    const F = bearer(financeToken);
    const A = bearer(adminToken);

    // Check that previous CSV/PDF export from T-12 created log rows
    const logs = await ReportExport.find({ report: "client_campaign" }).lean();
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0]!.format).toMatch(/csv|pdf/);
    expect(logs[0]!._id).toMatch(/^EXP-/);

    // Check report exports query endpoint
    const exportListRes = await request(app)
      .get("/api/v1/reports/exports?report=client_campaign")
      .set(A);
    expect(exportListRes.status).toBe(200);
    expect(exportListRes.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("A.3: vendor performance report calculates metrics and respects vendor scoping", async () => {
    const A = bearer(adminToken);
    const vendor = await approvedVendor(app, adminToken);

    const res = await request(app).get(`/api/v1/reports/vendor-performance?vendorId=${vendor.vendorId}`).set(A);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].vendorId).toBe(vendor.vendorId);
    expect(data[0].proofTimelinessPct).toBeDefined();
    expect(data[0].woCompletionRatePct).toBeDefined();

    // Vendor sees own performance
    const vRes = await request(app).get("/api/v1/reports/vendor-performance").set(bearer(vendor.token));
    expect(vRes.status).toBe(200);
    expect(vRes.body.data[0].vendorId).toBe(vendor.vendorId);

    // A work order whose proof slots are all in the future must not count as late.
    await bookedWorkOrder(app, adminToken, vendor);
    const future = await request(app).get(`/api/v1/reports/vendor-performance?vendorId=${vendor.vendorId}`).set(A);
    expect(future.body.data[0].proofTimelinessPct).toBe(100);

    // CSV format
    const csvRes = await request(app).get(`/api/v1/reports/vendor-performance?format=csv`).set(A);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
  });

  it("A.4: funnel report reflects inquiry conversion counts by source", async () => {
    const A = bearer(adminToken);
    const res = await request(app).get("/api/v1/reports/funnel").set(A);
    expect(res.status).toBe(200);
    const f = res.body.data;
    expect(f.totalLeads).toBeGreaterThanOrEqual(1);
    expect(f.quotedLeads).toBeGreaterThanOrEqual(1);
    expect(f.wonLeads).toBeGreaterThanOrEqual(1);
    expect(f.conversion).toBeDefined();
    expect(f.bySource).toBeDefined();

    // CSV
    const csvRes = await request(app).get("/api/v1/reports/funnel?format=csv").set(A);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain("FUNNEL REPORT");
  });

  it("A.5: revenue report aggregates booking value, service fee, commission and verified receipts", async () => {
    const F = bearer(financeToken);
    const res = await request(app).get("/api/v1/reports/revenue").set(F);
    expect(res.status).toBe(200);
    const r = res.body.data;
    expect(r.bookingValue).toBeGreaterThan(0);
    expect(r.serviceFee).toBeGreaterThanOrEqual(0);
    expect(r.received).toBeGreaterThan(0);
    expect(r.byMonth).toBeDefined();
    expect(r.byCity).toBeDefined();

    // CSV
    const csvRes = await request(app).get("/api/v1/reports/revenue?format=csv").set(F);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain("REVENUE REPORT");
  });

  it("A.6: exceptions report surfaces operational bottlenecks", async () => {
    const A = bearer(adminToken);
    const res = await request(app).get("/api/v1/reports/exceptions").set(A);
    expect(res.status).toBe(200);
    const ex = res.body.data;
    expect(ex.counts).toBeDefined();
    expect(Array.isArray(ex.staleLeads)).toBe(true);
    expect(Array.isArray(ex.overdueProofs)).toBe(true);
    expect(Array.isArray(ex.unpaidInvoices)).toBe(true);

    // PDF export
    const pdfRes = await request(app).get("/api/v1/reports/exceptions?format=pdf").set(A);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");
  });

  it("A.7: audit search export (CSV/PDF) and logs export in report_exports", async () => {
    const A = bearer(adminToken);
    const csvRes = await request(app).get("/api/v1/audit-logs?format=csv").set(A);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.text).toContain("Timestamp");

    const pdfRes = await request(app).get("/api/v1/audit-logs?format=pdf").set(A);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");

    const exportDoc = await ReportExport.findOne({ report: "audit" }).lean();
    expect(exportDoc).toBeDefined();
    expect(exportDoc?.format).toMatch(/csv|pdf/);
  });

  it("A.8: notification templates CRUD and delivery logs for lifecycle events", async () => {
    const A = bearer(adminToken);

    // 1. Templates list includes seeded defaults
    const listRes = await request(app).get("/api/v1/admin/notification-templates").set(A);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(10);

    // 2. Create custom template
    const createRes = await request(app)
      .post("/api/v1/admin/notification-templates")
      .set(A)
      .send({
        event: "lead.created",
        channel: "sms",
        subject: "New Lead {{leadId}}",
        body: "Lead {{leadId}} created for {{requirement}}",
        active: true,
      });
    expect(createRes.status).toBe(201);
    const customTplId = createRes.body.data.templateId;

    // 3. Update template
    const updateRes = await request(app)
      .put(`/api/v1/admin/notification-templates/${customTplId}`)
      .set(A)
      .send({ body: "Updated lead text for {{leadId}}" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.body).toContain("Updated lead text");

    // 4. Check delivery records from previous actions (lead, booking, proof, payment)
    const deliveryRes = await request(app).get("/api/v1/notifications/delivery").set(A);
    expect(deliveryRes.status).toBe(200);
    expect(deliveryRes.body.data.items.length).toBeGreaterThan(0);

    const first = deliveryRes.body.data.items[0];
    expect(first.status).toBe("sent");
    expect(first.providerRef).toMatch(/^console_email_/);

    // Ensure no sensitive fields (e.g. password, bank) are in the recipient or template content
    const allNotifs = await Notification.find({}).lean();
    for (const n of allNotifs) {
      expect(n.error).toBeNull();
      expect(JSON.stringify(n)).not.toContain("password");
      expect(JSON.stringify(n)).not.toContain("Str0ng!");
    }
  });
});
