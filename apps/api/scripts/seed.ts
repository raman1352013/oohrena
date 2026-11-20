/**
 * Seeds one named test account per role on a NON-production database.
 * Password comes from SEED_PASSWORD (must pass the password policy) — never hard-coded.
 */
import { password as passwordPolicy } from "@oohrena/shared";
import { loadConfig } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { seedTestAccounts } from "../src/seed-accounts.js";

const cfg = loadConfig();
const pw = passwordPolicy.safeParse(process.env.SEED_PASSWORD ?? "");
if (!pw.success) throw new Error("Set SEED_PASSWORD in apps/api/.env (10+ chars, upper, lower, digit, symbol)");

await connectDb(cfg.MONGODB_URI);
await seedTestAccounts(cfg, pw.data);
await disconnectDb();
console.log("Seed complete. All accounts use SEED_PASSWORD.");
