// supabase/functions/agent-record-answer/index.ts
//
// Feeds one answered question into the learning agent. This is the "learns"
// step of the sense → analyze → decide → act → learn loop: every call moves
// the question's difficulty rating and the user's per-topic ability rating,
// using the ELO formulas in ../_shared/elo.ts (the one place that math lives).
//
// NOT wired into the app yet. The app's existing answer-saving path
// (backend/api.ts saveAnswer → upsert_user_progress RPC) is untouched and
// keeps working exactly as it does today for the current testers — calling
// this function is a separate, additive step the client can start doing
// alongside that, once that wiring is explicitly approved.
//
// Auth: Supabase verifies the caller's JWT before this code runs (verify_jwt,
// default Edge Function behavior). On top of that, this function ALSO checks
// that the JWT's `sub` matches the user_id in the request body — the platform
// check alone only proves "some signed-in user called this", not "this user
// called it about themselves". Reads of the current ratings use the
// service-role key (server-side only, never reaches the client); the final
// write goes through record_agent_answer(), which re-validates auth.uid() —
// same defense-in-depth pattern as every other RPC in this project.

import { updateElo, ELO_DEFAULT_RATING } from '../_shared/elo.ts';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

/**
 * Reads the `sub` claim out of a JWT WITHOUT verifying its signature.
 * Safe here specifically because Supabase's platform-level verify_jwt has
 * already checked the signature before this function ever runs — this is
 * only extracting a claim from an already-trusted token, not doing auth
 * itself.
 */
function subFromJwt(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64, then pad to a multiple of 4 — JWT payloads omit
    // padding, and atob() throws on unpadded input whenever the payload
    // length isn't already a multiple of 4 (true for most real tokens).
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    const authHeader = req.headers.get('authorization');
    const callerSub  = subFromJwt(authHeader);
    if (!callerSub) {
      return json({ error: 'Missing or invalid auth token' }, 401);
    }

    const { user_id, question_id, topic_id, is_correct } = await req.json();

    if (
      typeof user_id !== 'string' ||
      typeof question_id !== 'string' || !question_id.trim() ||
      typeof topic_id !== 'string' || !topic_id.trim() ||
      typeof is_correct !== 'boolean'
    ) {
      return json({ error: 'Missing/invalid user_id, question_id, topic_id, or is_correct' }, 400);
    }
    if (callerSub !== user_id) {
      return json({ error: 'user_id does not match the authenticated caller' }, 403);
    }

    const svcHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    // Read current ratings server-side. Missing rows mean "never seen
    // before" — start from the shared default, exactly as if a row already
    // existed with 0 attempts.
    const [qRes, aRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/question_difficulty?question_id=eq.${encodeURIComponent(question_id)}&select=difficulty,attempts`,
        { headers: svcHeaders }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/user_ability?user_id=eq.${encodeURIComponent(user_id)}&topic_id=eq.${encodeURIComponent(topic_id)}&select=ability,attempts`,
        { headers: svcHeaders }
      ),
    ]);

    if (!qRes.ok || !aRes.ok) {
      console.error('[agent-record-answer] read failed', await qRes.text().catch(() => ''), await aRes.text().catch(() => ''));
      return json({ error: 'Failed to read current ratings' }, 502);
    }

    const qRows: Array<{ difficulty: number; attempts: number }> = await qRes.json();
    const aRows: Array<{ ability: number; attempts: number }>    = await aRes.json();

    const questionDifficulty = qRows[0]?.difficulty ?? ELO_DEFAULT_RATING;
    const questionAttempts   = qRows[0]?.attempts    ?? 0;
    const userAbility        = aRows[0]?.ability      ?? ELO_DEFAULT_RATING;
    const userAttempts       = aRows[0]?.attempts     ?? 0;

    const { newAbility, newDifficulty, expectedCorrectBefore } = updateElo({
      userAbility,
      userAttempts,
      questionDifficulty,
      questionAttempts,
      isCorrect: is_correct,
    });

    // Write with the CALLER's own JWT forwarded (not the service key), so
    // record_agent_answer()'s internal auth.uid() = p_user_id check is
    // validating the real user, not this Edge Function acting as an admin.
    const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_agent_answer`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: authHeader!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: user_id,
        p_question_id: question_id,
        p_topic_id: topic_id,
        p_is_correct: is_correct,
        p_new_difficulty: newDifficulty,
        p_new_ability: newAbility,
      }),
    });

    if (!writeRes.ok) {
      console.error('[agent-record-answer] write failed', await writeRes.text());
      return json({ error: 'Failed to record update' }, 502);
    }

    return json({
      ok: true,
      newAbility,
      newDifficulty,
      expectedCorrectBefore,
    });
  } catch (err) {
    console.error('[agent-record-answer] error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});
