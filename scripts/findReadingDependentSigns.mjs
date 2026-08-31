/**
 * findReadingDependentSigns.mjs
 *
 * Finds the sign questions a learner who cannot read has no way to answer.
 *
 * The criterion — and why an earlier heuristic got it wrong
 * --------------------------------------------------------
 * The first attempt flagged questions whose answers mention a number the spoken
 * question never says. That is the wrong test, in both directions.
 *
 * Sign 435 (no stopping, commercial vehicles) carries a truck pictogram and
 * nothing else — no digits anywhere on it. Its answers talk about 10,000 kg
 * because that is the regulation, not because it is printed. A reader looking
 * at that sign is no better off than a listener: neither can read a number
 * that is not there. The question is fair, and "fixing" it would only bolt a
 * pointless description onto a sound question.
 *
 * Sign 416 carries "4.6" in huge black digits. A reader reads it; a listener
 * gets nothing. That is the real defect.
 *
 * So the test is not "is a number missing from the question" but:
 *
 *      Does the sign IMAGE carry readable text or digits,
 *      and does answering actually depend on them?
 *
 * Only Gemini looking at the actual image can answer the first half, so that is
 * what this does — it reads every sign image once and records what is printed
 * on it. Cross-referencing that against the questions gives a list that is
 * about real unfairness rather than about comma formatting.
 *
 * Read-only. Writes a JSON report and changes nothing.
 *
 * Requires: GEMINI_API_KEY in .env
 *
 * Usage:
 *   node --env-file=.env scripts/findReadingDependentSigns.mjs --out report.json
 *   node --env-file=.env scripts/findReadingDependentSigns.mjs --signs INFO_610,PROHIBITION_416
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';

const API_KEY      = process.env.GEMINI_API_KEY;
const MODEL        = 'gemini-2.5-flash';
const API_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders    = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const SYSTEM_INSTRUCTION = `You inspect road-sign images and report, factually, what is
printed on them. You are not judging the sign — only recording what a sighted
reader would be able to READ on it.

Report as printed text ONLY glyphs actually rendered on the sign: digits,
letters, words, place names, times, units. In any script — Hebrew, Arabic,
Latin, Ge'ez.

Do NOT report as printed text: pictograms, silhouettes, arrows, diagonal bars,
borders, colours, or shapes. A truck drawn on a sign is a picture, not text. A
number of diagonal stripes is a picture, not text.

Return ONLY JSON:
{
  "has_printed_text": true or false,
  "printed_text": "<exactly what is printed, verbatim; empty string if none>",
  "description": "<one short English line describing the sign's non-text imagery>"
}`;

/**
 * Triage prompt. The number heuristic can only say "this sign has words on it";
 * it cannot say whether answering actually needs them. Sign 435 taught that
 * lesson: a truck pictogram with no digits at all, whose answers cite a
 * 10,000 kg rule that comes from the regulation rather than the sign. Padding
 * a question like that with a description helps nobody and makes it longer to
 * listen to. This asks the only question that matters.
 */
const TRIAGE_INSTRUCTION = `You are auditing a driving-theory app for fairness to learners
who CANNOT READ. They hear the question and the four answers read aloud, and
they see the sign image — but they cannot read any text printed on it.

Decide ONE thing: is the listener at a disadvantage compared to someone who can
read the sign?

Answer NEEDS_READING only if the correct answer cannot be identified without
reading text or digits printed on the sign — a place name, a distance, a road
number, a weight, a height, a speed.

Answer FAIR if the question can be answered from the sign's shape, colour and
pictogram, or from general road-law knowledge the learner studies anyway, even
when the answers happen to mention a number. A reader who also cannot see that
number on the sign is in exactly the same position as the listener; that is
fair, and the question must be left alone.

Be strict. Wrongly marking a sound question as NEEDS_READING makes it longer
and worse for everyone.

Return ONLY JSON:
{ "verdict": "NEEDS_READING" | "FAIR", "why": "<one short English line>" }`;

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function fetchAll(table, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`${table} fetch failed: ${res.status}`);
  return res.json();
}

