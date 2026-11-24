import { Router } from "express";
import { settingApproveInput, settingUpdateInput } from "@oohrena/shared";
import { audit } from "../lib/audit.js";
import { requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  approveSetting,
  getAllSettings,
  proposeOrUpdateSetting,
} from "../services/settings.js";

export function settingsRoutes() {
  const r = Router();

  r.get("/", requirePermission("settings.read"), async (_req, res) => {
    const data = await getAllSettings();
    res.json({ data });
  });

  r.put("/:key", requirePermission("settings.manage"), validateBody(settingUpdateInput), async (req, res) => {
    const key = String(req.params.key);
    const { value, reason } = req.body;
    const { item, isSensitive } = await proposeOrUpdateSetting(key, value, req.user!.userId, reason);
    await audit(req, {
      action: isSensitive ? "setting.propose" : "setting.update",
      entity: "system_setting",
      entityId: key,
      after: { value, isSensitive, version: item.version, status: item.status },
      reason,
    });
    res.json({ data: item });
  });

  r.post("/:key/approve", requirePermission("settings.manage"), validateBody(settingApproveInput), async (req, res) => {
    const key = String(req.params.key);
    const { reason } = req.body ?? {};
    const item = await approveSetting(key, req.user!.userId, reason);
    await audit(req, {
      action: "setting.approve",
      entity: "system_setting",
      entityId: key,
      after: { value: item.value, version: item.version, status: item.status },
      reason: reason ?? null,
    });
    res.json({ data: item });
  });

  return r;
}
