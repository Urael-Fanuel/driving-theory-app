// supabase/functions/ip-geolocate/index.ts
//
// Coarse, IP-based city lookup — the fallback used ONLY for a user who has
// never been asked for (precise, GPS-based) location yet, never for one who
// declined it. See hooks/useLocationPrompt.ts getLocationConsentState and
// backend/api.ts getSponsorAd (tier 3) for how the two are kept separate.
//
// Uses the caller's own request IP (read from the x-forwarded-for header
// Supabase's edge proxy adds — this function ignores any IP the client
// might try to pass in the body, so it cannot be spoofed to look up a
// different address), via ipapi.co (free tier, HTTPS, no API key needed
// at this app's current volume).
//
// Auth: Supabase verifies the caller's JWT before this code runs
// (verify_jwt, default Edge Function behavior) — same as every other
// function in this project.

const IPAPI_URL = 'https://ipapi.co';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // x-forwarded-for can carry a comma-separated chain (client, proxy1, ...) —
    // the first entry is the original caller.
    const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
    const ip = forwardedFor.split(',')[0].trim();

    if (!ip) {
      // Can happen in local dev (no proxy in front) — not a real client error.
      return json({ city: null, country: null });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    let geoRes: Response;
    try {
      geoRes = await fetch(`${IPAPI_URL}/${ip}/json/`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!geoRes.ok) {
      // ipapi.co returns 429 once the free-tier rate limit is hit — treat as
      // "unknown" rather than a hard error, since this is a best-effort
      // fallback, not a critical path.
      console.warn('[ip-geolocate] provider HTTP error:', geoRes.status);
      return json({ city: null, country: null });
    }

    const data = await geoRes.json();
    if (data?.error) {
      console.warn('[ip-geolocate] provider error:', data.reason ?? data.error);
      return json({ city: null, country: null });
    }

    const city: string | null = data?.city ?? null;
    const country: string | null = data?.country_name ?? null;

    return json({ city, country });
  } catch (err) {
    console.error('[ip-geolocate] error:', err);
    return json({ city: null, country: null });
  }
});
