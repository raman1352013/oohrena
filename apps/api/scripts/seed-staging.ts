/**
 * Seeds a staging / demo database (MONGODB_URI from apps/api/.env) with the test accounts and the
 * full demo chain (see demo-flow.ts). The chain is created through the real API, served in-process on
 * 127.0.0.1 for the duration of this script, so every record is valid, audited and correctly numbered.
 *
 *   npm run seed:staging -w @oohrena/api
 *
 * Refuses to run when NODE_ENV=production, and skips the chain if Vendor A already has listings
 * (so running it twice does not duplicate data).
 */
import type { AddressInfo } from "node:net";
import { password as passwordPolicy } from "@oohrena/shared";
import { loadConfig } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { seedTestAccounts } from "../src/seed-accounts.js";
import { Vendor } from "../src/models/foundation.js";
import { Inventory } from "../src/models/inventory.js";
import { runDemoFlow } from "./demo-flow.js";

// Seeding-only, in-process instance: 2FA for the seeded staff and the login rate limit would block a
// scripted run. This never affects the deployed API, which reads its own environment.
const cfg = loadConfig({ REQUIRE_2FA_PRIVILEGED: false, AUTH_RATE_LIMIT_PER_MINUTE: 1000 });
if (cfg.NODE_ENV === "production") {
  console.error("FATAL: Refusing to seed staging data into a production environment.");
  process.exit(1);
}

const pw = passwordPolicy.safeParse(process.env.SEED_PASSWORD ?? "");
if (!pw.success) throw new Error("Set SEED_PASSWORD in apps/api/.env (10+ chars, upper, lower, digit, symbol)");

await connectDb(cfg.MONGODB_URI);
console.log("Connected. Seeding test accounts...");
await seedTestAccounts(cfg, pw.data);

const vendorA = await Vendor.findOne({ pan: "ABCDE1001F" }).lean();
if (!vendorA) throw new Error("Vendor A missing after seeding accounts");

if (await Inventory.exists({ vendorId: vendorA._id })) {
  console.log("Vendor A already has listings — demo chain already seeded, skipping.");
} else {
  const server = createApp(cfg).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await runDemoFlow(`http://127.0.0.1:${port}`, pw.data);
  } finally {
    server.close();
  }
}

console.log("Staging dataset ready.");
await disconnectDb();
process.exit(0);
