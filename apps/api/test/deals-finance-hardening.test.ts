import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvedVendor, bookedWorkOrder, dayPlus } from "./fixtures.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { arePhotosSimilar, computePerceptualHash, hammingDistance } from "../src/lib/phash.js";

describe("Section C: Deals, Quotes, Invoices, Credit Notes & Photo Similarity", () => {
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

  it("generates printable Quote PDF with client ownership and admin access", async () => {
    const vendor = await approvedVendor(app, adminToken);
    const { quoteId, client } = await bookedWorkOrder(app, adminToken, vendor);

    // 1. Client can download their own Quote PDF
    const clientPdf = await request(app)
      .get(`/api/v1/quotes/${quoteId}?format=pdf`)
      .set(bearer(client.token));
    expect(clientPdf.status).toBe(200);
    expect(clientPdf.headers["content-type"]).toBe("application/pdf");
    expect(clientPdf.body.slice(0, 4).toString()).toBe("%PDF");

    // 2. Admin can also download Quote PDF
    const adminPdf = await request(app)
      .get(`/api/v1/quotes/${quoteId}?format=pdf`)
      .set(bearer(adminToken));
    expect(adminPdf.status).toBe(200);
    expect(adminPdf.headers["content-type"]).toBe("application/pdf");

    // 3. Another client receives 404
    const otherClient = await registerClient(app);
    const foreignRes = await request(app)
      .get(`/api/v1/quotes/${quoteId}?format=pdf`)
      .set(bearer(otherClient.token));
    expect(foreignRes.status).toBe(404);
  });

  it("handles Tax Invoice PDF, SAC 998361, and Credit Note on cancellation", async () => {
    const vendor = await approvedVendor(app, adminToken);
    const { bookingId, client } = await bookedWorkOrder(app, adminToken, vendor, { from: dayPlus(25), to: dayPlus(55) });

    // 1. Raise tax invoice
    const invRes = await request(app)
      .post("/api/v1/finance/invoices")
      .set(bearer(financeToken))
      .send({ bookingId, advancePct: 50 });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.data.invoiceId as string;
    expect(invRes.body.data.sacCode).toBe("998361");
    expect(invoiceId.startsWith("TXI-")).toBe(true);

    // 2. Client and Finance download Tax Invoice PDF
    const invPdf = await request(app)
      .get(`/api/v1/finance/invoices/${invoiceId}?format=pdf`)
      .set(bearer(client.token));
    expect(invPdf.status).toBe(200);
    expect(invPdf.headers["content-type"]).toBe("application/pdf");
    expect(invPdf.body.slice(0, 4).toString()).toBe("%PDF");

    const finPdf = await request(app)
      .get(`/api/v1/finance/invoices/${invoiceId}?format=pdf`)
      .set(bearer(financeToken));
    expect(finPdf.status).toBe(200);

    // 3. Foreign client gets 404
    const otherClient = await registerClient(app);
    expect(
      (await request(app).get(`/api/v1/finance/invoices/${invoiceId}?format=pdf`).set(bearer(otherClient.token))).status
    ).toBe(404);

    // 4. Cancel booking after invoice exists -> Credit Note generated automatically
    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set(bearer(client.token))
      .send({ reason: "Campaign strategy reshuffle" });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe("cancelled");

    // 5. Verify Credit Note listed in Finance
    const cnList = await request(app)
      .get("/api/v1/finance/credit-notes")
      .set(bearer(financeToken));
    expect(cnList.status).toBe(200);
    const cn = cnList.body.data.find((x: any) => x.bookingId === bookingId);
    expect(cn).toBeDefined();
    expect(cn._id.startsWith("CRN-")).toBe(true);
    expect(cn.invoiceId).toBe(invoiceId);

    // 6. Download Credit Note PDF
    const cnPdf = await request(app)
      .get(`/api/v1/finance/credit-notes/${cn._id}?format=pdf`)
      .set(bearer(client.token));
    expect(cnPdf.status).toBe(200);
    expect(cnPdf.headers["content-type"]).toBe("application/pdf");
    expect(cnPdf.body.slice(0, 4).toString()).toBe("%PDF");

    // 7. Client credit notes list
    const clientCns = await request(app)
      .get("/api/v1/clients/me/credit-notes")
      .set(bearer(client.token));
    expect(clientCns.status).toBe(200);
    expect(clientCns.body.data.some((c: any) => c._id === cn._id)).toBe(true);
  });

  it("triggers periodic overdue proof notification job", async () => {
    const jobRes = await request(app)
      .post("/api/v1/admin/jobs/check-overdue-proofs")
      .set(bearer(adminToken));
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data).toHaveProperty("overdueSlotsFound");
    expect(jobRes.body.data).toHaveProperty("notificationsSent");
  });

  it("calculates perceptual photo hash and Hamming distance for visual similarity", () => {
    const bufA = Buffer.alloc(1024, 128);
    const bufB = Buffer.alloc(1024, 128);
    const bufC = Buffer.alloc(1024, 10);

    const hashA = computePerceptualHash(bufA);
    const hashB = computePerceptualHash(bufB);
    const hashC = computePerceptualHash(bufC);

    expect(hashA).toBeTruthy();
    expect(hashA).toBe(hashB);
    expect(hammingDistance(hashA!, hashB!)).toBe(0);
    expect(arePhotosSimilar(hashA!, hashB!)).toBe(true);

    // Different pattern
    for (let i = 0; i < 512; i++) bufC[i] = 250;
    const hashD = computePerceptualHash(bufC);
    expect(hammingDistance(hashA!, hashD!)).toBeGreaterThan(0);
  });
});
