import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  bearer,
  createStaff,
  panFor,
  registerClient,
  startTestDb,
  stopTestDb,
  testApp,
  uniq,
  vendorPayload,
} from "./helpers.js";
import { Vendor } from "../src/models/foundation.js";
import { VendorDocument } from "../src/models/vendor-kyc.js";
import { AuditLog } from "../src/models/audit-log.js";

describe("T3 — Vendor Onboarding Wizard API", () => {
  let app: ReturnType<typeof testApp>["app"];
  let adminToken: string;
  let clientToken: string;
  let vendor1Token: string;
  let vendor1Id: string;
  let vendor2Token: string;
  let vendor2Id: string;
  let managerToken: string;

  const pan1 = panFor();
  const pan2 = panFor();

  const businessPayload = (pan = pan1) => ({
    legalName: "Apex Media Pvt Ltd",
    tradeName: "Apex Media",
    designation: "Managing Director",
    whatsapp: "+919876543210",
    website: "https://apexmedia.test",
    officeAddress: {
      line1: "Plot 10, Zone 2",
      line2: "City Centre",
      city: "Gwalior",
      district: "Gwalior",
      stateCode: "MP",
      pin: "474011",
    },
    businessType: "pvt_ltd",
    yearEstablished: 2015,
    pan,
    language: "english",
  });

  const categoryPayload = () => ({
    categories: ["media_owner", "execution_partner"],
  });

  const territoryPayload = () => ({
    primaryCity: "Gwalior",
    primaryDistrict: "Gwalior",
    stateCode: "MP",
    otherCities: ["Bhopal", "Indore"],
    statesServed: ["MP", "UP"],
    networkSize: 50,
    approxSites: 120,
    outsideCity: true,
    responseTimeH: 24,
  });

  const executionPayload = () => ({
    services: ["printing", "mounting", "gps_proof"],
    subcontractedServices: [],
    teamSize: 15,
    citiesCovered: ["Gwalior", "Bhopal"],
    dailyCapacity: 25,
    emergencyResponseH: 6,
    equipment: "Large format UV flatbed and roll printers",
    usesSubcontractors: false,
    executionContact: {
      name: "Ramesh Sharma",
      mobile: "+919876543211",
    },
  });

  const slaPayload = () => ({
    updateFrequency: "daily",
    blackoutDates: [],
    canHold: true,
    maxHoldH: 48,
    proofWithinSla: true,
    proofTimeH: 24,
  });

  const bankPayload = () => ({
    accountName: "Apex Media Pvt Ltd",
    accountNo: "12345678901234",
    ifsc: "HDFC0001234",
    bankName: "HDFC Bank",
  });

  const declarationPayload = (overrides = {}) => ({
    accepted: {
      infoTrue: true,
      ownershipDisclosed: true,
      permissions: true,
      promptUpdates: true,
      noFalseAvailability: true,
      assetReviewSeparate: true,
      contactConsent: true,
      noBookingUntilConfirmed: true,
      policies: true,
      ...overrides,
    },
    signatoryName: "Ram Kumar",
    designation: "Director",
    place: "Gwalior",
  });

  beforeAll(async () => {
    await startTestDb();
    const t = testApp();
    app = t.app;

    const admin = await createStaff(app, t.cfg, "admin");
    adminToken = admin.token;

    const client = await registerClient(app);
    clientToken = client.token;

    // Register Vendor 1
    const v1Res = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ legalName: "Apex Media Pvt Ltd" }));
    expect(v1Res.status).toBe(201);
    vendor1Token = v1Res.body.data.token;
    vendor1Id = v1Res.body.data.vendorId;

    // Register Vendor 2
    const v2Res = await request(app)
      .post("/api/v1/vendors/register")
      .set("x-auth-mode", "token")
      .send(vendorPayload({ legalName: "Bharat Signs Ltd", email: `bharat-${uniq()}@example.test` }));
    expect(v2Res.status).toBe(201);
    vendor2Token = v2Res.body.data.token;
    vendor2Id = v2Res.body.data.vendorId;

    // Vendor 1 invites Manager
    const mgrRes = await request(app)
      .post("/api/v1/vendors/me/team/invite")
      .set(bearer(vendor1Token))
      .send({
        fullName: "Ops Manager",
        email: `ops-${uniq()}@example.test`,
        mobile: "+919876543299",
        role: "manager",
      });
    expect(mgrRes.status).toBe(201);
    const mgrLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("x-auth-mode", "token")
      .send({ email: mgrRes.body.data.email, password: mgrRes.body.data.tempPassword });
    expect(mgrLogin.status).toBe(200);
    managerToken = mgrLogin.body.data.token;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("GET /vendors/me/onboarding returns initial wizard state", async () => {
    const res = await request(app)
      .get("/api/v1/vendors/me/onboarding")
      .set(bearer(vendor1Token));

    expect(res.status).toBe(200);
    expect(res.body.data.submittedAt).toBeNull();
    expect(res.body.data.steps).toEqual({
      business: false,
      category: false,
      territory: false,
      execution: false,
      sla: false,
      documents: false,
      bank: false,
      declaration: false,
    });
  });

  it("client role is rejected with 403 on /vendors/me/onboarding", async () => {
    const res = await request(app)
      .get("/api/v1/vendors/me/onboarding")
      .set(bearer(clientToken));
    expect(res.status).toBe(403);
  });

  it("rejects unknown step with 404", async () => {
    const res = await request(app)
      .patch("/api/v1/vendors/me/onboarding/unknown_step")
      .set(bearer(vendor1Token))
      .send({});
    expect(res.status).toBe(404);
  });

  it("rejects unknown fields in step payload with 400 (.strict())", async () => {
    const res = await request(app)
      .patch("/api/v1/vendors/me/onboarding/business")
      .set(bearer(vendor1Token))
      .send({
        ...businessPayload(),
        unknownField: "hack",
      });
    expect(res.status).toBe(400);
  });

  it("manager can save steps (business, category, territory, execution, sla)", async () => {
    // Business step by manager
    const bRes = await request(app)
      .patch("/api/v1/vendors/me/onboarding/business")
      .set(bearer(managerToken))
      .send(businessPayload(pan1));
    expect(bRes.status).toBe(200);
    expect(bRes.body.data.step).toBe("business");

    // Vendor model updated with PAN and legalName
    const v = await Vendor.findById(vendor1Id).lean();
    expect(v?.pan).toBe(pan1);
    expect(v?.legalName).toBe("Apex Media Pvt Ltd");

    // Audit log masks PAN as ******1234
    const auditLog = await AuditLog.findOne({
      entityId: vendor1Id,
      action: "vendor.onboarding.save",
    }).sort({ at: -1 }).lean();
    expect(auditLog).toBeDefined();
    expect(auditLog?.after?.pan).toBe(`******${pan1.slice(-4)}`);

    // Category step
    const cRes = await request(app)
      .patch("/api/v1/vendors/me/onboarding/category")
      .set(bearer(managerToken))
      .send(categoryPayload());
    expect(cRes.status).toBe(200);

    // Territory step
    const tRes = await request(app)
      .patch("/api/v1/vendors/me/onboarding/territory")
      .set(bearer(managerToken))
      .send(territoryPayload());
    expect(tRes.status).toBe(200);

    // Execution step
    const eRes = await request(app)
      .patch("/api/v1/vendors/me/onboarding/execution")
      .set(bearer(managerToken))
      .send(executionPayload());
    expect(eRes.status).toBe(200);

    // SLA step
    const sRes = await request(app)
      .patch("/api/v1/vendors/me/onboarding/sla")
      .set(bearer(managerToken))
      .send(slaPayload());
    expect(sRes.status).toBe(200);

    // Verify onboarding state reflection
    const state = await request(app)
      .get("/api/v1/vendors/me/onboarding")
      .set(bearer(vendor1Token));
    expect(state.status).toBe(200);
    expect(state.body.data.steps.business).toBe(true);
    expect(state.body.data.steps.category).toBe(true);
    expect(state.body.data.steps.territory).toBe(true);
    expect(state.body.data.steps.execution).toBe(true);
    expect(state.body.data.steps.sla).toBe(true);
    expect(state.body.data.steps.documents).toBe(false);
    expect(state.body.data.steps.bank).toBe(false);
  });

  it("duplicate PAN on business step returns 409 DUPLICATE_PAN", async () => {
    // Vendor 2 tries to use PAN 1
    const res = await request(app)
      .patch("/api/v1/vendors/me/onboarding/business")
      .set(bearer(vendor2Token))
      .send(businessPayload(pan1));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_PAN");
  });

  it("vendor 2 cannot see vendor 1's onboarding state (isolation)", async () => {
    const res = await request(app)
      .get("/api/v1/vendors/me/onboarding")
      .set(bearer(vendor2Token));
    expect(res.status).toBe(200);
    expect(res.body.data.steps.business).toBe(false);
    expect(res.body.data.data.business).toBeUndefined();
  });

  it("submitting with missing steps fails with 400 listing missing steps", async () => {
    // Missing documents and bank
    const res = await request(app)
      .post("/api/v1/vendors/me/onboarding/submit")
      .set(bearer(vendor1Token))
      .send(declarationPayload());

    expect(res.status).toBe(400);
    expect(res.body.error.details.missingSteps).toContain("documents");
    expect(res.body.error.details.missingSteps).toContain("bank");
  });

  it("declaration with a false flag fails with 400", async () => {
    const res = await request(app)
      .post("/api/v1/vendors/me/onboarding/submit")
      .set(bearer(vendor1Token))
      .send(declarationPayload({ infoTrue: false }));

    expect(res.status).toBe(400);
  });

  it("manager cannot submit onboarding (owner-only, returns 403)", async () => {
    const res = await request(app)
      .post("/api/v1/vendors/me/onboarding/submit")
      .set(bearer(managerToken))
      .send(declarationPayload());

    expect(res.status).toBe(403);
  });

  it("owner completes documents and bank, then submits successfully", async () => {
    // Add PAN document
    await VendorDocument.create({
      vendorId: vendor1Id,
      type: "pan",
      fileId: "PAN_FILE_001",
      uploadedBy: "USR_TEST",
      status: "uploaded",
    });

    // Add Bank
    const bankRes = await request(app)
      .put("/api/v1/vendors/me/bank")
      .set(bearer(vendor1Token))
      .send(bankPayload());
    expect(bankRes.status).toBe(200);

    // State now reflects documents and bank true
    const preState = await request(app)
      .get("/api/v1/vendors/me/onboarding")
      .set(bearer(vendor1Token));
    expect(preState.body.data.steps.documents).toBe(true);
    expect(preState.body.data.steps.bank).toBe(true);

    // Submit declaration
    const subRes = await request(app)
      .post("/api/v1/vendors/me/onboarding/submit")
      .set(bearer(vendor1Token))
      .send(declarationPayload());

    expect(subRes.status).toBe(200);
    expect(subRes.body.data.submittedAt).toBeDefined();
    expect(subRes.body.data.reward).toBeNull();

    // Verify vendor state
    const v = await Vendor.findById(vendor1Id).lean();
    expect(v?.onboarding?.submittedAt).toBeDefined();
    expect(v?.declaration?.version).toBe("2026-11");
    expect(v?.declaration?.signatoryName).toBe("Ram Kumar");
  });

  it("saving any step after submission returns 409 INVALID_TRANSITION", async () => {
    const res = await request(app)
      .patch("/api/v1/vendors/me/onboarding/business")
      .set(bearer(vendor1Token))
      .send(businessPayload(pan1));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("admin GET /api/v1/admin/vendors/:id returns onboarding details with masked PAN", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/vendors/${vendor1Id}`)
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.onboarding?.submittedAt).toBeDefined();
    expect(data.business?.pan).toMatch(/^[A-Z]{2}X{5}/);
    expect(data.category?.categories).toContain("media_owner");
    expect(data.declaration?.signatoryName).toBe("Ram Kumar");
  });
});
