/**
 * Browser-side Supabase client factory. Safe to import in Client
 * Components; uses only the public anon key.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  // .trim() guards against stray whitespace pasted into the env var
  // value (a trailing newline in the Vercel dashboard once produced
  // an `apikey=...%0A` URL on the realtime websocket and broke every
  // reconnect).
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  );
}
