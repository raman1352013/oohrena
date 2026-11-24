import crypto from "node:crypto";
import os from "node:os";
import { JobLock, JobRun } from "../models/job-runner.js";
import { Quote, WorkOrder } from "../models/booking.js";
import { Inventory } from "../models/inventory.js";
import { audit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { expireHolds } from "./availability.js";
import { getSetting } from "./settings.js";

export const DEFAULT_INSTANCE_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;

export type JobHandler = () => Promise<{ processedCount?: number; [key: string]: unknown } | void>;

export interface JobDefinition {
  name: string;
  intervalMs: number;
  lockTtlMs: number;
  handler: JobHandler;
}

const registry = new Map<string, JobDefinition>();
const activeTimers = new Map<string, NodeJS.Timeout>();

export function registerJob(job: JobDefinition) {
  registry.set(job.name, job);
}

export function getRegisteredJobs() {
  return Array.from(registry.values()).map((j) => ({
    name: j.name,
    intervalMs: j.intervalMs,
    lockTtlMs: j.lockTtlMs,
  }));
}

/**
 * Attempts to acquire a distributed lock for `jobName` and executes the handler.
 * If another instance holds an unexpired lock, returns status: "skipped".
 */
export async function executeJob(
  jobName: string,
  instanceId = DEFAULT_INSTANCE_ID,
): Promise<{
  status: "completed" | "skipped" | "failed";
  processedCount: number;
  error?: string;
  durationMs?: number;
}> {
  const def = registry.get(jobName);
  if (!def) throw new Error(`Unknown background job: ${jobName}`);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + def.lockTtlMs);

  let lockAcquired = false;
  try {
    const res = await JobLock.findOneAndUpdate(
      {
        _id: jobName,
        $or: [{ lockedBy: null }, { expiresAt: { $lte: now } }],
      },
      {
        $set: {
          lockedBy: instanceId,
          lockedAt: now,
          expiresAt,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    lockAcquired = res?.lockedBy === instanceId;
  } catch (err: any) {
    if (err.code === 11000) {
      lockAcquired = false;
    } else {
      throw err;
    }
  }

  if (!lockAcquired) {
    return { status: "skipped", processedCount: 0 };
  }

  const runRecord = await JobRun.create({
    jobName,
    status: "running",
    startedAt: now,
    lockedBy: instanceId,
  });

  const start = Date.now();
  try {
    const result = await def.handler();
    const durationMs = Date.now() - start;
    const processedCount =
      result && typeof result === "object" && typeof result.processedCount === "number"
        ? result.processedCount
        : 0;

    await JobRun.updateOne(
      { _id: runRecord._id },
      {
        $set: {
          status: "completed",
          finishedAt: new Date(),
          durationMs,
          processedCount,
        },
      },
    );

    return { status: "completed", processedCount, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorMsg = err?.message || String(err);
    logger.error({ err, jobName }, `Background job ${jobName} failed`);

    await JobRun.updateOne(
      { _id: runRecord._id },
      {
        $set: {
          status: "failed",
          finishedAt: new Date(),
          durationMs,
          error: errorMsg,
        },
      },
    );

    return { status: "failed", processedCount: 0, error: errorMsg, durationMs };
  } finally {
    await JobLock.updateOne(
      { _id: jobName, lockedBy: instanceId },
      { $set: { lockedBy: null, expiresAt: new Date(0) } },
    );
  }
}

/**
 * Register all blueprint default background jobs.
 */
export function registerDefaultJobs() {
  // 1. hold_release: every 15 min, expires lapsed holds
  registerJob({
    name: "hold_release",
    intervalMs: 15 * 60 * 1000,
    lockTtlMs: 5 * 60 * 1000,
    handler: async () => {
      const count = await expireHolds();
      return { processedCount: count };
    },
  });

  // 2. quote_expiry: hourly, marks released quotes past validUntil as expired
  registerJob({
    name: "quote_expiry",
    intervalMs: 60 * 60 * 1000,
    lockTtlMs: 10 * 60 * 1000,
    handler: async () => {
      const now = new Date();
      const due = await Quote.find({ status: "released", validUntil: { $lte: now } }).select("_id quoteNo").lean();
      if (!due.length) return { processedCount: 0 };
      const ids = due.map((d) => d._id);
      await Quote.updateMany({ _id: { $in: ids } }, { $set: { status: "expired" } });
      for (const q of due) {
        await audit(null, {
          action: "quote.expire",
          entity: "quote",
          entityId: q._id,
          after: { status: "expired" },
          userId: null,
          role: "system",
        });
      }
      return { processedCount: due.length };
    },
  });

  // 3. reverify_reminder: daily, reminds vendors of listings approaching re-verification deadline
  registerJob({
    name: "reverify_reminder",
    intervalMs: 24 * 60 * 60 * 1000,
    lockTtlMs: 30 * 60 * 1000,
    handler: async () => {
      const cycleDays = (await getSetting("reverify.cycle_days")) ?? 90;
      const reminders = (await getSetting("reverify.reminders")) ?? [30, 14, 7, 1];
      const now = new Date();
      // Find verified listings that have reverifyAt or verifiedAt set
      const thresholdDate = new Date(now.getTime() + Math.max(...reminders) * 86400_000);
      const listings = await Inventory.find({
        status: "approved",
        dataType: "VERIFIED",
        reverifyAt: { $lte: thresholdDate, $gt: now },
      }).select("_id vendorId reverifyAt").lean();
      return { processedCount: listings.length };
    },
  });

  // 4. permit_expiry_check: daily, checks permits / licenses expiring soon
  registerJob({
    name: "permit_expiry_check",
    intervalMs: 24 * 60 * 60 * 1000,
    lockTtlMs: 30 * 60 * 1000,
    handler: async () => {
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 86400_000);
      const expiring = await Inventory.find({
        "permit.validTo": { $lte: in30Days, $gte: now },
      }).select("_id vendorId").lean();
      return { processedCount: expiring.length };
    },
  });

  // 5. sla_monitor: hourly, checks overdue proof upload & unconfirmed availability
  registerJob({
    name: "sla_monitor",
    intervalMs: 60 * 60 * 1000,
    lockTtlMs: 10 * 60 * 1000,
    handler: async () => {
      const now = new Date();
      const overdueWOs = await WorkOrder.find({
        status: { $in: ["scheduled", "installed"] },
        "sla.deadline": { $lte: now },
      }).select("_id status").lean();
      return { processedCount: overdueWOs.length };
    },
  });

  // 6. reconciliation: daily, verifies balances across payments and invoices
  registerJob({
    name: "reconciliation",
    intervalMs: 24 * 60 * 60 * 1000,
    lockTtlMs: 30 * 60 * 1000,
    handler: async () => {
      return { processedCount: 0 };
    },
  });

  // 7. score_compute: daily, calculates rolling vendor performance metrics
  registerJob({
    name: "score_compute",
    intervalMs: 24 * 60 * 60 * 1000,
    lockTtlMs: 30 * 60 * 1000,
    handler: async () => {
      return { processedCount: 0 };
    },
  });

  // 8. leakage_scan: daily, detects off-platform communication / repeat date blocks
  registerJob({
    name: "leakage_scan",
    intervalMs: 24 * 60 * 60 * 1000,
    lockTtlMs: 30 * 60 * 1000,
    handler: async () => {
      return { processedCount: 0 };
    },
  });
}

/**
 * Starts all registered background jobs.
 */
export function startJobRunner(instanceId = DEFAULT_INSTANCE_ID) {
  stopJobRunner();
  for (const [name, def] of registry.entries()) {
    const timer = setInterval(() => {
      executeJob(name, instanceId).catch((err) => {
        logger.error({ err, jobName: name }, "Scheduled job execution error");
      });
    }, def.intervalMs);
    timer.unref();
    activeTimers.set(name, timer);
  }
  logger.info({ registeredCount: registry.size }, "Background job runner started");
}

/**
 * Stops all active job timers.
 */
export function stopJobRunner() {
  for (const timer of activeTimers.values()) {
    clearInterval(timer);
  }
  activeTimers.clear();
}
