/**
 * Creates a named Admin or Finance/Audit account (works in production — this is how the first admin is made).
 * Usage (PowerShell):
 *   $env:STAFF_PASSWORD = "<strong password>"; npm run create-staff -w @oohrena/api -- --role admin --email ops@company.com --name "Full Name" --mobile +919800000000
 * The password is read from STAFF_PASSWORD (never from the command line, so it stays out of shell history) and must pass the password policy.
 * Accounts are always named — never create shared logins.
 */
import { parseArgs } from "node:util";
import { email as emailSchema, mobile as mobileSchema, password as passwordPolicy } from "@oohrena/shared";
import { loadConfig } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { audit } from "../src/lib/audit.js";
import { nextId } from "../src/lib/ids.js";
import { User } from "../src/models/foundation.js";
import { hashPassword } from "../src/services/session.js";

const { values } = parseArgs({ options: { role: { type: "string" }, email: { type: "string" }, name: { type: "string" }, mobile: { type: "string" } } });
const role = values.role;
if (role !== "admin" && role !== "finance") throw new Error("--role must be admin or finance");
const email = emailSchema.parse(values.email);
const mobile = mobileSchema.parse(values.mobile);
const fullName = (values.name ?? "").trim();
if (fullName.length < 2) throw new Error("--name is required (named accounts only)");
const pw = passwordPolicy.safeParse(process.env.STAFF_PASSWORD ?? "");
if (!pw.success) throw new Error("Set STAFF_PASSWORD (10+ chars with upper, lower, digit and symbol)");

const cfg = loadConfig();
await connectDb(cfg.MONGODB_URI);
if (await User.exists({ email })) throw new Error(`A user with ${email} already exists`);
const userId = await nextId("USR");
await User.create({ _id: userId, email, mobile, fullName, passwordHash: await hashPassword(cfg, pw.data), role, createdBy: "create-staff-script", emailVerifiedAt: new Date() });
await audit(null, { action: "user.create.staff", entity: "user", entityId: userId, after: { role, email }, userId: null, role: "system" });
await disconnectDb();
console.log(`Created ${role} ${email} (${userId}). Ask them to sign in and change the password.`);
