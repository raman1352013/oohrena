import { Router } from "express";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { requirePermission } from "../middleware/auth.js";
import { parseQuery } from "../middleware/validate.js";
import { JobRun } from "../models/job-runner.js";
import { executeJob, getRegisteredJobs } from "../services/job-runner.js";

const runsQuerySchema = z.object({
  jobName: z.string().trim().optional(),
  status: z.enum(["running", "completed", "failed", "skipped"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function jobRoutes() {
  const r = Router();

  // List all registered jobs
  r.get("/", requirePermission("jobs.read"), (_req, res) => {
    return res.json({ data: { jobs: getRegisteredJobs() } });
  });

  // Query past job execution runs
  r.get("/runs", requirePermission("jobs.read"), async (req, res) => {
    const q = parseQuery(runsQuerySchema, req);
    const filter: Record<string, unknown> = {};
    if (q.jobName) filter.jobName = q.jobName;
    if (q.status) filter.status = q.status;

    const [items, total] = await Promise.all([
      JobRun.find(filter)
        .sort({ startedAt: -1, _id: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      JobRun.countDocuments(filter),
    ]);

    return res.json({
      data: {
        items: items.map(({ _id, ...rest }) => ({ runId: String(_id), ...rest })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  });

  // Manually trigger a background job
  r.post("/:name/run", requirePermission("jobs.manage"), async (req, res) => {
    const name = String(req.params.name);
    const registered = getRegisteredJobs();
    if (!registered.some((j) => j.name === name)) {
      throw notFound(`Job not found: ${name}`);
    }

    const result = await executeJob(name);
    await audit(req, {
      action: "job.run.manual",
      entity: "job",
      entityId: name,
      after: result,
      reason: "Manual admin execution",
    });

    return res.json({ data: result });
  });

  return r;
}
