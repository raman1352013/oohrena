import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { badRequest } from "../lib/errors.js";

/** Parses req.body with a shared zod schema; replaces it with the parsed (trimmed/normalised) value. */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) return next(badRequest("Please check the highlighted fields", r.error.flatten()));
    req.body = r.data;
    next();
  };
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const r = schema.safeParse(req.query);
  if (!r.success) throw badRequest("Invalid query parameters", r.error.flatten());
  return r.data;
}
