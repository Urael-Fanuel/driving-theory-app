/**
 * scripts/translatePrivacyUpdate.mjs
 *
 * Translates the English snippets of the 2026-10-25 privacy policy update
 * (planning/privacy-update/snippets.json) into Amharic with Gemini, keeping the HTML
 * tags, and saves them to planning/privacy-update/snippets_am.json for
 * applyPrivacyUpdate.mjs. Nobody types the Amharic by hand. The owner reads the output
 * in the terminal before anything is applied.
 *
 * Usage:
 *   node --env-file=.env scripts/translatePrivacyUpdate.mjs
 *   node --env-file=.env scripts/translatePrivacyUpdate.mjs --only=adEvents   (one snippet again; the others are kept)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR     = path.join(ROOT, 'planning', 'privacy-update');
const PAGE    = path.join(ROOT, 'docs', 'privacy-policy.html');
const OUT     = path.join(DIR, 'snippets_am.json');
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
if (!API_KEY) { console.error('❌ Missing GEMINI_API_KEY. Run with: node --env-file=.env scripts/translatePrivacyUpdate.mjs'); process.exit(1); }

const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').split('=')[1] || null;
const { snippets } = JSON.parse(fs.readFileSync(path.join(DIR, 'snippets.json'), 'utf8'));
const saved = ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

// The existing Amharic policy, as plain text: terminology reference only.
const page = fs.readFileSync(PAGE, 'utf8');
const amBlock = page.slice(page.indexOf('<div class="content-am"'));
const REFERENCE = amBlock.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Glossary taken from the app itself (nobody types these words) ──────────────────
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const grab = (src, re, what) => { const m = src.match(re); if (!m) { console.error(`❌ glossary: could not find ${what}`); process.exit(1); } return m[1]; };
const GLOSSARY = {
  adPrivacyButton: grab(readSrc('constants/strings.ts'), /privacyOptions:\s*"([^"]+)"/, 'the "ad privacy choices" button label'),
  callButton:      grab(readSrc('components/shared/AdCard.tsx'), /callBtnText\}>([^<]+)</, 'the call button label'),
  progressTab:     grab(readSrc('app/(engineB)/(tabs)/_layout.tsx'), /name="progress"[\s\S]*?title:\s*'([^']+)'/, 'the Progress tab title'),
  anonymousId:     grab(amBlock, /<strong>([^<(]*?)\s*\(Anonymous ID\)<\/strong>/, 'the anonymous ID term'),
};
console.log('Glossary read from the app:', JSON.stringify(GLOSSARY));

const tagsOf = html => (html.match(/<\/?[a-z]+[^>]*>/gi) ?? []).map(t => t.toLowerCase().replace(/\s.*>/, '>'));
const check = t => {
  const bad = [...t.replace(/<[^>]+>/g, '')].filter(ch => { const cp = ch.codePointAt(0); return cp >= 128 && !(cp >= 0x1200 && cp <= 0x137F) && !'“”’—·'.includes(ch); });
  return bad.length ? '⚠️  ' + [...new Set(bad)].map(c => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ') : 'clean';
};

for (const sn of snippets.filter(s => !ONLY || s.id === ONLY)) {
  const isSentence = sn.where.startsWith('replace-sentence');
  const prompt = `Translate the following English text into Amharic. It is part of the Privacy Policy web page of a free driving-theory learning app for Amharic speakers around the world.

English source:
${sn.html}

Requirements:
- Amharic (Ge'ez script) only, except the letters "A", "B", "Android", "iOS" and "ID" where they must stay as they are.
- KEEP ALL HTML TAGS EXACTLY AS THEY ARE (for example <li>, <strong>, <p>) and in the same places. Translate only the text between the tags.
- Simple, everyday words, the same register as the existing Amharic policy. Do NOT use phonetic transliterations of English words, except words the existing policy already writes that way.
- TERMINOLOGY MUST MATCH THE EXISTING AMHARIC POLICY EXACTLY (reference below): use the very same words it uses for "anonymous ID", "location", "city", "app", "advertisement", "driving instructor", "Progress screen" if present, "server", "country". Do not switch to synonyms.
- GLOSSARY, taken from the app itself. Use these EXACT Amharic words, character for character:
  * the English “ad privacy choices” (the name of the button) -> the button's real label: ${GLOSSARY.adPrivacyButton}   (write it inside “ ” quotation marks)
  * the English “call” button -> the button's real label: ${GLOSSARY.callButton}   (write it inside “ ” quotation marks)
  * the English "Progress screen" -> the screen whose tab is named: ${GLOSSARY.progressTab}
  * the English "anonymous ID" -> ${GLOSSARY.anonymousId}   (do NOT leave "ID" in Latin letters)
- Use ONE word for "tap / tapped" everywhere: a form of the verb for "to touch" (መንካት). Never use "press" or "click" wording for a tap.
- Write "per city" and "per day" as the natural single compound (no stray space after the prefix).
- Use only straight text, never write quote characters twice.
${isSentence ? '- This is ONE sentence that replaces a sentence inside a longer paragraph. Do NOT end it with a full stop mark.' : ''}
${sn.translationNote ? '- IMPORTANT FOR THIS TEXT: ' + sn.translationNote : ''}
- Translate the CURRENT English text as a whole. If an older Amharic version of this paragraph exists in the reference below, do NOT reuse its sentences: its meaning has changed.
Reply with ONLY the translation, nothing else, no code fences.

EXISTING AMHARIC POLICY (terminology reference only):
${REFERENCE}`;
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  if (!res.ok) { console.error(`❌ Gemini failed for ${sn.id}:`, res.status, await res.text()); process.exit(1); }
  let am = ((await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().replace(/^```[a-z]*\n?|```$/g, '').trim();
  if (isSentence) am = am.replace(/[።.\s]+$/, '');
  if (!am) { console.error(`❌ Empty answer for ${sn.id}`); process.exit(1); }
  const sameTags = JSON.stringify(tagsOf(am)) === JSON.stringify(tagsOf(sn.html));

  // Meaning check (CODEX round 5, R5-1: a translation kept an old sentence that changed the
  // meaning, and only terms and tags were checked). Gemini translates the Amharic BACK to
  // English, without seeing the source, and any forbidden wording is flagged.
  const backRes = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Translate this Amharic text into plain English, literally and completely, sentence by sentence. Keep nothing in Amharic. Reply with only the English.\n\n${am.replace(/<[^>]+>/g, ' ')}` }] }] }) });
  const back = backRes.ok ? ((await backRes.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim() : '(back-translation failed)';
  const forbidden = (sn.mustNotMean ?? []).filter(re => new RegExp(re, 'i').test(back));
  saved[sn.id] = am;
  console.log('═'.repeat(60));
  console.log(`[${sn.id}]  (section ${sn.section})`);
  console.log('');
  console.log(`EN: ${sn.html}`);
  console.log('');
  console.log(`AM: ${am}`);
  console.log('');
  console.log(`BACK TO ENGLISH (meaning check): ${back}`);
  console.log('');
  console.log(`   ${[...am.replace(/<[^>]+>/g, '')].length} characters | characters: ${check(am)} | HTML tags ${sameTags ? 'identical to the English' : '⚠️  DIFFERENT from the English, do not apply'}`
    + (sn.mustNotMean ? ` | meaning: ${forbidden.length ? '⚠️  FORBIDDEN MEANING FOUND (' + forbidden.join(', ') + '), do not apply' : 'none of the forbidden meanings found'}` : ''));
  if (forbidden.length) process.exitCode = 2;
  console.log('');
}
fs.writeFileSync(OUT, JSON.stringify(saved, null, 2), 'utf8');
console.log('✅ Saved to planning/privacy-update/snippets_am.json (applyPrivacyUpdate.mjs reads it from there).');
