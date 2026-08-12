// supabase/functions/tts/index.ts
// Proxies text-to-speech requests to Google Cloud TTS.
// The Google API key lives ONLY here (as a Supabase secret) — it is never
// shipped inside the app, so it cannot be extracted from the APK.
//
// Auth: Supabase verifies the caller's JWT before this code runs (default
// Edge Function behavior), so only signed-in app users (incl. anonymous
// Supabase sessions) can reach this endpoint — not the public internet.
//
// Rate limit: on top of that, each caller is capped at MAX_REQUESTS calls
// per WINDOW_SECONDS (see ../_shared/rateLimit.ts) — this is what stops a
// script that mints anonymous sessions from running up the Google bill.
// A real learner tapping the play button never comes close to this limit.

import { subFromJwt, checkRateLimit } from '../_shared/rateLimit.ts';

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GOOGLE_KEY = Deno.env.get('GOOGLE_TTS_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// Higher than stt/rag-explain: the app's own offline pre-caching
// (utils/googleTTS.ts prefetchTtsForTexts — fills the TTS cache ahead of
// an exam so playback works without a connection later) can legitimately
// burst to ~40 calls in well under a minute. 90 leaves headroom for that
// while still being far below what a script hammering this endpoint
// non-stop would need.
const MAX_REQUESTS = 90;
const WINDOW_SECONDS = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    const callerSub = subFromJwt(authHeader);
    if (!callerSub) {
      return new Response(JSON.stringify({ error: 'Missing or invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (SUPABASE_URL && ANON_KEY) {
      const allowed = await checkRateLimit({
        supabaseUrl: SUPABASE_URL,
        anonKey: ANON_KEY,
        authHeader: authHeader!,
        userId: callerSub,
        endpoint: 'tts',
        maxRequests: MAX_REQUESTS,
        windowSeconds: WINDOW_SECONDS,
      });
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests, please slow down' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Guard against abuse — reject absurdly long input
    if (text.length > 1000) {
      return new Response(JSON.stringify({ error: 'Text too long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GOOGLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let googleRes: Response;
    try {
      googleRes = await fetch(GOOGLE_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await googleRes.json();

    if (!googleRes.ok) {
      console.error('[tts] Google API error:', data);
      return new Response(JSON.stringify({ error: 'TTS provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ audioContent: data.audioContent ?? null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[tts] error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
