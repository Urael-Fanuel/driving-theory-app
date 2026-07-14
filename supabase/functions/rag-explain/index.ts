// supabase/functions/rag-explain/index.ts
// RAG-powered "explain why" for wrong quiz answers.
//
// Input:  { question, wrong_answer, correct_answer }  (Amharic strings)
// Output: { explanation }                             (short Amharic text)
//
// Flow: embed the question (gemini-embedding-001, 768 dims) → find the top
// matching chunks in rag_chunks via match_rag_chunks → ask gemini-2.5-flash
// to explain, grounded ONLY in those chunks.
//
// The Gemini API key lives ONLY here (as a Supabase secret) — never in the app.
// Auth: Supabase verifies the caller's JWT before this code runs.

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const EMBED_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`;
const GENERATE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

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
    const { question, wrong_answer, correct_answer } = await req.json();

    if (
      typeof question !== 'string' || !question.trim() ||
      typeof wrong_answer !== 'string' || !wrong_answer.trim() ||
      typeof correct_answer !== 'string' || !correct_answer.trim()
    ) {
      return json({ error: 'Missing question / wrong_answer / correct_answer' }, 400);
    }
    // Guard against abuse — reject absurdly long input
    if (question.length > 500 || wrong_answer.length > 300 || correct_answer.length > 300) {
      return json({ error: 'Input too long' }, 400);
    }

    if (!GEMINI_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    // 1. Embed the question + correct answer as the retrieval query
    const embedRes = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: `${question}\n${correct_answer}` }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    });
    if (!embedRes.ok) {
      console.error('[rag-explain] embed error:', await embedRes.text());
      return json({ error: 'Embedding provider error' }, 502);
    }
    const embedData = await embedRes.json();
    const embedding: number[] = embedData?.embedding?.values ?? [];
    if (embedding.length !== 768) {
      return json({ error: 'Bad embedding' }, 502);
    }

    // 2. Retrieve top matching chunks
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_rag_chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query_embedding: embedding, match_count: 3 }),
    });
    if (!rpcRes.ok) {
      console.error('[rag-explain] rpc error:', await rpcRes.text());
      return json({ error: 'Retrieval error' }, 502);
    }
    const chunks: Array<{ title_amharic: string; content_amharic: string; similarity: number }> =
      await rpcRes.json();

    const context = chunks
      .map((c, i) => `[${i + 1}] ${c.content_amharic}`)
      .join('\n\n');

    // 3. Generate the explanation, grounded in the retrieved material
    const prompt =
      `You are a kind driving-theory tutor for Ethiopian adult learners. ` +
      `A student answered a quiz question incorrectly.\n\n` +
      `REFERENCE MATERIAL (the only source of truth):\n${context}\n\n` +
      `QUESTION: ${question}\n` +
      `THE STUDENT'S WRONG ANSWER: ${wrong_answer}\n` +
      `THE CORRECT ANSWER: ${correct_answer}\n\n` +
      `TASK: Explain in SIMPLE Amharic (2-4 short sentences) why the correct answer ` +
      `is right, and why the student's choice is wrong. Base yourself ONLY on the ` +
      `reference material. If the material does not cover it, explain from the ` +
      `question itself without inventing facts.\n` +
      `STRICT RULES: Amharic only (Ge'ez script). No markdown, no bullet points, ` +
      `no English words, no country names. Plain flowing sentences suitable for ` +
      `being read aloud by text-to-speech. NEVER mention the reference material, ` +
      `its numbering, or that you were given any material — speak as a teacher ` +
      `who simply knows the answer. Do not greet or thank the student; start ` +
      `directly with the explanation.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let genRes: Response;
    try {
      genRes = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const genData = await genRes.json();
    if (!genRes.ok) {
      console.error('[rag-explain] generate error:', genData);
      return json({ error: 'LLM provider error' }, 502);
    }

    const explanation: string =
      genData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!explanation) {
      return json({ error: 'Empty explanation' }, 502);
    }

    return json({ explanation });
  } catch (err) {
    console.error('[rag-explain] error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});
