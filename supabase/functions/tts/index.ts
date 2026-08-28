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
// Higher than stt/rag-explain because the app's own offline pre-caching
// (utils/googleTTS.ts prefetchTtsForTexts — fills the TTS cache ahead of an
// exam so playback works without a connection later) legitimately bursts in
// well under a minute.
//
// ⚠️ SIZE THIS AGAINST BEHAVIORAL_EXAM_COUNT. One exam prefetches
// (behavioral questions) x (1 question + 4 answers) texts. This was set to 90
// when BEHAVIORAL_EXAM_COUNT was 8 (= 40 calls, comfortable). Raising the
// count to 21 on 2026-08-17 took one exam to 105 calls — over the cap, so the
// last ~15 texts were rejected, never cached, and those questions played no
// feedback audio at all. If BEHAVIORAL_EXAM_COUNT changes again, recompute
// this number.
//   21 questions x 5 texts   = 105 prefetch calls
//   + live calls during play, retries, and a second exam started soon after
//   => 250 gives real headroom while still bounding what a script that mints
//      anonymous sessions can cost per account per minute.
const MAX_REQUESTS = 250;
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
