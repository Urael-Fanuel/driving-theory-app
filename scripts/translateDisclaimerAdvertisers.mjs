/**
 * scripts/translateDisclaimerAdvertisers.mjs
 *
 * Section 3 of the disclaimer (payment and cancellation) was written for business
 * advertisers, but the disclaimer is shown and read aloud to every learner. The owner
 * decided (2026-10-25) to open that section with one clarifying sentence. This script
 * asks Gemini for 3 options for that sentence and SAVES them to
 * planning/disclaimer-israel/options_s3.json, for applyDisclaimerAdvertiserSentence.mjs.
 *
 * Usage:  node --env-file=.env scripts/translateDisclaimerAdvertisers.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODAL   = path.join(ROOT, 'components', 'shared', 'DisclaimerModal.tsx');
const OUT_DIR = path.join(ROOT, 'planning', 'disclaimer-israel');
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
if (!API_KEY) { console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translateDisclaimerAdvertisers.mjs'); process.exit(1); }

const bodies  = [...fs.readFileSync(MODAL, 'utf8').matchAll(/body:\s+'([^']*)'/g)].map(m => m[1]);
const section3 = bodies[2];
const HEBREW  = 'בשלב זה האפליקציה חינמית ללומדים, והתשלום חל רק על עסקים שמפרסמים בה.';

const prompt = `Translate this Hebrew sentence into Amharic.

Hebrew source:
${HEBREW}

It will be the FIRST sentence of section 3 ("Payment and cancellation") of the Terms of Use
of a driving-theory learning app used by Amharic speakers around the world, including people
with very basic literacy. The terms are shown AND read aloud on first launch. The rest of
section 3 follows it and is about payment in advance and no refund; this sentence makes clear
that this section concerns BUSINESSES that advertise, not the learners.

Requirements:
- Amharic (Ge'ez script) only. One sentence. Do NOT end it with a full stop mark.
- Simple, everyday words, same register as the rest of the document.
- TERMINOLOGY MUST MATCH THE REST OF THE DOCUMENT EXACTLY: use the very same word the document
  already uses for "the app/application" and the same spelling it uses for "country" and
  for "payment" and "registration". Do not switch to a synonym or another spelling.
- Make clear the app is free for learners "at this stage" (it may change in the future).
- Do NOT use phonetic transliterations of English words.
- Provide 3 DIFFERENT phrasings so a reviewer can pick the clearest one.
Reply with ONLY the 3 sentences, one per line, no numbering, no quotes, no explanation.

SECTION 3 AS IT IS NOW (it will follow your sentence):
${section3}

FULL CURRENT TEXT OF THE DOCUMENT (terminology reference only):
${bodies.join(String.fromCharCode(10))}`;

const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
if (!res.ok) { console.error('❌ Gemini failed:', res.status, await res.text()); process.exit(1); }
const text = ((await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
const options = text.split('\n').map(l => l.trim().replace(/^[-*\d.)\s]+/, '').replace(/[።.\s]+$/, '').trim()).filter(Boolean).slice(0, 3);
if (!options.length) { console.error('❌ Empty answer'); process.exit(1); }

const check = t => {
  const bad = [...t].filter(ch => { const cp = ch.codePointAt(0); return !(cp >= 0x1200 && cp <= 0x137F) && cp >= 128; });
  return bad.length ? '⚠️  ' + [...new Set(bad)].map(c => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ') : 'clean (Ethiopic only)';
};
console.log('═'.repeat(60));
console.log(`NEW FIRST SENTENCE OF SECTION 3   (Hebrew meaning: ${HEBREW})`);
console.log('');
console.log(`SECTION 3 TODAY STARTS WITH: ${section3.split('።')[0].trim()}`);
console.log('');
options.forEach((o, i) => { console.log(`${i + 1}. ${o}`); console.log(`   ${o.length} characters | ${check(o)}`); console.log(''); });

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'options_s3.json'), JSON.stringify({ hebrew: HEBREW, firstSentenceNow: section3.split('።')[0].trim(), options }, null, 2), 'utf8');
console.log('✅ Options saved to planning/disclaimer-israel/options_s3.json');
