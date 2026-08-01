/**
 * scripts/translateUiStringWithGemini.mjs
 *
 * Translates one or more short UI strings to Amharic via Gemini and prints
 * them, labeled.
 *
 * Exists because app UI text must be authored by Gemini, never hand-written —
 * a single wrong Ge'ez letter has slipped in that way before. Claude edits
 * the STRINGS array below; the user runs the script and approves the output
 * before it is wired into the app.
 *
 * Usage:
 *   node --env-file=.env scripts/translateUiStringWithGemini.mjs
 */

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ─── Shared context for every string below ────────────────────────────────────

const SHARED_CONTEXT = `
This is the "priming" screen shown ONCE (before the real OS location-permission
dialog) in a driving-theory learning app used by Ethiopian speakers, including
people with very basic literacy and no technical background. Its purpose:
explain, in a friendly and specific way, that approving location lets the app
show recommendations for local businesses (driving instructors first; other
business categories later) near wherever the user currently is.

General requirements for every string:
- Amharic (Ge'ez script) only.
- Simple, everyday spoken words — the audience includes non-readers who will
  hear this read aloud by TTS, not just read it. Avoid formal/literary
  register (see the lesson already learned on a previous string: a first
  attempt using the word "እድገት" progress was rejected as too literary/unclear
  for this audience — prefer concrete, spoken phrasing throughout).
- Do NOT use phonetic transliterations of English words.
- Honest framing: this is about advertising/business recommendations by
  location, not vague "improving your experience" language.
- Provide 3 DIFFERENT phrasings per string (not minor variations) so a
  reviewer can pick the clearest one.
`;

// ─── What to translate ────────────────────────────────────────────────────────

const STRINGS = [
  {
    key: 'PRIMER_TITLE',
    hebrew: 'הצעות מותאמות בשבילך',
    context: 'Short heading at the top of the screen, a few words only.',
  },
  {
    key: 'PRIMER_BODY',
    hebrew:
      'אשר מיקום ותקבל המלצות על מורי נהיגה סבלניים ומקצועיים, ' +
      'ועסקים אחרים שיכולים לעזור לך — קרוב אליך, איפה שאתה נמצא.',
    context: 'One or two sentences of body text below the heading, explaining the benefit.',
  },
  {
    key: 'PRIMER_APPROVE_BUTTON',
    hebrew: 'כן, הראה לי הצעות קרובות',
    context: 'The main, positive call-to-action button. Short — must fit on one line on a button.',
  },
  {
    key: 'PRIMER_LATER_BUTTON',
    hebrew: 'אולי מאוחר יותר',
    context: 'The secondary, low-friction dismiss button below the main one. Very short.',
  },
];

// ─── Run ──────────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translateUiStringWithGemini.mjs');
  process.exit(1);
}

/** Flag anything outside Ethiopic / ASCII — catches stray Arabic or Latin
 *  lookalikes, which is exactly how a bad character has slipped through before. */
function characterCheck(text) {
  const suspicious = [...text].filter(ch => {
    const cp = ch.codePointAt(0);
    const isEthiopic = cp >= 0x1200 && cp <= 0x137F;
    const isAscii    = cp < 128;
    return !isEthiopic && !isAscii;
  });
  if (!suspicious.length) return 'clean';
  return [...new Set(suspicious)]
    .map(ch => `${ch} U+${ch.codePointAt(0).toString(16).toUpperCase()}`)
    .join(', ');
}

async function translateOne({ key, hebrew, context }) {
  const prompt = `Translate the following Hebrew UI string into Amharic.

Hebrew source:
${hebrew}

Context and constraints:
${SHARED_CONTEXT}
Specific to this string: ${context}

Reply with ONLY the 3 Amharic phrasings, one per line, no numbering, no quotes,
no explanation, no transliteration.`;

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) {
    console.error(`❌ Gemini request failed for ${key}:`, res.status, await res.text());
    return;
  }

  const data    = await res.json();
  const amharic = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

  if (!amharic) {
    console.error(`❌ Empty response from Gemini for ${key}.`);
    return;
  }

  const options = amharic
    .split('\n')
    .map(l => l.trim().replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);

  console.log('═'.repeat(60));
  console.log(`[${key}]`);
  console.log(`Hebrew: ${hebrew}`);
  console.log('');
  options.forEach((opt, i) => {
    const check = characterCheck(opt);
    console.log(`${i + 1}. ${opt}`);
    console.log(`   ${opt.length} characters | ${check === 'clean' ? 'clean (Ethiopic only)' : '⚠️  ' + check}`);
    console.log('');
  });
}

for (const s of STRINGS) {
  await translateOne(s);
}
