import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

type Result<T> = { data: T | null; error: PostgrestError | null };

// PostgREST truncates responses at 1000 rows (Supabase default `max_rows`).
const PAGE_SIZE = 1000;

/**
 * Returns the payload of a Supabase response or throws a plain `Error`.
 * Repositories run inside `use cache`, where custom error classes do not survive,
 * so `handle()` reports these as 500 and the message stays in the server log.
 */
export function unwrap<T>({ data, error }: Result<T>): T {
  if (error || data === null) {
    throw new Error(`Supabase request failed: ${error?.message ?? "empty response"}`);
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
