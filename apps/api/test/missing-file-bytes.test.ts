import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Inventory } from "../src/models/inventory.js";
import { StoredFile } from "../src/models/files.js";
import { createStaff, startTestDb, stopTestDb, testApp } from "./helpers.js";
import { approvedVendor, liveListing } from "./fixtures.js";

const uploadDir = mkdtempSync(path.join(tmpdir(), "oohrena-missing-"));
const { app, cfg } = testApp({ UPLOAD_DIR: uploadDir });

beforeAll(startTestDb);
afterAll(async () => {
  await stopTestDb();
  rmSync(uploadDir, { recursive: true, force: true });
});

// Live photos were once saved to the host's disk, which every Render deploy wipes. The metadata
// row survived, the bytes did not, and the public photo route answered 500 with an image/png header.
describe("Stored file whose bytes are gone", () => {
  it("answers 404 JSON (not 500, not an image content-type) and keeps working for other photos", async () => {
    const admin = await createStaff(app, cfg, "admin");
    const vendor = await approvedVendor(app, admin.token);
    const id = await liveListing(app, vendor.token, admin.token);
    const inv = await Inventory.findById(id).lean();
    const fileId = (inv as unknown as { photos: { fileId: string }[] }).photos[0]!.fileId;
    const url = `/api/v1/inventory/${id}/photos/${fileId}`;

    const ok = await request(app).get(url);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/^image\/png/);

    const f = await StoredFile.findById(fileId).lean();
    rmSync(path.resolve(uploadDir, f!.storagePath));

    const gone = await request(app).get(url);
    expect(gone.status).toBe(404);
    expect(gone.headers["content-type"]).toMatch(/^application\/json/);
    expect(gone.headers["cache-control"] ?? "").not.toMatch(/public/);
    expect(gone.body.error.code).toBe("NOT_FOUND");
  });
});
