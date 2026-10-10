import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

let env: z.infer<typeof schema> | undefined;

/** Validated server environment, read lazily so `next build` does not need secrets. */
export function getEnv() {
  return (env ??= schema.parse(process.env));
}
