/**
 * scripts/applyPrivacyUpdate.mjs
 *
 * Puts the snippets of planning/privacy-update/snippets.json (English) and
 * snippets_am.json (Amharic, from translatePrivacyUpdate.mjs) into docs/privacy-policy.html.
 * Each snippet is placed by the emoji heading of its section, in BOTH language blocks.
 * Any surprise (a section or anchor not found exactly once, a snippet already applied,
 * HTML that would become unbalanced) stops the script before the page is written.
 * The original is copied to planning/privacy-update/backup/ first.
 *
 * Usage:
 *   node scripts/applyPrivacyUpdate.mjs --dry     (check only, prints what goes where)
 *   node scripts/applyPrivacyUpdate.mjs           (write the page)
 * Publishing to the website is a separate step (vercel --prod) that needs the owner's OK.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR  = path.join(ROOT, 'planning', 'privacy-update');
const PAGE = path.join(ROOT, 'docs', 'privacy-policy.html');
const DRY  = process.argv.includes('--dry');
const die  = m => { console.error('❌ ' + m); process.exit(1); };

const { snippets } = JSON.parse(fs.readFileSync(path.join(DIR, 'snippets.json'), 'utf8'));
const am = JSON.parse(fs.readFileSync(path.join(DIR, 'snippets_am.json'), 'utf8'));
for (const sn of snippets) if (!am[sn.id]) die(`no Amharic text for "${sn.id}" in snippets_am.json. Run translatePrivacyUpdate.mjs first.`);

const original = fs.readFileSync(PAGE, 'utf8');
const nl = original.includes('\r\n') ? '\r\n' : '\n';
let page = original;

const EN_START = '<div class="content-en';
const AM_START = '<div class="content-am"';

/** Runs fn(block) -> newBlock on one language block and puts it back. */
function onBlock(lang, fn) {
  const a = page.indexOf(EN_START), b = page.indexOf(AM_START);
  if (a < 0 || b < 0 || b < a) die('the two language blocks were not found in the expected order');
  const [start, end] = lang === 'en' ? [a, b] : [b, page.length];
  page = page.slice(0, start) + fn(page.slice(start, end)) + page.slice(end);
}
function once(block, needle, what) {
  const i = block.indexOf(needle);
  if (i < 0 || block.indexOf(needle, i + needle.length) >= 0) die(`${what}: expected exactly one "${needle}"`);
  return i;
}
const stamp = id => `<!--upd-2026-10:${id}-->`;

function place(block, sn, html, lang) {
  if (block.includes(stamp(sn.id))) die(`${sn.id} (${lang}) is already applied`);
  const mark = `<span class="icon">${sn.section}</span>`;
  const m = once(block, mark, `section ${sn.section} (${lang})`);
  const piece = stamp(sn.id) + html;
  const w = sn.where;

  if (w === 'end-of-section') {
    const close = block.indexOf('</div>', m);
    if (close < 0 || block.slice(m, close).includes('<div')) die(`${sn.id} (${lang}): the section has a nested block, cannot place safely`);
    return block.slice(0, close) + '  ' + piece + nl + '    ' + block.slice(close);
  }
  if (w === 'end-of-ul') {
    const close = block.indexOf('</ul>', m);
    if (close < 0) die(`${sn.id} (${lang}): no list in the section`);
    return block.slice(0, close) + '  ' + piece + nl + '      ' + block.slice(close);
  }
  if (w.startsWith('before-li-containing:')) {
    const key = w.split(':')[1];
    const k = block.indexOf(key, m);
    if (k < 0) die(`${sn.id} (${lang}): anchor "${key}" not found`);
    const li = block.lastIndexOf('<li>', k);
    if (li < m) die(`${sn.id} (${lang}): anchor is not inside a list item of the section`);
    return block.slice(0, li) + piece + nl + '        ' + block.slice(li);
  }
  if (w.startsWith('replace-sentence-in-li-containing:')) {
    const key = lang === 'en' ? w.split(':')[1] : ' IP ';   // Amharic list item found by the Latin letters "IP" it contains
    const k = block.indexOf(key, m);
    if (k < 0) die(`${sn.id} (${lang}): anchor "${key}" not found`);
    const li = block.lastIndexOf('<li>', k), end = block.indexOf('</li>', k);
    if (li < m) die(`${sn.id} (${lang}): anchor is not inside a list item`);
    const item = block.slice(li, end);
    if (lang === 'en') {
      if (item.split(sn.oldContains).length !== 2) die(`${sn.id} (en): the old sentence was not found exactly once`);
      const s0 = item.indexOf(sn.oldContains), s1 = item.indexOf('.', s0) + 1;
      return block.slice(0, li) + item.slice(0, s0) + stamp(sn.id) + html + item.slice(s1) + block.slice(end);
    }
    const parts = item.split('።');
    const old = parts[sn.sentenceIndex];
    if (!old || old.includes(' IP ') || old.length < 20) die(`${sn.id} (am): sentence ${sn.sentenceIndex} is not what was expected, nothing changed`);
    console.log(`   (am) sentence replaced:\nOLD:${old}\nNEW: ${html}`);
    parts[sn.sentenceIndex] = ' ' + stamp(sn.id) + html;
    return block.slice(0, li) + parts.join('።') + block.slice(end);
  }
  die(`unknown placement "${w}"`);
}

for (const sn of snippets) {
  onBlock('en', b => place(b, sn, sn.html, 'en'));
  onBlock('am', b => place(b, sn, am[sn.id], 'am'));
  console.log(`placed: ${sn.id.padEnd(18)} section ${sn.section}  ${sn.where}`);
}

// The page must stay as balanced as it was: for every tag, (opened - closed) in the whole page
// and in each language block must be EXACTLY what it was before the update.
// (A block cut out of the page can legitimately have one extra closing </div>, so we compare
// before and after instead of demanding zero.)
const count = (s, re) => (s.match(re) ?? []).length;
const slices = text => [['whole page', text], ['English', text.slice(text.indexOf(EN_START), text.indexOf(AM_START))], ['Amharic', text.slice(text.indexOf(AM_START))]];
const balance = text => slices(text).map(([name, t]) => [name, ['li', 'ul', 'p', 'div', 'strong'].map(tag =>
  count(t, new RegExp(`<${tag}[\s>]`, 'g')) - count(t, new RegExp(`</${tag}>`, 'g')))]);
const before = JSON.stringify(balance(original)), after = JSON.stringify(balance(page));
if (before !== after) die(`the HTML balance changed (before ${before}, after ${after}). Nothing was written.`);
console.log('HTML check: tags are exactly as balanced as before (whole page, English, Amharic).');
if (DRY) { console.log('(dry run: nothing written)'); process.exit(0); }
fs.mkdirSync(path.join(DIR, 'backup'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'backup', 'privacy-policy.html.before'), original, 'utf8');
fs.writeFileSync(PAGE, page, 'utf8');
console.log('✅ Written to docs/privacy-policy.html. Original saved in planning/privacy-update/backup/. NOT published yet.');
