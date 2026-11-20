import type { ApiError as ApiErrorBody, ErrorCode } from "@oohrena/shared";

/**
 * Thin client for the OOHRENA REST API (/api/v1).
 * Dev: Vite proxies /api to the Express server, so requests are same-origin and the
 * HttpOnly session cookie is sent automatically. Deployed: set VITE_API_URL to the API origin.
 */
const BASE = `${(import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ?? ""}/api/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode | "NETWORK_ERROR",
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** zod flatten() field errors from VALIDATION_ERROR responses, keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }
}

/** Turns an API-relative URL from a response (e.g. /api/v1/files/…) into one the browser can load. */
export const assetUrl = (u: string) => (u.startsWith("/api/v1") ? `${BASE}${u.slice("/api/v1".length)}` : u);

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  const hasBody = init.body !== undefined || init.form !== undefined;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (hasBody ? "POST" : "GET"),
      credentials: "include",
      // For FormData the browser sets the multipart boundary itself.
      headers: init.body !== undefined ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
      body: init.form ?? (init.body === undefined ? null : JSON.stringify(init.body)),
      signal: init.signal ?? null,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the OOHRENA server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as ({ data: T } & Partial<ApiErrorBody>) | null;
  if (!res.ok || !json || json.error) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json.data;
}
