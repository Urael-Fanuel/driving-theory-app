/**
 * scripts/translatePrivacyOptionsLabel.mjs
 *
 * Translates the label of the "ad privacy choices" button (shown only to users in
 * the EU / UK / Switzerland, see services/adsConsent.ts) to Amharic via Gemini and
 * prints 3 options, labeled. UI text is authored by Gemini, never by hand. The
 * user runs it and picks one before it is wired into the app.
 *
 * Usage:
 *   node --env-file=.env scripts/translatePrivacyOptionsLabel.mjs
 */

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ─── Shared context for every string below ────────────────────────────────────

const SHARED_CONTEXT = `
This is the label of a small button on the Progress screen of a driving-theory
learning app used by Ethiopian speakers, including people with very basic
literacy and no technical background. The button opens Google's own form where the
user can change what they agreed to about advertising and personal data (it is
shown only to users in Europe, where the law requires it).

General requirements:
- Amharic (Ge'ez script) only.
- Simple, everyday spoken words. Not formal or literary.
- Do NOT use phonetic transliterations of English words.
- Very short: 2 to 4 words, it must fit on one line next to an icon.
- Provide 3 DIFFERENT phrasings so a reviewer can pick the clearest one.
`;

// ─── What to translate ────────────────────────────────────────────────────────

const STRINGS = [
  {
    key: 'PRIVACY_OPTIONS_LABEL',
    hebrew: 'אפשרויות פרטיות למודעות',
    context: 'Button label: the place to change my choices about ads and my personal data.',
  },
];

// ─── Run ──────────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translatePrivacyOptionsLabel.mjs');
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
