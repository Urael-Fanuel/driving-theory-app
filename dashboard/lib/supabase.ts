/**
 * lib/supabase.ts
 * Server-only Supabase REST access for the dashboard.
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security entirely —
 * this file must NEVER be imported from a "use client" component or a
 * client-side hook. It only runs in Server Components / Route Handlers,
 * where Next.js keeps the code (and the env vars it reads) off the
 * client bundle by default.
 *
 * Plain fetch() against PostgREST, not the supabase-js SDK — this
 * dashboard only ever does simple filtered SELECTs, and matching the
 * project's existing scripts (scripts/*.mjs, supabase/functions/*)
 * keeps one fewer dependency and one fewer thing that can drift out of
 * date.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
}

/** Runs a PostgREST query. `query` is everything after the table name, e.g. "?select=*&order=id". */
export async function supabaseGet<T>(table: string, query: string): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    headers: headers(),
    cache: 'no-store', // this is a live operational dashboard — never serve a stale snapshot
  });
  if (!res.ok) {
    throw new Error(`Supabase query failed (${table}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Row count for a table via PostgREST's exact-count header, without transferring any rows. */
export async function supabaseCount(table: string, query = ''): Promise<number> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id${query}`, {
    headers: { ...headers(), Prefer: 'count=exact', Range: '0-0' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Supabase count failed (${table}): ${res.status} ${await res.text()}`);
  }
  const range = res.headers.get('content-range'); // "0-0/123"
  return range ? Number(range.split('/')[1]) : 0;
}
