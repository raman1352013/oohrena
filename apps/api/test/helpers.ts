import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import type { Express } from "express";
import type { Role } from "@oohrena/shared";
import { loadConfig, type Config } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { nextId } from "../src/lib/ids.js";
import { User } from "../src/models/foundation.js";
import { hashPassword } from "../src/services/session.js";

export const ORIGIN = "http://localhost:8080";
export const GOOD_PW = "Str0ng!Passw0rd";

let rs: MongoMemoryReplSet | undefined;

export async function startTestDb() {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDb(rs.getUri("oohrena_test"));
}

export async function stopTestDb() {
  await disconnectDb();
  await rs?.stop();
}

export function testApp(overrides: Record<string, unknown> = {}): { app: Express; cfg: Config } {
  const cfg = loadConfig({
    NODE_ENV: "test",
    MONGODB_URI: "unused-in-tests",
    BCRYPT_COST: 4,
    CORS_ORIGINS: ORIGIN,
    AUTH_RATE_LIMIT_PER_MINUTE: 1000,
    ...overrides,
  });
  return { app: createApp(cfg), cfg };
}

let n = 0;
let panSeq = 1000;
let mobileSeq = 100000;
export const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** Unique 10-digit mobile per call. */
export const mobileFor = () => `+917${String(100000000 + (mobileSeq++ % 800000000))}`;

/** Unique valid PAN per call (5 letters + 4 digits + 1 letter). */
export const panFor = () => `ABCDE${String(1000 + (panSeq++ % 8999))}F`;

export const clientPayload = (o: Record<string, unknown> = {}) => ({
  fullName: "Ananya Test",
  email: `client-${uniq()}@example.test`,
  mobile: mobileFor(),
  password: GOOD_PW,
  companyName: "Test Capital Ltd",
  acceptTerms: true,
  ...o,
});

export const vendorPayload = (o: Record<string, unknown> = {}) => ({
  fullName: "Ram Test",
  email: `vendor-${uniq()}@example.test`,
  mobile: mobileFor(),
  password: GOOD_PW,
  legalName: "Test Media Pvt Ltd",
  categories: ["media_owner"],
  city: "Gwalior",
  acceptTerms: true,
  ...o,
});

/** Registers a client via the API and returns a bearer token. */
export async function registerClient(app: Express, o: Record<string, unknown> = {}) {
  const body = clientPayload(o);
  const res = await request(app).post("/api/v1/auth/register").set("x-auth-mode", "token").send(body);
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token as string, user: res.body.data.user, body };
}

/** Admin/Finance are never self-registered — create directly, then log in through the API. */
export async function createStaff(app: Express, cfg: Config, role: Role) {
  const email = `${role}-${uniq()}@example.test`;
  const userId = await nextId("USR");
  await User.create({ _id: userId, email, mobile: mobileFor(), fullName: `Test ${role}`, passwordHash: await hashPassword(cfg, GOOD_PW), role });
  const res = await request(app).post("/api/v1/auth/login").set("x-auth-mode", "token").send({ email, password: GOOD_PW });
  if (res.status !== 200) throw new Error(`staff login failed ${res.status}`);
  return { token: res.body.data.token as string, userId, email };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
