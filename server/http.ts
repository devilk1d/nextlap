import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (resource: string) =>
  new ApiError(404, "not_found", `${resource} not found`);

export const positiveInt = z.coerce.number().int().positive();

export const queryOf = (request: NextRequest) =>
  Object.fromEntries(request.nextUrl.searchParams);

/** Validates untrusted input (params, query) and raises a 400 `ApiError` on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ApiError(
    400,
    "invalid_request",
    "Invalid request parameters",
    result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
  );
}

/** Dataset is immutable between ETL loads, so responses are safe to share via CDN. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    const { status, code, message, details } = error;
    return Response.json({ error: { code, message, details } }, { status });
  }
  console.error(error);
  return Response.json(
    { error: { code: "internal_error", message: "Unexpected server error" } },
    { status: 500 },
  );
}

/**
 * Wraps a route handler: renders at request time, serialises the returned value
 * as JSON and maps thrown errors to the `{ error: { code, message } }` envelope.
 */
export function handle<Ctx>(run: (request: NextRequest, ctx: Ctx) => Promise<unknown>) {
  return async (request: NextRequest, ctx: Ctx) => {
    await connection();
    try {
      const body = await run(request, ctx);
      return Response.json(body, { headers: { "Cache-Control": CACHE_CONTROL } });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
