import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { User, Vendor } from "../src/models/foundation.js";
import {
  bearer,
  clientPayload,
  createStaff,
  mobileFor,
  panFor,
  registerClient,
  startTestDb,
  stopTestDb,
  testApp,
  uniq,
  vendorPayload,
} from "./helpers.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

describe("T2: Quick vendor sign-up & referral code capture", () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("vendor sign-up succeeds without PAN, categories stored, user receives referralCode", async () => {
    const { app } = testApp();
    const payload = vendorPayload({
      categories: ["media_owner", "aggregator"],
    });
    // Ensure no PAN in payload
    delete (payload as any).pan;

    const res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toMatch(/^VND-\d+/);
    expect(res.body.data.kycStatus).toBe("pending");

    const vendor = await Vendor.findById(res.body.data.vendorId).lean();
    expect(vendor).not.toBeNull();
    expect(vendor!.pan).toBeNull();
    expect(vendor!.categories).toEqual(["media_owner", "aggregator"]);

    const user = await User.findById(vendor!.userId).lean();
    expect(user).not.toBeNull();
    expect(user!.referralCode).toMatch(/^OOH-[A-Z0-9]{6}$/);
    expect(user!.referredByCode).toBeNull();
  });

  it("multiple vendors without PAN can register (partial unique index allows nulls)", async () => {
    const { app } = testApp();
    const v1 = vendorPayload();
    delete (v1 as any).pan;
    const v2 = vendorPayload();
    delete (v2 as any).pan;

    const res1 = await request(app).post("/api/v1/vendors/register").send(v1);
    const res2 = await request(app).post("/api/v1/vendors/register").send(v2);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it("duplicate PAN is rejected when set on two vendors", async () => {
    const pan = panFor();
    const v1 = await Vendor.create({
      _id: `VND-T2-${uniq()}`,
      userId: `USR-T2-${uniq()}`,
      legalName: "Vendor 1",
      pan,
      city: "Gwalior",
      kycStatus: "pending",
    });
    expect(v1).toBeDefined();

    await expect(
      Vendor.create({
        _id: `VND-T2-${uniq()}`,
        userId: `USR-T2-${uniq()}`,
        legalName: "Vendor 2",
        pan,
        city: "Indore",
        kycStatus: "pending",
      }),
    ).rejects.toThrow();
  });

  it("client sign-up generates referralCode and stores referredByCode when valid ref provided", async () => {
    const { app } = testApp();

    // Register User 1 (referrer)
    const client1 = await registerClient(app);
    const user1 = await User.findById(client1.user.userId).lean();
    expect(user1!.referralCode).toMatch(/^OOH-[A-Z0-9]{6}$/);

    // Register User 2 with User 1's referral code
    const client2Payload = clientPayload({ ref: user1!.referralCode });
    const res2 = await request(app).post("/api/v1/auth/register").set("x-auth-mode", "token").send(client2Payload);
    expect(res2.status).toBe(201);

    const user2 = await User.findById(res2.body.data.user.userId).lean();
    expect(user2!.referredByCode).toBe(user1!.referralCode);
    expect(user2!.referralCode).toMatch(/^OOH-[A-Z0-9]{6}$/);
    expect(user2!.referralCode).not.toBe(user1!.referralCode);
  });

  it("unknown referral code is silently ignored without failing sign-up", async () => {
    const { app } = testApp();
    const payload = clientPayload({ ref: "OOH-999999" });

    const res = await request(app).post("/api/v1/auth/register").set("x-auth-mode", "token").send(payload);
    expect(res.status).toBe(201);

    const user = await User.findById(res.body.data.user.userId).lean();
    expect(user!.referredByCode).toBeNull();
  });

  it("staff members do not receive referral codes", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");
    const user = await User.findById(admin.userId).lean();
    expect(user!.referralCode).toBeUndefined();
  });

  it("approving vendor KYC fails with 400 when PAN is missing; succeeds when PAN is added", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");

    const vRes = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
    expect(vRes.status).toBe(201);
    const { token, vendorId } = vRes.body.data;

    // Upload required PAN document
    await request(app)
      .post("/api/v1/vendors/me/documents")
      .set(bearer(token))
      .field("type", "pan")
      .attach("file", PDF, { filename: "pan.pdf", contentType: "application/pdf" });

    // Attempt approval while Vendor.pan is null -> 400
    const failRes = await request(app)
      .post(`/api/v1/admin/vendors/${vendorId}/kyc-decision`)
      .set(bearer(admin.token))
      .send({ decision: "approve" });
    expect(failRes.status).toBe(400);
    expect(failRes.body.error.message).toContain("PAN");

    // Add PAN to vendor
    await Vendor.updateOne({ _id: vendorId }, { $set: { pan: panFor() } });

    // Attempt approval again -> 200
    const okRes = await request(app)
      .post(`/api/v1/admin/vendors/${vendorId}/kyc-decision`)
      .set(bearer(admin.token))
      .send({ decision: "approve" });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.kycStatus).toBe("approved");
  });
});
