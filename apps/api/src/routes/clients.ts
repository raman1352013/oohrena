import { Router } from "express";
import { clientProfileUpdate, type ClientProfileUpdate } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Client } from "../models/foundation.js";

const publicClient = (c: Record<string, unknown>) => ({
  clientId: c._id,
  companyName: c.companyName,
  gstin: c.gstin,
  billingAddress: c.billingAddress,
  contacts: c.contacts,
  updatedAt: c.updatedAt,
});

/** Module 1: /api/v1/clients/me — always scoped to the logged-in client's own profile. */
export function clientRoutes() {
  const r = Router();

  r.get("/me", requirePermission("client.profile"), async (req, res) => {
    const c = await Client.findOne({ userId: req.user!.userId }).lean();
    if (!c) throw notFound("Client profile not found");
    res.json({ data: publicClient(c) });
  });

  r.put("/me", requirePermission("client.profile"), validateBody(clientProfileUpdate), async (req, res) => {
    const patch = req.body as ClientProfileUpdate;
    const before = await Client.findOne({ userId: req.user!.userId }).lean();
    if (!before) throw notFound("Client profile not found");
    const after = await Client.findOneAndUpdate({ _id: before._id }, { $set: patch }, { returnDocument: "after", runValidators: true }).lean();
    const changed = Object.keys(patch) as (keyof ClientProfileUpdate)[];
    await audit(req, {
      action: "client.profile.update",
      entity: "client",
      entityId: before._id,
      before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
      after: Object.fromEntries(changed.map((k) => [k, after![k] ?? null])),
    });
    res.json({ data: publicClient(after!) });
  });

  return r;
}
