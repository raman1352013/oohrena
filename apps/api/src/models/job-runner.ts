import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Distributed job lock to ensure single execution across multiple API instances.
 */
const jobLockSchema = new Schema(
  {
    _id: { type: String, required: true }, // job name, e.g. "hold_release"
    lockedBy: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: () => new Date(0), index: true },
  },
  { versionKey: false },
);

export const JobLock = mongoose.model("JobLock", jobLockSchema, "job_locks");
export type JobLockDoc = InferSchemaType<typeof jobLockSchema>;

/**
 * Audit record of background job executions.
 */
const jobRunSchema = new Schema(
  {
    jobName: { type: String, required: true, index: true },
    status: { type: String, enum: ["running", "completed", "failed", "skipped"], required: true, index: true },
    startedAt: { type: Date, required: true, default: () => new Date(), index: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    processedCount: { type: Number, default: 0 },
    error: { type: String, default: null },
    lockedBy: { type: String, required: true },
  },
  { versionKey: false },
);

jobRunSchema.index({ jobName: 1, startedAt: -1 });

export const JobRun = mongoose.model("JobRun", jobRunSchema, "job_runs");
export type JobRunDoc = InferSchemaType<typeof jobRunSchema>;
