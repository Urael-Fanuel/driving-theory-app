// supabase/functions/reverse-geocode/index.ts
//
// Converts a GPS coordinate into a city + country, ANYWHERE in the world, via
// Google's Geocoding API. Replaces an earlier, WRONG approach that hardcoded
// a fixed list of ~26 Israeli cities — this app is international (Ethiopian
// users worldwide, plus Ethiopia itself), and a hardcoded list can never
// cover that. There is no substitute for a real reverse-geocoding service
// when "anywhere in the world" is a real requirement, not a nice-to-have.
//
// The Google API key lives ONLY here (as a Supabase secret) — same pattern
// as supabase/functions/tts and stt, never shipped in the app.
//
// Cost note: this is called ONCE per user (see hooks/useLocationPrompt.ts —
// it marks itself "asked" and never re-runs), not per session, so the
// per-request cost of a paid geocoding API stays negligible in aggregate
// even at thousands of users.
//
// Auth: Supabase verifies the caller's JWT before this code runs
// (verify_jwt, default Edge Function behavior) — same as every other
// function in this project.

const GOOGLE_KEY = Deno.env.get('GOOGLE_GEOCODING_KEY') ?? '';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

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

/** One Google address_components entry. */
interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

/** One entry in Google's Geocoding API `results` array. */
interface GeocodeResult {
  types: string[];
  address_components: AddressComponent[];
}

/**
 * Pulls city + country out of Google's `results` array. Google does not have
 * a single universal "city" field — different countries use `locality`,
 * `postal_town`, or `administrative_area_level_2` for what a user would call
 * their city. Falls back through these in order, since Ethiopia and various
 * diaspora countries do not consistently use `locality`.
 *
 * Reads from the result object whose OWN top-level `types` matches the target
 * granularity (e.g. the dedicated `locality` result), not from the most
 * specific/first result (usually a street address). Google's `language`
 * param is "best effort": a street-address result's embedded locality
 * sub-component often stays in the local script (e.g. Hebrew for Israel)
 * even with `language=en`, while the dedicated locality-typed result has the
 * proper English name — verified directly against the API for Tel Aviv.
 */
function extractCityCountry(results: GeocodeResult[]): { city: string | null; country: string | null } {
  const findByResultType = (type: string): string | null => {
    const result = results.find(r => r.types.includes(type));
    return result?.address_components.find(c => c.types.includes(type))?.long_name ?? null;
  };

  const city =
    findByResultType('locality') ??
    findByResultType('postal_town') ??
    findByResultType('administrative_area_level_2') ??
    findByResultType('administrative_area_level_1');

  const country = findByResultType('country');

  return { city, country };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GOOGLE_KEY) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    const { lat, lon } = await req.json();

    if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
      return json({ error: 'Missing/invalid lat or lon' }, 400);
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return json({ error: 'lat/lon out of range' }, 400);
    }

    // language=en forces English city/country names regardless of where the
    // coordinate is in the world (Google otherwise returns the local
    // language, e.g. Hebrew in Israel or Amharic in Ethiopia) — needed so
    // future city-based business matching (e.g. a driving instructor's city
    // vs a user's city) compares consistently instead of mixing scripts.
    const url = `${GEOCODE_URL}?latlng=${lat},${lon}&key=${GOOGLE_KEY}&language=en`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let geoRes: Response;
    try {
      geoRes = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!geoRes.ok) {
      console.error('[reverse-geocode] Google API HTTP error:', geoRes.status);
      return json({ error: 'Geocoding provider error' }, 502);
    }

    const data = await geoRes.json();

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      // ZERO_RESULTS happens for open ocean / remote areas — not a server
      // error, just "we don't know". Let the caller handle a null city.
      if (data.status === 'ZERO_RESULTS') {
        return json({ city: null, country: null });
      }
      console.error('[reverse-geocode] Google API status:', data.status, data.error_message);
      return json({ error: 'Geocoding failed' }, 502);
    }

    const { city, country } = extractCityCountry(data.results ?? []);

    return json({ city, country });
  } catch (err) {
    console.error('[reverse-geocode] error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});
