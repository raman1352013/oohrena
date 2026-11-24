import { registerDefaultJobs, startJobRunner } from "./services/job-runner.js";
import { initSettings } from "./services/settings.js";
import { loadConfig } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { SystemEvent } from "./models/foundation.js";
import { logger } from "./lib/logger.js";
import { configureNotifications } from "./services/notifications.js";

const cfg = loadConfig();
configureNotifications(cfg);
if (cfg.NODE_ENV !== "development" && !cfg.S3_BUCKET) logger.warn("S3_BUCKET is not set: uploads go to the local disk, which is lost on redeploy on most hosts");
if (!cfg.SMTP_URL) logger.warn("SMTP_URL is not set: password reset, invite and verification emails are NOT delivered");
await connectDb(cfg.MONGODB_URI);
await initSettings();
await SystemEvent.create({ type: "deploy", detail: { event: "api_start", env: cfg.NODE_ENV, version: process.env.npm_package_version ?? null } });

// Start distributed background job runner (hold release, reverify reminders, permit checks, etc.)
registerDefaultJobs();
startJobRunner();

const app = createApp(cfg);
app.listen(cfg.PORT, () => logger.info(`OOHRENA API listening on :${cfg.PORT} (${cfg.NODE_ENV})`));
