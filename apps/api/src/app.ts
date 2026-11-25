import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";
import type { Config } from "./config.js";
import { csrfGuard, loadSession, restrictPrivilegedIps } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { vendorRoutes } from "./routes/vendors.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { auditRoutes } from "./routes/audit.js";
import { adminSystemRoutes, consentRoutes, healthRoutes } from "./routes/system.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { fileRoutes } from "./routes/files.js";
import { adminVendorRoutes } from "./routes/admin-vendors.js";
import { adminInventoryRoutes } from "./routes/admin-inventory.js";
import { availabilityRequestRoutes, holdRoutes } from "./routes/availability.js";
import { adminLeadRoutes, leadRoutes, shortlistRoutes } from "./routes/leads.js";
import { adminTowerRoutes } from "./routes/admin-tower.js";
import { dealRoutes } from "./routes/deals.js";
import { executionRoutes } from "./routes/execution.js";
import { financeRoutes, ownFinanceRoutes } from "./routes/finance.js";
import { reportRoutes } from "./routes/reports.js";
import { notificationRoutes } from "./routes/notifications.js";
import { partnerRoutes } from "./routes/partner.js";
import { settingsRoutes } from "./routes/settings.js";
import { jobRoutes } from "./routes/jobs.js";
import { referralRoutes, walletRoutes } from "./routes/referrals.js";

const limitHandler: Parameters<typeof rateLimit>[0] = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } }),
};

export function createApp(cfg: Config) {
  const app = express();
  app.disable("x-powered-by");
  if (cfg.TRUST_PROXY) app.set("trust proxy", cfg.TRUST_PROXY);

  app.use((req, res, next) => {
    const reqId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    req.headers["x-request-id"] = reqId;
    res.setHeader("X-Request-Id", reqId);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(cors({ origin: cfg.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  const redisClient = cfg.REDIS_URL ? new Redis(cfg.REDIS_URL) : null;
  const store = redisClient
    ? new RedisStore({
        // @ts-expect-error - ioredis call signature
        sendCommand: (...args: string[]) => redisClient.call(...args),
      })
    : undefined;

  app.use("/api", rateLimit({ store, ...limitHandler, windowMs: 60_000, limit: cfg.RATE_LIMIT_PER_MINUTE }));
  // Stricter limiter for credential endpoints (login/register), per IP.
  const authLimiter = rateLimit({ store, ...limitHandler, windowMs: 60_000, limit: cfg.AUTH_RATE_LIMIT_PER_MINUTE });

  const v1 = express.Router();
  v1.use(loadSession());
  v1.use(restrictPrivilegedIps(cfg));
  v1.use(csrfGuard(cfg));
  v1.use("/system", healthRoutes());
  v1.use("/auth", authRoutes(cfg, authLimiter));
  v1.use("/clients", clientRoutes());
  v1.use("/vendors", vendorRoutes(cfg, authLimiter));
  v1.use("/consents", consentRoutes());
  v1.use("/audit-logs", auditRoutes());
  v1.use("/admin/audit-logs", auditRoutes());
  v1.use("/inventory", inventoryRoutes(cfg));
  v1.use("/holds", holdRoutes(cfg));
  v1.use("/availability-requests", availabilityRequestRoutes());
  v1.use("/leads", leadRoutes());
  v1.use("/shortlists", shortlistRoutes());
  v1.use("/files", fileRoutes(cfg));
  v1.use("/admin/vendors", adminVendorRoutes());
  v1.use("/admin", adminUserRoutes(cfg));
  v1.use("/admin", adminSystemRoutes());
  v1.use("/admin", adminInventoryRoutes(cfg));
  v1.use("/admin", adminLeadRoutes());
  v1.use("/admin", adminTowerRoutes(cfg));
  v1.use("/admin/settings", settingsRoutes());
  v1.use("/admin/jobs", jobRoutes());
  v1.use("/", dealRoutes());
  v1.use("/", executionRoutes(cfg));
  v1.use("/finance", financeRoutes(cfg));
  v1.use("/", ownFinanceRoutes());
  v1.use("/reports", reportRoutes(cfg));
  v1.use("/", notificationRoutes());
  v1.use("/partner", partnerRoutes(cfg));
  v1.use("/referrals", referralRoutes(cfg));
  v1.use("/wallet", walletRoutes());

  app.use("/api/v1", v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
