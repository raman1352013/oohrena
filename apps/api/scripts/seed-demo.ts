/**
 * Fills a RUNNING API with the demo chain (see demo-flow.ts):
 *   vendor listings → admin approval → client inquiry → review/assign → quote → client approval
 *   → booking → work order → invoice → payment (admin records, finance verifies)
 *   + one fresh inquiry left in the admin inbox.
 *
 * Needs the seeded test accounts (run `npm run dev:api:memory`, or `npm run seed:api` first).
 *   API_URL=http://localhost:4000 npm run seed:demo -w @oohrena/api
 * Password = SEED_PASSWORD from apps/api/.env. Never point this at production.
 */
import "dotenv/config";
import { runDemoFlow } from "./demo-flow.js";

const PW = process.env.SEED_PASSWORD;
if (!PW) throw new Error("Set SEED_PASSWORD in apps/api/.env");
await runDemoFlow(process.env.API_URL ?? "http://localhost:4000", PW);