async function loadImage(sign) {
  if (!sign?.image_url) return null;
  try {
    const res = await fetch(sign.image_url);
    if (!res.ok) return null;
    const buf  = Buffer.from(await res.arrayBuffer());
    const mime = sign.image_url.match(/\.jpe?g(\?|$)/i) ? 'image/jpeg' : 'image/png';
    return { base64: buf.toString('base64'), mime };
  } catch { return null; }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

/** Thrown on HTTP 429 so the caller stops the whole run instead of grinding on. */
class QuotaExhausted extends Error {}

async function inspectSign(sign, image, attempt = 1) {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: image.mime, data: image.base64 } },
        { text: `What is printed on this road sign? Sign id: ${sign.id}.` },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };

  const res = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  if (!res.ok) {
    // 429 is the daily free-tier ceiling. Retrying cannot help, and grinding
    // through the remaining signs just burns minutes producing nothing — an
    // earlier run sat for half an hour doing exactly that. Stop the run.
    if (res.status === 429) throw new QuotaExhausted(await res.text());
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
      return inspectSign(sign, image, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try { return JSON.parse(raw); }
  catch { throw new Error(`bad JSON: ${raw.slice(0, 120)}`); }
}

async function triageQuestion(question, sign, printed, image, attempt = 1) {
  const answers = (question.answers || [])
    .map(a => `  ${a.id}. ${a.text_amharic}${a.is_correct ? '   <-- CORRECT' : ''}`)
    .join('\n');

  const body = {
    system_instruction: { parts: [{ text: TRIAGE_INSTRUCTION }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: image.mime, data: image.base64 } },
        { text: `SIGN ${sign.id}. Text printed on it: "${printed.printed_text}"\n\nQUESTION (Amharic):\n${question.question_amharic}\n\nANSWERS:\n${answers}` },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };

  const res = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new QuotaExhausted(await res.text());
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
      return triageQuestion(question, sign, printed, image, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  try { return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''); }
  catch { throw new Error('bad JSON from triage'); }
}

// ─── Does answering this question actually need the printed text? ─────────────

/**
 * Normalises a number for comparison. "10,000" / "10000" / "10.000" all collapse
 * to the same key — the comma bug that produced false positives the first time
 * around lived exactly here.
 */
const normNum = s => s.replace(/[,\s]/g, '');

function extractNumbers(text) {
  return (text.match(/\d[\d,\.]*/g) || [])
    .map(normNum)
    .map(n => n.replace(/\.$/, ''))
    .filter(n => n.length > 0);
}

/**
 * A question is reading-dependent when something PRINTED on the sign is needed
 * to answer, and the spoken question never says it.
 *
 * Two ways that shows up:
 *   - a number printed on the sign appears in the answers but not in the question
 *   - a word printed on the sign (a place name) appears in the answers but not
 *     in the question
 */
function isReadingDependent(question, printed) {
  if (!printed.has_printed_text || !printed.printed_text) return null;

  const qNums       = new Set(extractNumbers(question.question_amharic));
  const printedNums = new Set(extractNumbers(printed.printed_text));
  const reasons     = [];

  for (const a of question.answers || []) {
    for (const n of extractNumbers(a.text_amharic)) {
      // only counts if that number is actually ON the sign
      if (printedNums.has(n) && !qNums.has(n)) {
        reasons.push(`answer ${a.id} needs "${n}", printed on the sign but never spoken`);
      }
    }
  }

  // place names: a printed word of 3+ letters that the answers use and the
  // question does not. Compared on the Latin/Hebrew of the printed text, so this
  // is a hint to review rather than proof — Amharic answers transliterate it.
  const printedWords = (printed.printed_text.match(/[A-Za-z֐-׿]{3,}/g) || []);
  if (printedWords.length && !reasons.length) {
    const answersText = (question.answers || []).map(a => a.text_amharic).join(' ');
    // if answers carry a number the question lacks AND the sign has words, flag
    // for human review — transliteration means we cannot match the name itself
    const ansNums = new Set((question.answers || []).flatMap(a => extractNumbers(a.text_amharic)));
    const unseen  = [...ansNums].filter(n => printedNums.has(n) && !qNums.has(n));
    if (unseen.length) reasons.push(`sign carries place names (${printedWords.join(' ')}) plus ${unseen.join(', ')}`);
    else if (answersText.length && printedWords.length >= 1) {
      return { level: 'review', reasons: [`sign carries printed words (${printedWords.join(' ')}) — check by hand whether the answer needs them`] };
    }
  }

  return reasons.length ? { level: 'confirmed', reasons } : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  if (!API_KEY)     { console.error('❌  GEMINI_API_KEY missing'); process.exit(1); }
  if (!SERVICE_KEY) { console.error('❌  SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }

  const outPath   = arg('--out') || 'reading_dependent_report.json';
  const cachePath = arg('--cache') || outPath.replace(/\.json$/, '.signcache.json');
  const only      = (arg('--signs') || '').split(',').map(s => s.trim()).filter(Boolean);

  const [signs, questions] = await Promise.all([
    fetchAll('signs', 'id,image_url,topic_id'),
    fetchAll('questions', 'id,sign_id,topic_id,question_amharic,answers'),
  ]);

  const signQuestions = questions.filter(q => q.sign_id);

  // Narrow the image inspection before spending a single API call. All 276
  // signs does not fit in the ~250/day free tier — it cannot ever finish — and
  // most signs are pure pictograms that no question turns on anyway. Two cheap
  // local rules pick the ones worth looking at:
  //   (a) some answer needs a number the spoken question never says
  //   (b) the sign belongs to a text-heavy family, where printed place names
  //       live even when no number gives them away
  const TEXT_HEAVY = ['information_guidance', 'public_transport', 'road_markings'];
  const worthInspecting = new Set();
  for (const q of signQuestions) {
    if (TEXT_HEAVY.includes(q.topic_id)) { worthInspecting.add(q.sign_id); continue; }
    const spoken = new Set(extractNumbers(q.question_amharic));
    for (const a of q.answers || []) {
      if (extractNumbers(a.text_amharic).some(n => n.length >= 2 && !spoken.has(n))) {
        worthInspecting.add(q.sign_id);
        break;
      }
    }
  }

  const targets = only.length
    ? signs.filter(s => only.includes(s.id))
    : signs.filter(s => worthInspecting.has(s.id));
  if (!only.length) {
    console.log(`מתוך ${signs.length} תמרורים, ${targets.length} דורשים בדיקת תמונה (השאר פיקטוגרמות ששום שאלה לא תלויה בטקסט שלהן)`);
    console.log('');
  }

  // Each image is a real API call against a daily free-tier ceiling of ~250, so
  // the cache is what makes a rerun free. Flush after EVERY sign, success or
  // not: a version that only flushed on every 10th SUCCESS wrote nothing at all
  // during a run where everything failed, leaving no sign of life for 30
  // minutes and no partial progress to resume from.
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  let inspected = 0, cached = 0, failed = 0, quotaHit = false;

  for (const sign of targets) {
    if (cache[sign.id] && !cache[sign.id]._error) { cached++; continue; }
    const image = await loadImage(sign);
    if (!image) {
      cache[sign.id] = { has_printed_text: false, printed_text: '', description: 'NO IMAGE', _noImage: true };
      failed++;
      writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
      continue;
    }
    try {
      cache[sign.id] = await inspectSign(sign, image);
      inspected++;
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        quotaHit = true;
        console.log('');
        console.log('⚠️  המכסה היומית של Gemini נגמרה — עוצר כאן.');
        console.log(`   ${inspected} תמרורים נבדקו והמטמון נשמר; הרצה חוזרת תמשיך מהנקודה הזו בלי לשלם שוב.`);
        break;
      }
      cache[sign.id] = { has_printed_text: false, printed_text: '', description: `ERROR: ${e.message}`, _error: true };
      failed++;
    }
    writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
    if (inspected % 10 === 0 && inspected) console.log(`  ...${inspected}/${targets.length - cached} נבדקו`);
  }
  writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  console.log(`תמונות: ${inspected} נבדקו עכשיו, ${cached} מהמטמון, ${failed} נכשלו/ללא תמונה`);
  if (quotaHit) console.log('הדוח שלהלן חלקי — הרץ שוב מחר כדי להשלים.');
  console.log('');

  const withText = Object.entries(cache).filter(([, v]) => v.has_printed_text);
  console.log(`תמרורים עם טקסט מודפס: ${withText.length} מתוך ${Object.keys(cache).length}`);
  console.log('');

  const confirmed = [], review = [];
  for (const q of signQuestions) {
    const printed = cache[q.sign_id];
    if (!printed) continue;
    const verdict = isReadingDependent(q, printed);
    if (!verdict) continue;
    const row = { id: q.id, sign_id: q.sign_id, topic_id: q.topic_id, printed_text: printed.printed_text, reasons: verdict.reasons };
    (verdict.level === 'confirmed' ? confirmed : review).push(row);
  }

  const FORBIDDEN = ['regulatory', 'warning', 'right_of_way'];
  const show = (title, rows) => {
    console.log(`═══ ${title}: ${rows.length} ═══`);
    for (const r of rows) {
      console.log(`  ${r.id.padEnd(16)} | ${r.topic_id.padEnd(20)}${FORBIDDEN.includes(r.topic_id) ? '← חסום ' : '       '}| על השלט: ${r.printed_text.replace(/\s+/g, ' ').slice(0, 50)}`);
    }
    console.log('');
  };
  show('תלויות קריאה — מאושר', confirmed);

  // The "review" pile is only "this sign has words on it". Ask Gemini, looking
  // at the sign, whether answering actually needs to read them — otherwise we
  // would pad sound questions with description nobody needs.
  if (process.argv.includes('--triage') && review.length) {
    const triagePath = outPath.replace(/\.json$/, '.triage.json');
    const seen = existsSync(triagePath) ? JSON.parse(readFileSync(triagePath, 'utf8')) : {};
    const byId = Object.fromEntries(signQuestions.map(q => [q.id, q]));
    const signById = Object.fromEntries(signs.map(s => [s.id, s]));
    const imageCache = {};
    console.log(`═══ מסנן ${review.length} שאלות "לבדיקה ידנית" ═══`);
    for (const r of review) {
      if (seen[r.id]) continue;
      const q = byId[r.id], sign = signById[r.sign_id];
      imageCache[r.sign_id] ??= await loadImage(sign);
      if (!imageCache[r.sign_id]) { seen[r.id] = { verdict: 'FAIR', why: 'no image' }; continue; }
      try {
        seen[r.id] = await triageQuestion(q, sign, cache[r.sign_id], imageCache[r.sign_id]);
      } catch (e) {
        if (e instanceof QuotaExhausted) { console.log('⚠️  המכסה נגמרה באמצע הסינון — נשמר מה שהספיק'); break; }
        seen[r.id] = { verdict: 'ERROR', why: e.message };
      }
      writeFileSync(triagePath, JSON.stringify(seen, null, 2), 'utf8');
    }
    const needs = review.filter(r => seen[r.id]?.verdict === 'NEEDS_READING');
    const fair  = review.filter(r => seen[r.id]?.verdict === 'FAIR');
    console.log(`  צריכות תיקון: ${needs.length}`);
    console.log(`  תקינות — לא לגעת: ${fair.length}`);
    console.log('');
    show('אחרי סינון — צריכות תיקון', needs);
    console.log('תקינות (לא נוגעים):');
    for (const r of fair) console.log(`  ${r.id.padEnd(16)} ${seen[r.id].why}`);
    console.log('');
    review.length = 0;
    review.push(...needs);
  } else {
    show('לבדיקה ידנית', review);
  }

  writeFileSync(outPath, JSON.stringify({ confirmed, review, signsWithText: withText.map(([id, v]) => ({ id, printed_text: v.printed_text })) }, null, 2), 'utf8');
  console.log(`הדוח נשמר ל: ${outPath}`);
}

main().catch(e => { console.error('❌ ', e.message); process.exit(1); });
