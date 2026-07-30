/**
 * scripts/translateUiStringWithGemini.mjs
 *
 * Translates a single short UI string to Amharic via Gemini and prints it.
 *
 * Exists because app UI text must be authored by Gemini, never hand-written —
 * a single wrong Ge'ez letter has slipped in that way before. Claude edits the
 * STRING_TO_TRANSLATE constant below; the user runs the script and approves the
 * output before it is wired into the app.
 *
 * Usage:
 *   node --env-file=.env scripts/translateUiStringWithGemini.mjs
 */

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ─── What to translate ────────────────────────────────────────────────────────

const STRING_TO_TRANSLATE = 'אין אינטרנט. ההתקדמות תיסנכרן כשתתחבר.';

/** Where it will be used — helps Gemini pick the right register and length. */
const USAGE_CONTEXT = `
This is a short notification banner in a driving-theory learning app used by
Ethiopian speakers. It appears at the top of the screen the moment the phone
loses internet connectivity.

Its purpose: reassure the user that the app is NOT broken and that they can keep
studying, and tell them their progress will be saved to the server once they
reconnect.

Requirements:
- Amharic (Ge'ez script) only.
- Must fit on one or two short lines in a banner — keep it brief.
- Calm and reassuring in tone, NOT an error or alarm.
- Do NOT tell the user to press any button, and do NOT tell them to stop or come
  back later. They can continue using the app right now.
- Use standard Amharic words. Do NOT use phonetic transliterations of English
  words.
- CRITICAL — simplicity: the audience includes people with very basic literacy
  and no technical background. A first attempt at this translation came back
  as "እድገትዎ ሲገናኙ ይዘምናል" (your progress will update when you connect) and was
  rejected by a native-speaker reviewer as NOT clear or understandable enough —
  too formal/literary a construction for an everyday app notice.
  Use the simplest, most everyday spoken words a person would actually say out
  loud to a friend, not formal or literary Amharic. Avoid abstract nouns like
  "progress" (እድገት) if a plainer phrasing exists — e.g. describing what the app
  will DO ("save it", "not lose it") rather than naming an abstract concept
  ("your progress"). Prefer short, concrete, spoken-register sentences.
- Provide 3 DIFFERENT phrasings (not minor variations of the same sentence) so
  a reviewer can pick the clearest one.
`;

// ─── Run ──────────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translateUiStringWithGemini.mjs');
  process.exit(1);
}

const prompt = `Translate the following Hebrew UI string into Amharic.

Hebrew source:
${STRING_TO_TRANSLATE}

Context and constraints:
${USAGE_CONTEXT}

Reply with ONLY the Amharic translation as a single line of plain text.
No quotes, no explanation, no transliteration, no alternatives.`;

const res = await fetch(API_URL, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
});

if (!res.ok) {
  console.error('❌ Gemini request failed:', res.status, await res.text());
  process.exit(1);
}

const data      = await res.json();
const amharic   = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

if (!amharic) {
  console.error('❌ Empty response from Gemini.');
  process.exit(1);
}

console.log('');
console.log('Hebrew source:');
console.log(`  ${STRING_TO_TRANSLATE}`);
console.log('');

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

// Gemini is asked for several phrasings — list them separately so they are easy
// to compare, and strip any numbering it added itself.
const options = amharic
  .split('\n')
  .map(l => l.trim().replace(/^[-*\d.)\s]+/, '').trim())
  .filter(Boolean);

console.log('[AMHARIC]');
options.forEach((opt, i) => {
  const check = characterCheck(opt);
  console.log('');
  console.log(`${i + 1}. ${opt}`);
  console.log(`   ${opt.length} characters | characters: ${check === 'clean' ? 'clean (Ethiopic only)' : '⚠️  ' + check}`);
});
console.log('');
