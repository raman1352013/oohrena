import { existsSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { readUpload, saveUpload } from "../src/lib/storage.js";
import { StoredFile } from "../src/models/files.js";
import { PDF, png } from "./fixtures.js";
import { startTestDb, stopTestDb } from "./helpers.js";

describe("File storage — uploads survive redeploys when kept in MongoDB", () => {
  beforeAll(startTestDb);
  afterAll(stopTestDb);

  const base = { MONGODB_URI: "x" };
  const key = Buffer.alloc(32, 7).toString("base64");

  it("picks S3 when a bucket is set, MongoDB in staging/production, disk in development/test", () => {
    expect(loadConfig({ ...base, NODE_ENV: "test" }).fileStorage).toBe("disk");
    expect(loadConfig({ ...base, NODE_ENV: "staging", DATA_ENCRYPTION_KEY: key }).fileStorage).toBe("mongo");
    expect(loadConfig({ ...base, NODE_ENV: "staging", DATA_ENCRYPTION_KEY: key, S3_BUCKET: "b" }).fileStorage).toBe("s3");
    expect(loadConfig({ ...base, NODE_ENV: "test", FILE_STORAGE: "mongo" }).fileStorage).toBe("mongo");
    expect(() => loadConfig({ ...base, NODE_ENV: "test", FILE_STORAGE: "s3" })).toThrow(/S3_BUCKET/);
  });

  it("saves to GridFS (not the local disk), records the backend and reads the bytes back, encrypted at rest", async () => {
    const cfg = loadConfig({ ...base, NODE_ENV: "test", FILE_STORAGE: "mongo", UPLOAD_DIR: "./uploads-should-stay-empty" });
    const f = await saveUpload(cfg, PDF, {
      kind: "kyc_document", allowed: ["application/pdf"], maxBytes: 1024 * 1024, encryptAtRest: true, ownerUserId: "USR-T",
    });
    expect(f.storage).toBe("mongo");
    expect(existsSync(path.resolve(cfg.UPLOAD_DIR, f.storagePath))).toBe(false);

    const stored = await mongoose.connection.db!.collection("uploads.files").findOne({ filename: f.storagePath });
    expect(stored).not.toBeNull();

    const doc = await StoredFile.findById(f._id).lean();
    expect(Buffer.compare(await readUpload(cfg, doc!), PDF)).toBe(0);
  });

  it("still reads an older file from the backend it was saved to after FILE_STORAGE changes", async () => {
    const mongoCfg = loadConfig({ ...base, NODE_ENV: "test", FILE_STORAGE: "mongo" });
    const photo = png(1);
    const f = await saveUpload(mongoCfg, photo, {
      kind: "inventory_photo", allowed: ["image/png"], maxBytes: 1024 * 1024, encryptAtRest: false, ownerUserId: "USR-T",
    });
    const diskCfg = loadConfig({ ...base, NODE_ENV: "test" });
    const doc = await StoredFile.findById(f._id).lean();
    expect(Buffer.compare(await readUpload(diskCfg, doc!), photo)).toBe(0);
  });
});
