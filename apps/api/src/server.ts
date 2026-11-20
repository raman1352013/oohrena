import { expireHolds } from "./services/availability.js";
import { loadConfig } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { SystemEvent } from "./models/foundation.js";

const cfg = loadConfig();
await connectDb(cfg.MONGODB_URI);
await SystemEvent.create({ type: "deploy", detail: { event: "api_start", env: cfg.NODE_ENV, version: process.env.npm_package_version ?? null } });

// Holds stop counting at expiresAt anyway; this sweep marks them Expired for status displays and the audit log.
setInterval(() => void expireHolds().catch((e) => console.error("hold expiry sweep failed", e)), 60_000).unref();

const app = createApp(cfg);
app.listen(cfg.PORT, () => console.log(`OOHRENA API listening on :${cfg.PORT} (${cfg.NODE_ENV})`));
