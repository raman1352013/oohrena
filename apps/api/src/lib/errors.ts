import type { ErrorCode } from "@oohrena/shared";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "VALIDATION_ERROR", message, details);
export const unauthenticated = (message = "Please sign in") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this resource") => new AppError(403, "FORBIDDEN", message);
/** Used for "not yours" too, so foreign IDs never reveal that a record exists. */
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details);
