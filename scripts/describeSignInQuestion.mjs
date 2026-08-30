/**
 * describeSignInQuestion.mjs
 *
 * Rewrites a sign question's Amharic text so that everything the answer
 * depends on is SPOKEN, not only drawn on the sign.
 *
 * Why this exists
 * ---------------
 * Engine A serves learners who cannot read. They never see "Netanya 21" —
 * they only hear the question read aloud. Where a question says "if you want
 * to reach Netanya, what does the sign tell you?" and the correct answer is
 * "Netanya is 21 km away", a non-reader has no path to that answer: the city
 * name and the number exist only as pixels. Those questions are unanswerable
 * for the exact audience Engine A was built for.
 *
 * The fix is content-only: Gemini looks at the real sign image and rewrites
 * question_amharic so it names, in words, what is written on the sign (colour,
 * position, text, numbers) before asking. Answers, explanations, correct-answer
 * flags and every other field are left untouched — this script never writes
 * anything but question_amharic.
 *
 * Nothing is saved automatically. It prints the proposal for human approval
 * and writes it to a JSON file; applying it is a separate, deliberate step.
 *
 * Requires: GEMINI_API_KEY in .env
 *
 * Usage:
 *   node --env-file=.env scripts/describeSignInQuestion.mjs --questions 610_q3
 *   node --env-file=.env scripts/describeSignInQuestion.mjs --questions 606_q1,606_q2 --out proposal.json
 */

import { writeFileSync } from 'fs';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEY      = process.env.GEMINI_API_KEY;
const MODEL        = 'gemini-2.5-flash';
const API_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SYSTEM_INSTRUCTION = `You are an Amharic road-theory content editor for an app used by
Ethiopian learners worldwide. Many of them CANNOT READ. They hear every question
read aloud by text-to-speech; they cannot read the text printed on a road sign.

Your job: rewrite ONE question so a listener who cannot read still has everything
needed to answer it.

Rules — follow all of them:
1. Output Amharic (Ge'ez script) only. NO Latin letters anywhere in the output,
   not even inside quotes and not even when the sign itself is written in
   English or Hebrew. A road sign reading "Netanya" must be written in Ge'ez
   transliteration, never as the Latin string. This text is spoken aloud by an
   Amharic text-to-speech voice: Latin letters come out mangled.
2. Describe what is actually ON the sign in the image, in words: the colours, the
   layout (what is at the top / bottom / left / right), the text written on it,
   and any numbers. Use the exact numbers and names visible in the image.
2b. BE BRIEF. This is heard, not read — a listener has to hold it in memory until
   the question arrives. Describe ONLY the facts an answer actually turns on,
   plus the minimum layout needed to make sense of them. Do NOT inventory every
   destination, panel or number on the sign when the answers do not depend on
   them. Aim for one or two short sentences before the question — never a
   paragraph. A description longer than about twice the original question has
   almost certainly gone too far.
3. Keep the ORIGINAL QUESTION'S MEANING and what it asks. You are adding the
   visual description, not asking something different. The listed correct answer
   must remain correct, and every wrong answer must remain wrong.
4. Do not make the correct answer obvious. Describe the sign neutrally — state
   what is drawn, never which option follows from it.
5. Natural spoken Amharic, one flowing question. No bullet points, no markup,
   no quotes around the whole thing. Keep it as short as it can be while still
   describing everything the answer depends on.
6. Use the SAME wording for a number as the original text did (e.g. if the
   original wrote 2,200 keep 2,200) so the audio matches the other fields.

Return ONLY JSON:
{
  "visual_facts_used": "<English, one line: what you saw on the sign that a non-reader would otherwise miss>",
  "question_amharic": "<the rewritten Amharic question>",
  "answer_still_correct": true
}
Set answer_still_correct to false if you cannot rewrite it without changing which
answer is right — in that case explain in visual_facts_used and leave
question_amharic as the original.`;

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function fetchQuestions(ids) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=*&id=in.(${ids.join(',')})`,
    { headers: sbHeaders },
  );
  if (!res.ok) throw new Error(`questions fetch failed: ${res.status}`);
  return res.json();
}

async function fetchSign(signId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/signs?select=*&id=eq.${signId}`,
    { headers: sbHeaders },
  );
  if (!res.ok) throw new Error(`sign fetch failed: ${res.status}`);
  const [sign] = await res.json();
  return sign;
}

