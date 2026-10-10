import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { ApiError } from "@/server/http";

type Result<T> = { data: T | null; error: PostgrestError | null };

// PostgREST truncates responses at 1000 rows (Supabase default `max_rows`).
const PAGE_SIZE = 1000;

/** Returns the payload of a Supabase response, or raises a 502 without leaking DB internals. */
export function unwrap<T>({ data, error }: Result<T>): T {
  if (error || data === null) {
    console.error("[supabase]", error);
    throw new ApiError(502, "upstream_error", "Database request failed");
  }
  return data;
}

/** Reads every row of a query by paging. The query must have a deterministic `order`. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Result<T[]>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const chunk = unwrap(await page(from, from + PAGE_SIZE - 1));
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}
