import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/server/env";
import type { Database } from "./schema";

function create() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let client: ReturnType<typeof create> | undefined;

/** Shared read-only Supabase client (anon role; RLS exposes SELECT only). */
export const db = () => (client ??= create());
