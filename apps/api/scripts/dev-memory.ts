import { expireHolds } from "../src/services/availability.js";
/**
 * Local development without MongoDB/Atlas: starts an in-memory replica set, seeds the
 * test accounts (password = SEED_PASSWORD from .env) and runs the API.
 * All data is lost when this process stops. Never use for staging/production.
 */
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { password as passwordPolicy } from "@oohrena/shared";
import { loadConfig } from "../src/config.js";
import { connectDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { seedTestAccounts } from "../src/seed-accounts.js";

process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL("../../../node_modules/.cache/mongodb-memory-server", import.meta.url));

const pw = passwordPolicy.safeParse(process.env.SEED_PASSWORD ?? "");
if (!pw.success) throw new Error("Set SEED_PASSWORD in apps/api/.env (10+ chars, upper, lower, digit, symbol)");

const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const cfg = loadConfig({ NODE_ENV: "development", MONGODB_URI: rs.getUri("oohrena_dev") });
await connectDb(cfg.MONGODB_URI);
await seedTestAccounts(cfg, pw.data);

// Holds stop counting at expiresAt anyway; this sweep marks them Expired for status displays and the audit log.
setInterval(() => void expireHolds().catch((e) => console.error("hold expiry sweep failed", e)), 60_000).unref();

const server = createApp(cfg).listen(cfg.PORT, () =>
  console.log(`OOHRENA API (in-memory MongoDB, data resets on restart) listening on :${cfg.PORT}`),
);
const stop = async () => {
  server.close();
  await rs.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
