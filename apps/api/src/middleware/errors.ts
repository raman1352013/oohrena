import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { SystemEvent } from "../models/foundation.js";

function getRequestId(req: Request): string | null {
  return (req.headers["x-request-id"] as string) || req.get("x-request-id") || null;
}

export function notFoundHandler(req: Request, res: Response) {
  const reqId = getRequestId(req);
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found", request_id: reqId, requestId: reqId } });
}

// Express recognises error handlers by arity, so all four params are required.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const reqId = getRequestId(req);
  // A file route may set image/PDF headers before the read fails; the error body is JSON and must
  // not be cached or offered as a download.
  if (!res.headersSent) {
    for (const h of ["Content-Type", "Content-Disposition", "Cache-Control"]) res.removeHeader(h);
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        request_id: reqId,
        requestId: reqId,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }
  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body", request_id: reqId, requestId: reqId } });
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.code === "LIMIT_FILE_COUNT" ? "Too many files" : `Upload error: ${err.message}`;
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg, request_id: reqId, requestId: reqId } });
  }
  if ((err as { type?: string }).type === "entity.too.large") {
    return res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "Request body too large", request_id: reqId, requestId: reqId } });
  }
  // Duplicate key → 409 with the field name, never the value.
  if ((err as { code?: number }).code === 11000) {
    const field = Object.keys((err as { keyPattern?: object }).keyPattern ?? {})[0] ?? "record";
    return res.status(409).json({ error: { code: "CONFLICT", message: `An account with this ${field} already exists`, request_id: reqId, requestId: reqId, details: { field } } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message, request_id: reqId, requestId: reqId } });
  }
  logger.error({ err, requestId: reqId, path: req.path, method: req.method }, (err as Error)?.message);
  void SystemEvent.create({ type: "error", detail: { requestId: reqId, path: req.path, method: req.method, message: (err as Error)?.message } }).catch(() => {});
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", request_id: reqId, requestId: reqId } });
}
