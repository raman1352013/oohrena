import type { ClientSession } from "mongoose";
import {
  DEFAULT_SYSTEM_SETTINGS,
  isSensitiveSetting,
  type SystemSettingItem,
  type SystemSettingKey,
} from "@oohrena/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { nextId } from "../lib/ids.js";
import { SystemSetting, SystemSettingHistory } from "../models/settings.js";

const cache = new Map<string, unknown>();

/**
 * Reads setting from in-memory cache, falls back to DB, then to DEFAULT_SYSTEM_SETTINGS.
 */
export async function getSetting<K extends SystemSettingKey>(key: K): Promise<typeof DEFAULT_SYSTEM_SETTINGS[K]> {
  if (cache.has(key)) {
    return cache.get(key) as typeof DEFAULT_SYSTEM_SETTINGS[K];
  }
  const doc = await SystemSetting.findById(key).lean();
  if (doc) {
    cache.set(key, doc.value);
    return doc.value as typeof DEFAULT_SYSTEM_SETTINGS[K];
  }
  const fallback = DEFAULT_SYSTEM_SETTINGS[key];
  cache.set(key, fallback);
  return fallback;
}

/**
 * Initializes default settings in DB on server boot or test setup.
 */
export async function initSettings(systemUserId = "SYSTEM") {
  const keys = Object.keys(DEFAULT_SYSTEM_SETTINGS) as SystemSettingKey[];
  const existing = await SystemSetting.find({ _id: { $in: keys } }).select("_id value").lean();
  const existingKeys = new Set(existing.map((e) => e._id));

  for (const doc of existing) {
    cache.set(doc._id, doc.value);
  }

  const missing = keys.filter((k) => !existingKeys.has(k));
  if (missing.length > 0) {
    const toInsert = missing.map((k) => ({
      _id: k,
      key: k,
      value: DEFAULT_SYSTEM_SETTINGS[k],
      version: 1,
      effectiveFrom: new Date(),
      changedBy: systemUserId,
    }));
    await SystemSetting.insertMany(toInsert);
    for (const item of toInsert) {
      cache.set(item.key, item.value);
    }
  }
}

export function formatSettingItem(doc: {
  key: string;
  value: unknown;
  version: number;
  effectiveFrom: Date;
  changedBy: string;
  pendingValue?: unknown | null;
  pendingChangedBy?: string | null;
  pendingReason?: string | null;
  pendingRequestedAt?: Date | null;
}): SystemSettingItem {
  return {
    key: doc.key,
    value: doc.value,
    version: doc.version,
    effectiveFrom: doc.effectiveFrom.toISOString(),
    changedBy: doc.changedBy,
    pendingValue: doc.pendingValue ?? null,
    pendingChangedBy: doc.pendingChangedBy ?? null,
    pendingReason: doc.pendingReason ?? null,
    pendingRequestedAt: doc.pendingRequestedAt ? doc.pendingRequestedAt.toISOString() : null,
    status: doc.pendingValue !== null && doc.pendingValue !== undefined ? "pending_approval" : "active",
  };
}

export async function getAllSettings(): Promise<SystemSettingItem[]> {
  await initSettings();
  const docs = await SystemSetting.find().sort({ key: 1 }).lean();
  return docs.map(formatSettingItem);
}

export async function proposeOrUpdateSetting(
  key: string,
  value: unknown,
  userId: string,
  reason: string,
  session?: ClientSession,
): Promise<{ item: SystemSettingItem; isSensitive: boolean }> {
  if (!(key in DEFAULT_SYSTEM_SETTINGS)) {
    throw badRequest(`Unknown setting key: ${key}`);
  }

  let setting = await SystemSetting.findById(key).session(session ?? null);
  if (!setting) {
    setting = new SystemSetting({
      _id: key,
      key,
      value: DEFAULT_SYSTEM_SETTINGS[key as SystemSettingKey],
      version: 1,
      effectiveFrom: new Date(),
      changedBy: userId,
    });
  }

  const sensitive = isSensitiveSetting(key);

  if (sensitive) {
    setting.pendingValue = value;
    setting.pendingChangedBy = userId;
    setting.pendingReason = reason;
    setting.pendingRequestedAt = new Date();
    await setting.save({ session });
    return { item: formatSettingItem(setting.toObject()), isSensitive: true };
  }

  // Non-sensitive: apply immediately
  const nextVersion = (setting.version ?? 1) + 1;
  setting.value = value;
  setting.version = nextVersion;
  setting.effectiveFrom = new Date();
  setting.changedBy = userId;
  setting.pendingValue = null;
  setting.pendingChangedBy = null;
  setting.pendingReason = null;
  setting.pendingRequestedAt = null;
  await setting.save({ session });

  const historyId = await nextId("SSH", session);
  await SystemSettingHistory.create(
    [
      {
        _id: historyId,
        key,
        version: nextVersion,
        value,
        changedBy: userId,
        reason,
      },
    ],
    { session },
  );

  cache.set(key, value);
  return { item: formatSettingItem(setting.toObject()), isSensitive: false };
}

export async function approveSetting(
  key: string,
  approverUserId: string,
  approvalReason?: string,
  session?: ClientSession,
): Promise<SystemSettingItem> {
  const setting = await SystemSetting.findById(key).session(session ?? null);
  if (!setting) throw notFound(`Setting not found: ${key}`);
  if (setting.pendingValue === null || setting.pendingValue === undefined) {
    throw badRequest(`No pending change for setting: ${key}`);
  }

  // Maker-checker check: Maker cannot approve their own change
  if (setting.pendingChangedBy === approverUserId) {
    throw badRequest("Maker cannot approve their own change (maker-checker rule requires another admin)");
  }

  const nextVersion = (setting.version ?? 1) + 1;
  const approvedValue = setting.pendingValue;
  const reason = approvalReason ?? setting.pendingReason ?? "Approved";

  setting.value = approvedValue;
  setting.version = nextVersion;
  setting.effectiveFrom = new Date();
  setting.changedBy = approverUserId;
  setting.pendingValue = null;
  setting.pendingChangedBy = null;
  setting.pendingReason = null;
  setting.pendingRequestedAt = null;
  await setting.save({ session });

  const historyId = await nextId("SSH", session);
  await SystemSettingHistory.create(
    [
      {
        _id: historyId,
        key,
        version: nextVersion,
        value: approvedValue,
        changedBy: approverUserId,
        reason,
      },
    ],
    { session },
  );

  cache.set(key, approvedValue);
  return formatSettingItem(setting.toObject());
}
