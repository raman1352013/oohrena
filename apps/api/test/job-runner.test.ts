import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { JobLock, JobRun } from "../src/models/job-runner.js";
import {
  executeJob,
  getRegisteredJobs,
  registerDefaultJobs,
  registerJob,
  stopJobRunner,
} from "../src/services/job-runner.js";
import { bearer, createStaff, registerClient, startTestDb, stopTestDb, testApp } from "./helpers.js";

describe("V0.5: Background job runner with distributed locking & audit history", () => {
  beforeAll(async () => {
    await startTestDb();
    registerDefaultJobs();
  });

  afterAll(async () => {
    stopJobRunner();
    await stopTestDb();
  });

  it("registers all blueprint required background jobs", () => {
    const jobs = getRegisteredJobs();
    const names = jobs.map((j) => j.name);
    expect(names).toContain("hold_release");
    expect(names).toContain("quote_expiry");
    expect(names).toContain("reverify_reminder");
    expect(names).toContain("permit_expiry_check");
    expect(names).toContain("sla_monitor");
    expect(names).toContain("reconciliation");
    expect(names).toContain("score_compute");
    expect(names).toContain("leakage_scan");
  });

  it("executes a registered job and records execution in JobRun", async () => {
    const res = await executeJob("hold_release", "test-instance-1");
    expect(res.status).toBe("completed");
    expect(res.durationMs).toBeGreaterThanOrEqual(0);

    const run = await JobRun.findOne({ jobName: "hold_release" }).sort({ startedAt: -1 }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");
    expect(run!.lockedBy).toBe("test-instance-1");
    expect(run!.finishedAt).toBeDefined();

    // Lock must be released
    const lock = await JobLock.findById("hold_release").lean();
    expect(lock?.lockedBy).toBeNull();
  });

  it("distributed lock prevents concurrent execution across instances", async () => {
    registerJob({
      name: "concurrency_test",
      intervalMs: 60000,
      lockTtlMs: 30000,
      handler: async () => {
        // simulate work
        await new Promise((r) => setTimeout(r, 50));
        return { processedCount: 1 };
      },
    });

    // Manually hold lock for instance-A with a future expiration
    await JobLock.findOneAndUpdate(
      { _id: "concurrency_test" },
      { $set: { lockedBy: "instance-A", lockedAt: new Date(), expiresAt: new Date(Date.now() + 60000) } },
      { upsert: true },
    );

    // Instance-B attempts to execute while instance-A holds lock
    const resB = await executeJob("concurrency_test", "instance-B");
    expect(resB.status).toBe("skipped");

    // Fast-forward lock expiration (simulate abandoned or expired lock)
    await JobLock.updateOne({ _id: "concurrency_test" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    // Instance-B can now acquire and complete the job
    const resB2 = await executeJob("concurrency_test", "instance-B");
    expect(resB2.status).toBe("completed");
    expect(resB2.processedCount).toBe(1);
  });

  it("recovers gracefully and records failed status when a job throws", async () => {
    registerJob({
      name: "failing_job",
      intervalMs: 60000,
      lockTtlMs: 30000,
      handler: async () => {
        throw new Error("Simulated job failure");
      },
    });

    const res = await executeJob("failing_job", "instance-err");
    expect(res.status).toBe("failed");
    expect(res.error).toBe("Simulated job failure");

    const failedRun = await JobRun.findOne({ jobName: "failing_job" }).sort({ startedAt: -1 }).lean();
    expect(failedRun).not.toBeNull();
    expect(failedRun!.status).toBe("failed");
    expect(failedRun!.error).toBe("Simulated job failure");

    // Lock should be released despite failure
    const lock = await JobLock.findById("failing_job").lean();
    expect(lock?.lockedBy).toBeNull();
  });

  it("admin endpoints: list jobs, query runs and trigger manual execution", async () => {
    const { app, cfg } = testApp();
    const admin = await createStaff(app, cfg, "admin");
    const auditor = await createStaff(app, cfg, "auditor");
    const client = await registerClient(app);

    // List jobs
    const jobsRes = await request(app).get("/api/v1/admin/jobs").set(bearer(admin.token));
    expect(jobsRes.status).toBe(200);
    expect(jobsRes.body.data.jobs.length).toBeGreaterThanOrEqual(8);

    // Auditor can view jobs and runs
    expect((await request(app).get("/api/v1/admin/jobs").set(bearer(auditor.token))).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/jobs/runs").set(bearer(auditor.token))).status).toBe(200);

    // Client forbidden (403)
    expect((await request(app).get("/api/v1/admin/jobs").set(bearer(client.token))).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/jobs/runs").set(bearer(client.token))).status).toBe(403);

    // Admin triggers job manually
    const triggerRes = await request(app)
      .post("/api/v1/admin/jobs/hold_release/run")
      .set(bearer(admin.token));
    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.data.status).toBe("completed");

    // Non-existent job returns 404 with request_id (V0.6)
    const notFoundRes = await request(app)
      .post("/api/v1/admin/jobs/nonexistent_job/run")
      .set(bearer(admin.token))
      .set("x-request-id", "req-job-test-404");
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error.request_id).toBe("req-job-test-404");
    expect(notFoundRes.body.error.code).toBe("NOT_FOUND");

    // Auditor cannot trigger jobs (403 with request_id)
    const auditorTriggerRes = await request(app)
      .post("/api/v1/admin/jobs/hold_release/run")
      .set(bearer(auditor.token))
      .set("x-request-id", "req-job-test-403");
    expect(auditorTriggerRes.status).toBe(403);
    expect(auditorTriggerRes.body.error.request_id).toBe("req-job-test-403");
  });
});
