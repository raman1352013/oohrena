import mongoose, { type ClientSession } from "mongoose";

/** Runs fn in a MongoDB transaction (requires a replica set, e.g. Atlas). Retries transient errors. */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}