/** Pull the sign image straight from Storage — the exact bytes the app shows. */
async function loadSignImage(sign) {
  if (!sign?.image_url) return null;
  const res = await fetch(sign.image_url);
  if (!res.ok) return null;
  const buf  = Buffer.from(await res.arrayBuffer());
  const mime = sign.image_url.match(/\.jpe?g(\?|$)/i) ? 'image/jpeg' : 'image/png';
  return { base64: buf.toString('base64'), mime };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(question, sign) {
  const answers = question.answers
    .map(a => `  ${a.id}. ${a.text_amharic}${a.is_correct ? '   <-- THE CORRECT ANSWER' : ''}`)
    .join('\n');

  return `The attached image is the road sign this question is about.

SIGN: ${sign.id}
SIGN MEANING (Amharic, for your context only — do not copy it):
${sign.explanation_amharic}

CURRENT QUESTION (Amharic):
${question.question_amharic}

THE FOUR ANSWERS AS SHOWN TO THE LEARNER:
${answers}

Rewrite the question so a listener who cannot read the sign still has every fact
the correct answer depends on. Look at the image and say what is on it.`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(question, sign, image, attempt = 1) {
  const textPart  = { text: buildPrompt(question, sign) };
  const userParts = image
    ? [{ inline_data: { mime_type: image.mime, data: image.base64 } }, textPart]
    : [textPart];

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  };

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return callGemini(question, sign, image, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from Gemini: ${raw.slice(0, 200)}`);
  }
  if (!parsed.question_amharic) {
    throw new Error(`Missing question_amharic: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  return parsed;
}

// ─── Guards on what came back ─────────────────────────────────────────────────

/**
 * Any Latin letter at all is a defect here. Two separate failure modes:
 *   - Ge'ez and Latin fused inside one word — the old half-transliterated
 *     place-name bug.
 *   - A whole Latin word left standing, e.g. faithfully quoting a sign that
 *     reads "Netanya" in English. It is surrounded by spaces, so a
 *     fused-only check sails right past it, yet the Amharic TTS voice
 *     mangles it exactly the same.
 * Refusing Latin outright catches both.
 */

function validate(proposal, question) {
  const problems = [];
  if (proposal.answer_still_correct === false) {
    problems.push('Gemini says it could not rewrite without changing the right answer');
  }
  const latin = proposal.question_amharic.match(/[A-Za-z][A-Za-z\-']*/g);
  if (latin) {
    const found = [...new Set(latin)].join(', ');
    problems.push(`Latin letters in the Amharic text — TTS mangles these: ${found}`);
  }
  if (proposal.question_amharic.trim() === question.question_amharic.trim()) {
    problems.push('unchanged from the original');
  }
  // The prompt asks for roughly one or two added sentences. Questions here start
  // as short as 24 characters, so a ratio alone would flag every rewrite of a
  // terse question; an absolute ceiling is what actually tracks "too long to
  // hold in your head" — ~250 characters is about 20 seconds of Amharic TTS.
  if (proposal.question_amharic.length > 250) {
    problems.push(`${proposal.question_amharic.length} characters — likely too long to follow by ear`);
  }
  return problems;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    questionIds: (get('--questions') || '').split(',').map(s => s.trim()).filter(Boolean),
    out:         get('--out'),
  };
}

async function main() {
  if (!API_KEY)      { console.error('❌  GEMINI_API_KEY is not set in .env'); process.exit(1); }
  if (!SERVICE_KEY)  { console.error('❌  SUPABASE_SERVICE_ROLE_KEY is not set in .env'); process.exit(1); }

  const { questionIds, out } = parseArgs();
  if (!questionIds.length) {
    console.error('❌  pass --questions 610_q3[,606_q1,...]');
    process.exit(1);
  }

  const questions = await fetchQuestions(questionIds);
  const byId      = Object.fromEntries(questions.map(q => [q.id, q]));
  const proposals = [];

  for (const id of questionIds) {
    const question = byId[id];
    if (!question) { console.error(`❌  ${id} not found in the database`); continue; }

    const sign  = await fetchSign(question.sign_id);
    const image = await loadSignImage(sign);

    console.log('══════════════════════════════════════════════════════');
    console.log(`${id}  |  ${question.sign_id}  |  ${question.topic_id}`);
    console.log(`תמונה: ${image ? 'נטענה ✅' : 'לא נמצאה ⚠️  (Gemini יעבוד בלי לראות את השלט)'}`);
    console.log('');

    const proposal = await callGemini(question, sign, image);
    const problems = validate(proposal, question);

    console.log(`מה Gemini ראה בשלט: ${proposal.visual_facts_used}`);
    console.log('');
    console.log('לפני: ' + question.question_amharic);
    console.log('אחרי: ' + proposal.question_amharic);
    if (problems.length) {
      console.log('');
      problems.forEach(p => console.log('  ⚠️  ' + p));
    }
    console.log('');

    proposals.push({
      id,
      sign_id:  question.sign_id,
      topic_id: question.topic_id,
      before:   question.question_amharic,
      after:    proposal.question_amharic,
      visual_facts_used: proposal.visual_facts_used,
      problems,
      question_audio_url: question.question_audio_url,
    });
  }

  const path = out || 'question_rewrite_proposal.json';
  writeFileSync(path, JSON.stringify(proposals, null, 2), 'utf8');
  console.log(`נשמר ל: ${path}  (${proposals.length} הצעות — לא הוחל שום שינוי)`);
  const flagged = proposals.filter(p => p.problems.length).length;
  if (flagged) console.log(`⚠️  ${flagged} הצעות עם הערות — לבדוק לפני אישור`);
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1); });
