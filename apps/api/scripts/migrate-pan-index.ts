import { loadConfig } from "../src/config.js";
import { connectDb } from "../src/db.js";
import { Vendor } from "../src/models/foundation.js";

const cfg = loadConfig();
await connectDb(cfg.MONGODB_URI);

console.log("Checking vendor collection indexes...");
const indexes = await Vendor.collection.indexes();
const hasOldPan = indexes.some((idx) => idx.name === "pan_1");

if (hasOldPan) {
  console.log("Dropping old unique index pan_1...");
  await Vendor.collection.dropIndex("pan_1");
  console.log("Successfully dropped pan_1 index.");
} else {
  console.log("Old index pan_1 not found; no action needed.");
}

console.log("Syncing indexes on Vendor collection...");
await Vendor.syncIndexes();
console.log("Vendor indexes synchronized successfully.");
process.exit(0);
