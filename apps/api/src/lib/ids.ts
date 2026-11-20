import type { ClientSession } from "mongoose";
import { counterKey, formatId, type IdPrefix } from "@oohrena/shared";
import { Counter } from "../models/foundation.js";

/** Atomically allocates the next ID for a prefix. Gaps are possible (aborted tx); reuse never is. */
export async function nextId(prefix: IdPrefix, session?: ClientSession, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const doc = await Counter.findOneAndUpdate(
    { _id: counterKey(prefix, year) },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  return formatId(prefix, doc!.seq, year);
}
