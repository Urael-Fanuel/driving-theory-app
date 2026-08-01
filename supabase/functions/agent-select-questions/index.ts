// supabase/functions/agent-select-questions/index.ts
//
// The "decide" + "act" steps of the learning agent's loop: given a user,
// pick which sign-based questions to show them next, instead of the
// current getRandomExamQuestions()'s uniform-random pick. Every candidate
// question is scored by how likely THIS user is to answer it correctly
// (via the ELO model in ../_shared/elo.ts, using this user's per-topic
// ability and each question's learned difficulty), and the ones closest to
// a 70% predicted success rate are preferred — hard enough to be worth
// practicing, not so hard it's discouraging.
//
// NOT wired into the app yet — api.ts's getRandomExamQuestions() is
// untouched and the exam still works exactly as it does today. This
// function is additive and independently testable; swapping the client
// over to call it is a separate, later step.
//
// Scope note: this selects only SIGN-based questions (the ones with a real
// row in `questions`, which is what question_difficulty's foreign key
// requires). Behavioral questions live in local JSON with no DB row and no
// ELO tracking, so the app would still add those ~8 separately, same as
// getRandomExamQuestions() does today — pass count = (total wanted) minus
// however many behavioral questions the caller will add.
//
// Auth: same pattern as agent-record-answer — platform-level verify_jwt,
// plus an explicit check that the JWT's `sub` matches the requested
// user_id. Every read/write here uses the service-role key (this function
// IS the privileged operation; there is no per-row RLS check to defer to
// because question_difficulty/user_ability/agent_decisions are locked to
// service-role only by design).

import { expectedCorrect, desirability, ELO_DEFAULT_RATING } from '../_shared/elo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const POLICY_VERSION = 'elo-v1';
const TARGET_SUCCESS_RATE = 0.7;
// Same fixed id seeded in backend/migration_agent_platform.sql. Unlike the
// RPCs (which default this parameter server-side), a raw table INSERT has
// no default to fall back on — omitting it here was caught as a real bug
// during testing (23502 not-null violation on agent_decisions.app_id).
const DEFAULT_APP_ID = '678d1968-f21e-4d02-aa96-463eb4dddd6b';

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

/** See agent-record-answer/index.ts for why decoding without verifying is safe here. */
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

