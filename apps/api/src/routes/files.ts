import { Router } from "express";
import type { Config } from "../config.js";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { readUpload } from "../lib/storage.js";
import { requireAuth } from "../middleware/auth.js";
import { StoredFile } from "../models/files.js";
import { verifyFileSignature } from "../lib/signed-url.js";

/**
 * GET /api/v1/files/:id — private file download with an object-level check:
 * the owning vendor, Admin, or (KYC documents) Finance/Audit. Anyone else gets 404.
 * KYC document access is audit-logged.
 */
export function fileRoutes(cfg: Config) {
  const r = Router();
  r.get("/signed/:id", async (req, res) => {
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    const id = String(req.params.id);
    if (!exp || !sig || !verifyFileSignature(cfg, id, exp, sig)) throw notFound("Link expired or invalid");
    const f = await StoredFile.findById(id).lean();
    if (!f || f.kind !== "proof") throw notFound("File not found");
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(await readUpload(cfg, f));
  });

  r.get("/:id", requireAuth, async (req, res) => {
    const f = await StoredFile.findById(String(req.params.id)).lean();
    if (!f) throw notFound("File not found");
    const u = req.user!;
    const isOwnerVendor = u.role === "vendor" && !!f.vendorId && f.vendorId === u.orgId;
    const allowed = isOwnerVendor || u.role === "admin" || (u.role === "finance" && f.kind === "kyc_document");
    if (!allowed) throw notFound("File not found");
    if (f.kind === "kyc_document") await audit(req, { action: "vendor.document.view", entity: "file", entityId: f._id, after: { vendorId: f.vendorId } });
    res.setHeader("Content-Type", f.mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${f._id}.${f.mime.split("/")[1]}"`);
    res.send(await readUpload(cfg, f));
  });
  return r;
}
