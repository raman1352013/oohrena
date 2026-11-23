/**
 * Creates every collection and index the API models declare, in MONGODB_URI (apps/api/.env).
 * Run after a fresh/reset database: MongoDB can't create collections inside some transactions,
 * so a running API on an empty database fails until they exist (or until it restarts).
 *
 *   npx tsx scripts/ensure-indexes.ts
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI");
const dir = fileURLToPath(new URL("../src/models/", import.meta.url));
for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) await import(pathToFileURL(dir + f).href);

await mongoose.connect(uri);
for (const name of mongoose.modelNames()) {
  const m = mongoose.model(name);
  await m.createCollection().catch(() => undefined);
  await m.syncIndexes();
}
console.log(`Collections and indexes ready for ${mongoose.modelNames().length} models in "${mongoose.connection.db!.databaseName}".`);
await mongoose.disconnect();
