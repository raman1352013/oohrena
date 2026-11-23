/**
 * Drops the database in MONGODB_URI (apps/api/.env) so the demo can be seeded fresh.
 * Only for staging/demo databases: refuses NODE_ENV=production and needs CONFIRM_RESET=<database name>.
 *
 *   $env:CONFIRM_RESET="<db name>"; npx tsx scripts/reset-demo-db.ts
 *
 * Afterwards: `npm run seed:api` (accounts) and `npm run seed:demo -w @oohrena/api` with API_URL.
 */
import "dotenv/config";
import mongoose from "mongoose";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI");

await mongoose.connect(uri);
const db = mongoose.connection.db!;
const name = db.databaseName;
const collections = (await db.listCollections().toArray()).map((c) => c.name);
const users = collections.includes("users") ? await db.collection("users").countDocuments() : 0;
console.log(`Database "${name}": ${collections.length} collections, ${users} users`);
if (process.env.CONFIRM_RESET !== name) {
  console.log(`Not dropped. Re-run with CONFIRM_RESET=${name} to drop it.`);
} else {
  await db.dropDatabase();
  console.log(`Dropped "${name}".`);
}
await mongoose.disconnect();
