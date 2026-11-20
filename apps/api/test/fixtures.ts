import request from "supertest";
import { expect } from "vitest";
import type { Express } from "express";
import { bearer, vendorPayload } from "./helpers.js";

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
export const png = (n: number) => Buffer.concat([PNG, Buffer.from(`#${n}`)]);

/** Registers a vendor, uploads PAN and has Admin approve KYC. */
export async function approvedVendor(app: Express, adminToken: string) {
  const res = await request(app).post("/api/v1/vendors/register").set("x-auth-mode", "token").send(vendorPayload());
  expect(res.status).toBe(201);
  const v = { token: res.body.data.token as string, vendorId: res.body.data.vendorId as string };
  await request(app).post("/api/v1/vendors/me/documents").set(bearer(v.token)).field("type", "pan").attach("file", PDF, { filename: "pan.pdf", contentType: "application/pdf" });
  expect((await request(app).post(`/api/v1/admin/vendors/${v.vendorId}/kyc-decision`).set(bearer(adminToken)).send({ decision: "approve" })).status).toBe(200);
  return v;
}

let seq = 0;
export const listingBody = (o: Record<string, unknown> = {}) => ({
  category: "hoarding", title: `Fixture Hoarding ${++seq}`, city: "Gwalior", locality: "Phoolbagh", landmark: "Near Phoolbagh Chowk",
  address: "Phoolbagh Road", pin: "474001", lat: 26.2 + seq * 0.001, lng: 78.17 + seq * 0.001, rate: 40000, pricingUnit: "per_month", quantity: 1,
  attributes: { widthFt: 40, heightFt: 20 }, ...o,
});

/** Creates, photographs, submits and approves a listing; returns its Inventory ID. */
export async function liveListing(app: Express, vendorToken: string, adminToken: string, o: Record<string, unknown> = {}, price = 50000) {
  const c = await request(app).post("/api/v1/vendors/me/inventory").set(bearer(vendorToken)).send(listingBody(o));
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  const id = c.body.data.inventoryId as string;
  expect((await request(app).post(`/api/v1/vendors/me/inventory/${id}/photos`).set(bearer(vendorToken)).attach("photos", png(Math.random()), { filename: "s.png", contentType: "image/png" })).status).toBe(201);
  expect((await request(app).post(`/api/v1/vendors/me/inventory/${id}/submit`).set(bearer(vendorToken))).status).toBe(200);
  const d = await request(app).post(`/api/v1/admin/inventory/${id}/decision`).set(bearer(adminToken)).send({ decision: "approve", indicativePrice: price });
  expect(d.status, JSON.stringify(d.body)).toBe(200);
  return id;
}

/** Calendar date N days from today (UTC-based; tests only need "comfortably in the future"). */
export const dayPlus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Runs the full chain: listing → client inquiry → review/assign → quote → release → client approval → booking → work order. */
export async function bookedWorkOrder(app: Express, adminToken: string, vendor: { token: string; vendorId: string }, o: { from?: string; to?: string } = {}) {
  const { registerClient } = await import("./helpers.js");
  const A = bearer(adminToken);
  const inv = await liveListing(app, vendor.token, adminToken);
  await request(app).patch(`/api/v1/vendors/me/inventory/${inv}/availability-mode`).set(bearer(vendor.token)).send({ mode: "managed" });
  const client = await registerClient(app);
  const from = o.from ?? dayPlus(10);
  const to = o.to ?? dayPlus(39);
  const leadId = (await request(app).post("/api/v1/leads").set(bearer(client.token)).send({ inventoryIds: [inv], from, to, requirement: "Campaign for execution tests" })).body.data.leadId;
  await request(app).post(`/api/v1/admin/leads/${leadId}/status`).set(A).send({ status: "under_review" });
  await request(app).post(`/api/v1/admin/leads/${leadId}/assign`).set(A).send({ vendorId: vendor.vendorId });
  const quoteId = (await request(app).post("/api/v1/admin/quotes").set(A).send({ leadId, items: [{ inventoryId: inv, from, to, production: 1000, installation: 1000 }] })).body.data.quoteId;
  await request(app).post(`/api/v1/admin/quotes/${quoteId}/approve`).set(A);
  await request(app).post(`/api/v1/quotes/${quoteId}/decision`).set(bearer(client.token)).send({ decision: "approve" });
  const bookingId = (await request(app).post("/api/v1/admin/bookings").set(A).send({ quoteId })).body.data.bookingId as string;
  const wo = await request(app).post(`/api/v1/admin/bookings/${bookingId}/work-order`).set(A).send({ instructions: "Mount and upload proof" });
  expect(wo.status, JSON.stringify(wo.body)).toBe(201);
  return { inv, client, leadId, quoteId, bookingId, woId: wo.body.data[0].workOrderId as string, from, to };
}