interface QuestionRow {
  id: string;
  sign_id: string | null;
  topic_id: string;
  question_amharic: string;
  question_audio_url: string | null;
  answers: unknown; // JSONB array — passed through untouched, the client already knows its shape
  explanation_correct_amharic: string;
  explanation_wrong_amharic: string;
  explanation_correct_audio_url: string | null;
  explanation_wrong_audio_url: string | null;
  difficulty: number; // legacy 1/2/3 field on `questions` — NOT the ELO rating, kept for shape compatibility
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    const authHeader = req.headers.get('authorization');
    const callerSub  = subFromJwt(authHeader);
    if (!callerSub) {
      return json({ error: 'Missing or invalid auth token' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const user_id: unknown = body.user_id;
    const count: number    = Number.isFinite(body.count) ? Math.max(1, Math.min(200, body.count)) : 22;

    if (typeof user_id !== 'string' || !user_id) {
      return json({ error: 'Missing user_id' }, 400);
    }
    if (callerSub !== user_id) {
      return json({ error: 'user_id does not match the authenticated caller' }, 403);
    }

    const svcHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    const [qRes, diffRes, abilityRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=id,sign_id,topic_id,question_amharic,question_audio_url,answers,explanation_correct_amharic,explanation_wrong_amharic,explanation_correct_audio_url,explanation_wrong_audio_url,difficulty`,
        { headers: svcHeaders }
      ),
      fetch(`${SUPABASE_URL}/rest/v1/question_difficulty?select=question_id,difficulty`, { headers: svcHeaders }),
      fetch(
        `${SUPABASE_URL}/rest/v1/user_ability?user_id=eq.${encodeURIComponent(user_id)}&select=topic_id,ability`,
        { headers: svcHeaders }
      ),
    ]);

    if (!qRes.ok || !diffRes.ok || !abilityRes.ok) {
      console.error(
        '[agent-select-questions] read failed',
        await qRes.text().catch(() => ''),
        await diffRes.text().catch(() => ''),
        await abilityRes.text().catch(() => '')
      );
      return json({ error: 'Failed to read questions/ratings' }, 502);
    }

    const allQuestions: QuestionRow[] = await qRes.json();
    const difficultyRows: Array<{ question_id: string; difficulty: number }> = await diffRes.json();
    const abilityRows: Array<{ topic_id: string | null; ability: number }>   = await abilityRes.json();

    const difficultyByQuestion = new Map(difficultyRows.map(r => [r.question_id, r.difficulty]));
    const abilityByTopic       = new Map(abilityRows.filter(r => r.topic_id !== null).map(r => [r.topic_id as string, r.ability]));

    // Same "outdated 3-answer format" filter api.ts already applies.
    // sign_id !== null excludes behavioral questions (registered in `questions`
    // by scripts/registerBehavioralQuestions.ts so progress/agent tracking has
    // a row to reference — see backend/migration_behavioral_questions.sql).
    // The app already adds its fixed set of behavioral questions itself from
    // local JSON; without this filter they would be selected here too and
    // shown twice, same bug this exact filter fixed in get_random_questions.
    const eligible = allQuestions.filter(
      q => q.sign_id !== null && Array.isArray(q.answers) && (q.answers as unknown[]).length >= 4
    );
    if (eligible.length === 0) {
      return json({ error: 'No eligible questions found' }, 404);
    }

    // Group by topic so the final set stays balanced across topics —
    // mirrors get_random_questions' proportional allocation.
    const byTopic = new Map<string, QuestionRow[]>();
    for (const q of eligible) {
      const list = byTopic.get(q.topic_id);
      if (list) list.push(q); else byTopic.set(q.topic_id, [q]);
    }

    const totalEligible = eligible.length;
    const perTopicAllocation: Record<string, number> = {};
    const pooled: Array<{ q: QuestionRow; pCorrect: number }> = [];

    for (const [topicId, topicQuestions] of byTopic) {
      const allocated = Math.max(1, Math.ceil((count * topicQuestions.length) / totalEligible));
      perTopicAllocation[topicId] = allocated;

      const topicAbility = abilityByTopic.get(topicId) ?? ELO_DEFAULT_RATING;

      const scored = topicQuestions.map(q => {
        const qDifficulty = difficultyByQuestion.get(q.id) ?? ELO_DEFAULT_RATING;
        const pCorrect = expectedCorrect(topicAbility, qDifficulty);
        // Small random jitter so the same "closest to target" question isn't
        // shown every single time once ratings settle down.
        const jitter = (Math.random() - 0.5) * 0.05;
        return { q, pCorrect, score: desirability(pCorrect, TARGET_SUCCESS_RATE) + jitter };
      });

      scored.sort((a, b) => b.score - a.score);
      for (const { q, pCorrect } of scored.slice(0, allocated)) {
        pooled.push({ q, pCorrect });
      }
    }

    // Final shuffle + trim to exactly `count` — same two-step
    // (over-allocate per topic, then shuffle+limit) as get_random_questions.
    for (let i = pooled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pooled[i], pooled[j]] = [pooled[j], pooled[i]];
    }
    const selected = pooled.slice(0, count);

    const meanExpectedCorrect =
      selected.reduce((sum, s) => sum + s.pCorrect, 0) / (selected.length || 1);

    // Log the decision — this IS the "why did the agent choose this"
    // record a project review can point at.
    const decisionRes = await fetch(`${SUPABASE_URL}/rest/v1/agent_decisions`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        app_id: DEFAULT_APP_ID,
        user_id,
        policy_version: POLICY_VERSION,
        selected_question_ids: selected.map(s => s.q.id),
        rationale: {
          targetSuccessRate: TARGET_SUCCESS_RATE,
          perTopicAllocation,
          meanExpectedCorrect,
          requestedCount: count,
        },
      }),
    });
    if (!decisionRes.ok) {
      // Non-fatal — the selection itself still succeeded and should reach
      // the user; losing the audit log entry is a warning, not a failure.
      console.warn('[agent-select-questions] failed to log decision', await decisionRes.text());
    }

    return json({
      questions: selected.map(s => s.q),
      policyVersion: POLICY_VERSION,
      meanExpectedCorrect,
    });
  } catch (err) {
    console.error('[agent-select-questions] error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});
