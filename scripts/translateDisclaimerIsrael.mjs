/**
 * scripts/translateDisclaimerIsrael.mjs
 *
 * The disclaimer (components/shared/DisclaimerModal.tsx) names Israel twice: sentence 2
 * of section 1 and sentence 2 of section 2. The owner decided (2026-10-25) to soften
 * both, keeping the truth (part of the material comes from Israel) while not sounding
 * Israel-only. ONLY those two sentences change; every other sentence stays exactly as is.
 *
 * This script asks Gemini for 3 options per sentence, prints them next to the current
 * sentence, and SAVES them to planning/disclaimer-israel/options.json so the next script
 * (applyDisclaimerSentences.mjs) can use the owner's pick without anyone retyping Amharic.
 *
 * Usage:
 *   node --env-file=.env scripts/translateDisclaimerIsrael.mjs
 *   node --env-file=.env scripts/translateDisclaimerIsrael.mjs --only=s2
 *     (asks again for ONE sentence only and keeps the other one's saved options)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODAL   = path.join(ROOT, 'components', 'shared', 'DisclaimerModal.tsx');
const OUT_DIR = path.join(ROOT, 'planning', 'disclaimer-israel');
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

if (!API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translateDisclaimerIsrael.mjs');
  process.exit(1);
}

const bodies = [...fs.readFileSync(MODAL, 'utf8').matchAll(/body:\s+'([^']*)'/g)].map(m => m[1]);
const sentencesOf = body => body.split('።').map(s => s.trim()).filter(Boolean);
const current1 = sentencesOf(bodies[0]);
const current2 = sentencesOf(bodies[1]);
if (current1.length !== 3 || current2.length !== 3) {
  console.error('❌ The disclaimer no longer has 3 sentences in sections 1 and 2. Stop and ask Claude Code.');
  process.exit(1);
}

const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').split('=')[1] || null;
const WHOLE_TEXT = bodies.join(String.fromCharCode(10));

const SHARED_CONTEXT = `
This is one sentence of the Terms of Use shown (and read aloud) on first launch of a
driving-theory learning app used by Amharic speakers around the world, including people
with very basic literacy. Requirements:
- Amharic (Ge'ez script) only. One sentence. Do NOT end it with a full stop mark.
- Simple, everyday words, the same register and the same terms as the CURRENT sentence
  below (for example keep the same wording for "Vienna Convention").
- Do NOT use phonetic transliterations of English words.
- TERMINOLOGY MUST MATCH THE REST OF THE DOCUMENT EXACTLY: use the very same word the
  document already uses for "the app/application" and the very same spelling it uses
  for "country". Do not switch to a synonym or another spelling. The full current text
  of the document is at the end of this prompt for that purpose.
- It must be honest: part of the material really does come from Israel.
- Provide 3 DIFFERENT phrasings so a reviewer can pick the clearest one.
Reply with ONLY the 3 sentences, one per line, no numbering, no quotes, no explanation.
`;

const ITEMS = [
  {
    key: 's1',
    section: 1,
    current: current1[1],
    hebrew: 'התוכן מבוסס על אמנת וינה הבינלאומית ועל חומרים רשמיים של משרדי תחבורה, כולל של ישראל.',
    note: 'Israel is named ONCE, as one of the sources, after the Vienna Convention. Not "based on Israeli rules".',
  },
  {
    key: 's2',
    section: 2,
    current: current2[1],
    hebrew: 'ייתכנו הבדלים בין הכללים באפליקציה לבין הכללים במדינה שלך.',
    note: 'Do NOT name any country. Say the rules in this app may differ from the rules of the reader\'s own country.',
  },
];

function characterCheck(text) {
  const bad = [...text].filter(ch => {
    const cp = ch.codePointAt(0);
    return !(cp >= 0x1200 && cp <= 0x137F) && cp >= 128;
  });
  return bad.length ? [...new Set(bad)].map(ch => `${ch} U+${ch.codePointAt(0).toString(16).toUpperCase()}`).join(', ') : 'clean';
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const OPTIONS_FILE = path.join(OUT_DIR, 'options.json');
const saved = ONLY && fs.existsSync(OPTIONS_FILE) ? JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8')) : {};
if (ONLY && !ITEMS.some(i => i.key === ONLY)) { console.error('❌ --only must be s1 or s2'); process.exit(1); }

for (const it of ITEMS.filter(i => !ONLY || i.key === ONLY)) {
  const prompt = `Translate this Hebrew sentence into Amharic.

Hebrew source:
${it.hebrew}

CURRENT Amharic sentence (for style and terminology only, it is being replaced):
${it.current}

Specific to this sentence: ${it.note}
${SHARED_CONTEXT}
FULL CURRENT TEXT OF THE DOCUMENT (terminology reference only):
${WHOLE_TEXT}`;
  const res = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) { console.error(`❌ Gemini failed for ${it.key}:`, res.status, await res.text()); process.exit(1); }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  const options = text.split('\n')
    .map(l => l.trim().replace(/^[-*\d.)\s]+/, '').replace(/[።.\s]+$/, '').trim())
    .filter(Boolean).slice(0, 3);
  if (options.length < 1) { console.error(`❌ Empty answer for ${it.key}`); process.exit(1); }
  saved[it.key] = { current: it.current, options };

  console.log('═'.repeat(60));
  console.log(`SECTION ${it.section}, sentence 2   (Hebrew meaning: ${it.hebrew})`);
  console.log('');
  console.log(`CURRENT: ${it.current}`);
  console.log('');
  options.forEach((o, i) => {
    const c = characterCheck(o);
    console.log(`${i + 1}. ${o}`);
    console.log(`   ${o.length} characters | ${c === 'clean' ? 'clean (Ethiopic only)' : '⚠️  ' + c}`);
    console.log('');
  });
}

fs.writeFileSync(OPTIONS_FILE, JSON.stringify(saved, null, 2), 'utf8');
console.log('✅ Options saved to planning/disclaimer-israel/options.json (the apply script reads them from there).');
