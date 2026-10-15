import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkOrigin } from "@/lib/security/origin";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

const MAX_JSON_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, { ...init, headers: { ...NO_STORE, ...init?.headers } });
}

function errorResponse(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json<ApiErrorBody>({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** First message per field, keyed by the top-level path segment. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Parse a JSON body against a schema, with a size cap. */
export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Expected a JSON body.");
  }
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Malformed JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "validation_failed", "Please check the highlighted fields.", zodFields(parsed.error));
  }
  return parsed.data;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Wraps every route handler: CSRF origin check on state-changing methods, and
 * uniform JSON errors. Authorization is done inside each handler, close to the data.
 */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!SAFE_METHODS.has(req.method) && !checkOrigin(req.headers, req.nextUrl.origin)) {
        throw new ApiError(403, "bad_origin", "Request blocked.");
      }
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message, err.fields);
      // redirect()/notFound() from next/navigation must propagate.
      if (err && typeof err === "object" && "digest" in err) throw err;
      console.error("[api] unhandled", req.method, req.nextUrl.pathname, err);
      return errorResponse(500, "internal", "Something went wrong. Please try again.");
    }
  };
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
