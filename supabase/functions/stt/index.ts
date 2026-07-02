// supabase/functions/stt/index.ts
// Proxies speech-to-text requests to Google Cloud Speech.
// The Google API key lives ONLY here (as a Supabase secret) — it is never
// shipped inside the app, so it cannot be extracted from the APK.
//
// Auth: Supabase verifies the caller's JWT before this code runs (default
// Edge Function behavior), so only signed-in app users (incl. anonymous
// Supabase sessions) can reach this endpoint — not the public internet.

const GOOGLE_STT_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const GOOGLE_KEY = Deno.env.get('GOOGLE_STT_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PHRASE_HINTS = [
  'አንድ', 'ሁለት', 'ሶስት',
  'ሀ', 'ለ', 'ሐ',
  '1', '2', '3',
  'one', 'two', 'three',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioBase64, encoding, sampleRateHertz } = await req.json();

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing audioBase64' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Guard against abuse — reject absurdly large payloads (~5 s clip is a few hundred KB)
    if (audioBase64.length > 2_000_000) {
      return new Response(JSON.stringify({ error: 'Audio too large' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const safeEncoding = encoding === 'AMR_WB' ? 'AMR_WB' : 'LINEAR16';
    const safeSampleRate = Number.isFinite(sampleRateHertz) ? sampleRateHertz : 16000;

    if (!GOOGLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let googleRes: Response;
    try {
      googleRes = await fetch(GOOGLE_STT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
        body: JSON.stringify({
          config: {
            encoding: safeEncoding,
            sampleRateHertz: safeSampleRate,
            languageCode: 'am-ET',
            speechContexts: [{ phrases: PHRASE_HINTS, boost: 20 }],
            maxAlternatives: 1,
            enableAutomaticPunctuation: false,
            model: 'default',
            useEnhanced: false,
          },
          audio: { content: audioBase64 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await googleRes.json();

    if (!googleRes.ok) {
      console.error('[stt] Google API error:', data);
      return new Response(JSON.stringify({ error: 'STT provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stt] error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
