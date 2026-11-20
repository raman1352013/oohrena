import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { Config } from "./config.js";
import { csrfGuard, loadSession } from "./middleware/auth.js";
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

const limitHandler: Parameters<typeof rateLimit>[0] = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } }),
};

export function createApp(cfg: Config) {
  const app = express();
  app.disable("x-powered-by");
  if (cfg.TRUST_PROXY) app.set("trust proxy", cfg.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: cfg.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ ...limitHandler, windowMs: 60_000, limit: cfg.RATE_LIMIT_PER_MINUTE }));
  // Stricter limiter for credential endpoints (login/register), per IP.
  const authLimiter = rateLimit({ ...limitHandler, windowMs: 60_000, limit: cfg.AUTH_RATE_LIMIT_PER_MINUTE });

  const v1 = express.Router();
  v1.use(loadSession());
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
  v1.use("/admin", adminUserRoutes());
  v1.use("/admin", adminSystemRoutes());
  v1.use("/admin", adminInventoryRoutes(cfg));
  v1.use("/admin", adminLeadRoutes());
  v1.use("/admin", adminTowerRoutes(cfg));
  v1.use("/", dealRoutes());
  v1.use("/", executionRoutes(cfg));
  v1.use("/finance", financeRoutes(cfg));
  v1.use("/", ownFinanceRoutes());

  app.use("/api/v1", v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
