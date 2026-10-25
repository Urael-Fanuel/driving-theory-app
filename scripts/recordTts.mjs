/**
 * scripts/recordTts.mjs
 *
 * Records, ahead of time, the sentences the app speaks through LIVE TTS for the
 * behavioral topics, so the app can play a stored clip instead of calling Google
 * every time (services/audioCache.ts fetchRecordedTts). NO text is written or
 * changed here: every sentence is assembled from the same content files and the
 * same phrase lists the app itself uses, in exactly the way the app assembles it:
 *
 *   question                 question_amharic                          (A and B)
 *   answer, Engine A         answers[i].text_amharic
 *   answer, Engine B         `${AMHARIC_NUMBERS[i]}። ${answers[i].text_amharic}`
 *   feedback, correct        `${praise} ${correctText}`   for every praise in every CORRECT_PRAISES list
 *   feedback, wrong          `ስህተት! ትክክለኛው መልስ: ${correctText}`
 *
 * SPEECH GUARD: before anything else the script parses every screen and component
 * (TypeScript AST, so comments and dead text do not count) and checks that EVERY
 * call to speakAndAwait / speakLongAndAwait / speakAmharic, every ttsText prop, every
 * feedback setter, every correctText and randomPraise is one of the known
 * constructions above (or a known sentence that stays live). Anything else stops
 * the script, so a changed screen can never be recorded with the old wording.
 * The phrase lists are read from the screens' own array literals.
 *
 * Audio: the request body is identical to supabase/functions/tts (plain text,
 * am-ET-Standard-A, MP3, speakingRate 0.85). File name: 'r' + the app's own TTS
 * cache name for that text (ttsFilename in services/audioCache.ts, ported below
 * and checked by a test). The 'r' keeps recordings in their own cache slot.
 *
 * Run:
 *   node scripts/recordTts.mjs --list                                   (subtopics)
 *   node scripts/recordTts.mjs --subtopic=tr_l2_s1                      (manifest only, no network)
 *   node scripts/recordTts.mjs --all                                    (manifest of everything)
 *   node --env-file=.env scripts/recordTts.mjs --subtopic=tr_l2_s1 --upload
 *
 * Publishing (one subtopic at a time, never two runs at once): clips first, then
 * the index, merged with what was there. If the index cannot be read with
 * certainty, nothing is published (fail closed).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(import.meta.url)(join(ROOT, 'node_modules', 'typescript'));
const OUT_DIR = join(ROOT, 'planning', 'recorded-tts');
const BUCKET = 'audio';
const PREFIX = 'tts/';
const INDEX_PATH = PREFIX + 'index.json';
const MAX_TTS_CHARS = 1000;   // the tts Edge Function refuses longer text

// Same order and files as BEHAVIORAL_SCAFFOLD_MAP in backend/api.ts.
const SCAFFOLDS = {
  vehicle_knowledge: 'vehicle_knowledge_scaffold.json',
  mind_safety:       'mind_safety_scaffold.json',
  society_law:       'society_law_scaffold.json',
  the_road:          'the_road_scaffold.json',
  my_vehicle:        'my_vehicle_scaffold.json',
  two_wheelers:      'two_wheelers_scaffold.json',
  road_decisions:    'road_decisions_scaffold.json',
  basics_license:    'basics_license_scaffold.json',
};
const WRONG_PREFIX = 'ስህተት! ትክክለኛው መልስ: ';

// ─── speech guard ─────────────────────────────────────────────────────────────
// Every argument the app passes to its TTS functions, as source text (whitespace
// collapsed). 'record' = recorded by this script, 'live' = stays live TTS on
// purpose (dynamic or not behavioral content), 'handler' = a parameter whose
// callers are checked separately, 'prop' = the feedback ttsText prop.
const SPEECH_ARGS = {
  "currentQuestion!.question_amharic ?? ''": 'record',              // question (exam, practice, topic quiz A)
  "answer?.text_amharic ?? ''": 'record',                           // answer A (same screens)
  'answer.text_amharic!': 'record',                                 // answer A replay (practice)
  'currentQ!.question_amharic': 'record',                           // question (A subtopic)
  'currentQ!.answers[i].text_amharic': 'record',                    // answer A (A subtopic)
  'currentQ.question_amharic': 'record',                            // question (B subtopic)
  '`${AMHARIC_NUMBERS[i]}። ${currentQ.answers[i].text_amharic}`': 'record',                  // answer B (B subtopic)
  'currentQuestion.question_amharic': 'record',                     // question (B topic quiz)
  "`${AMHARIC_NUMBERS[i]}። ${currentQuestion.answers[i].text_amharic ?? ''}`": 'record',     // answer B (B topic quiz)
  'text': 'handler',                                                // A answer replay handlers / RAG text
  'ttsText': 'prop',                                                // feedback components
  'ragExplanation': 'live',                                         // RAG "why?" (dynamic)
  "'ብራቮ!'": 'live', "'ጥያቄዎች ለዛሬ'": 'live',
  '`${PRIMER_TITLE}. ${PRIMER_BODY} ${PRESS_BUTTON_INSTRUCTION}`': 'live',
  'part': 'live',                                                   // speakLongAndAwait splitting (utils only)
};
const HANDLER_ARGS = new Set(["answer.text_amharic!", "answer.text_amharic ?? ''"]);
const TTS_TEXT_PROPS = new Set([
  'isBehavioral && feedbackTTSText ? feedbackTTSText : undefined',
  'isBehavioralQuestion && feedbackTTSText ? feedbackTTSText : undefined',
  'feedbackTTSText', 'feedbackText',
]);
const FEEDBACK_SETTERS = new Set(['setFeedbackTTSText', 'setFeedbackText']);
const FEEDBACK_VALUES = ['selected', 'selected?', 'answer'].map((x) =>
  `${x}.is_correct ? \`\${randomPraise()} \${correctText}\` : \`ስህተት! ትክክለኛው መልስ: \${correctText}\``);
const CORRECT_TEXTS = ['currentQ', 'currentQuestion'].map((x) => `${x}.answers.find(a => a.is_correct)?.text_amharic ?? ''`);
const RANDOM_PRAISE = '() => CORRECT_PRAISES[Math.floor(Math.random() * CORRECT_PRAISES.length)]';
const SPEAK_FNS = new Set(['speakAndAwait', 'speakLongAndAwait', 'speakAmharic']);

// Expressions are compared as their token sequence: layout outside quotes (line
// breaks, indentation, comments) does not matter, while EVERY character inside a
// string or template literal does, so even a doubled space or a new line inside
// a spoken template is a change (CODEX QA 2026-10-24, S3).
function canonText(code) {
  const sc = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const out = [];
  const templates = [];   // brace depth at which each open template's `${` sits
  let depth = 0;
  for (let t = sc.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = sc.scan()) {
    if (t === ts.SyntaxKind.OpenBraceToken) depth++;
    else if (t === ts.SyntaxKind.CloseBraceToken) {
      if (templates.length && templates[templates.length - 1] === depth) {
        t = sc.reScanTemplateToken(false);          // `}...${` or `}...``
        if (t === ts.SyntaxKind.TemplateTail) templates.pop();
        out.push(sc.getTokenText());
        continue;
      }
      depth--;
    }
    if (t === ts.SyntaxKind.TemplateHead) templates.push(depth);
    out.push(sc.getTokenText());
  }
  return out.join(' ');
}
const canon = (node, sf) => canonText(node.getText(sf));
const canonSet = (list) => new Set(list.map(canonText));
const C_SPEECH = new Map(Object.entries(SPEECH_ARGS).map(([k, v]) => [canonText(k), v]));
const C_HANDLER = canonSet([...HANDLER_ARGS]);
const C_TTS_PROPS = canonSet([...TTS_TEXT_PROPS]);
const C_FEEDBACK = canonSet(FEEDBACK_VALUES);
const C_CORRECT = canonSet(CORRECT_TEXTS);
const C_PRAISE = canonText(RANDOM_PRAISE);
const C_RESET = canonText("''");

function listSources(dir) {
  const { readdirSync, statSync } = createRequire(import.meta.url)('fs');
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = dir + '/' + name;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...listSources(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

/**
 * Parse every app/ and components/ file and check all speech constructions.
 * `readSrc(rel)` is injectable so the test can feed changed sources.
 * Returns { problems: string[], praises: string[], numbers: string[] }.
 */
export function speechGuard(readSrc = (rel) => readFileSync(join(ROOT, rel), 'utf8'), files = [...listSources('app'), ...listSources('components')]) {
  const problems = [];
  const praises = new Set();
  const numberLists = [];
  let feedbackSites = 0;
  for (const rel of files) {
    const text = readSrc(rel);
    if (!/speakAndAwait|speakLongAndAwait|speakAmharic|ttsText|CORRECT_PRAISES|AMHARIC_NUMBERS|setFeedbackT/.test(text)) continue;
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const src = (n) => canon(n, sf);
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const fn = n.expression.text;
        if (SPEAK_FNS.has(fn)) {
          const arg = n.arguments[0] ? src(n.arguments[0]) : '';
          if (!C_SPEECH.has(arg)) problems.push(`${at(n)} ${fn}(${arg}) is not a known speech construction`);
        }
        if (FEEDBACK_SETTERS.has(fn)) {
          const arg = n.arguments[0] ? src(n.arguments[0]) : '';
          if (arg === C_RESET) { /* reset */ } else if (C_FEEDBACK.has(arg)) feedbackSites++;
          else problems.push(`${at(n)} ${fn}(${arg}) builds feedback differently`);
        }
        if (fn === 'handleBehavioralAnswerAudioPress') {
          const arg = n.arguments[0] ? src(n.arguments[0]) : '';
          if (!C_HANDLER.has(arg)) problems.push(`${at(n)} handleBehavioralAnswerAudioPress(${arg}) passes a different text`);
        }
      }
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'ttsText') {
        const init = n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression ? src(n.initializer.expression) : '';
        if (!C_TTS_PROPS.has(init)) problems.push(`${at(n)} ttsText={${init}} is not a known feedback value`);
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const name = n.name.text;
        if (name === 'correctText' && !C_CORRECT.has(src(n.initializer))) problems.push(`${at(n)} correctText = ${src(n.initializer)} changed`);
        if (name === 'randomPraise' && src(n.initializer) !== C_PRAISE) problems.push(`${at(n)} randomPraise changed`);
        if ((name === 'CORRECT_PRAISES' || name === 'AMHARIC_NUMBERS')) {
          if (!ts.isArrayLiteralExpression(n.initializer) || !n.initializer.elements.every(ts.isStringLiteral)) problems.push(`${at(n)} ${name} is not a plain list of strings`);
          else {
            const items = n.initializer.elements.map((e) => e.text);
            if (name === 'CORRECT_PRAISES') items.forEach((p) => praises.add(p));
            else numberLists.push([rel, items]);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  if (!praises.size) problems.push('no CORRECT_PRAISES list found');
  if (!feedbackSites) problems.push('no feedback construction found');
  const numbers = numberLists[0]?.[1] ?? [];
  for (const [rel, items] of numberLists) if (JSON.stringify(items) !== JSON.stringify(numbers)) problems.push(`${rel}: AMHARIC_NUMBERS differ`);
  const ttsSrc = readSrc('utils/googleTTS.ts');
  const m = ttsSrc.match(/const TTS_NUMBER_PREFIXES = \[([^\]]*)\]/);
  const prefixes = m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : [];
  if (JSON.stringify(prefixes) !== JSON.stringify(numbers)) problems.push('TTS_NUMBER_PREFIXES in utils/googleTTS.ts differ from AMHARIC_NUMBERS');
  return { problems, praises: [...praises], numbers };
}

// ─── sentences ────────────────────────────────────────────────────────────────

/**
 * Port of ttsFilename() in services/audioCache.ts — must stay IDENTICAL, including
 * the plain (not Math.imul) multiplication: the app's names come from that exact
 * arithmetic, so "fixing" it here would make every recording unreachable.
 * Checked against the real function by tests/recorded-tts-test.cjs.
 */
export function ttsFilename(text) {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = ((fnv ^ c) * 0x01000193) >>> 0;
    djb = ((djb * 33) ^ c) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return `tts_${text.length}_${hex(fnv)}${hex(djb)}.mp3`;
}
/** Same as recordedTtsFilename() in services/audioCache.ts. */
export const recordedFilename = (text) => 'r' + ttsFilename(text);

/** The phrase lists, after the guard passed (stops the script otherwise). */
export function phraseLists() {
  const g = speechGuard();
  if (g.problems.length) {
    console.error('❌ speech guard: the app no longer speaks these sentences the way this script records them:\n  ' + g.problems.join('\n  '));
    process.exit(1);
  }
  return { praises: g.praises, numbers: g.numbers };
}

/** Every subtopic, keyed like the app's subtopicKey, with its scaffold id. */
export function subtopics() {
  const out = [];
  for (const [topicId, file] of Object.entries(SCAFFOLDS)) {
    const data = JSON.parse(readFileSync(join(ROOT, 'content', file), 'utf8'));
    (data.levels ?? []).forEach((level, li) => {
      (level.subtopics ?? []).forEach((sub, si) => {
        out.push({ key: `${topicId}_${li}_${si}`, id: sub.id ?? '', topicId, questions: sub.questions ?? [] });
      });
    });
  }
  return out;
}

/** The exact sentences the app can speak for one subtopic (de-duplicated). */
export function sentencesFor(sub, { praises, numbers }) {
  const items = [];
  const add = (text, kind, qi) => { if (text) items.push({ text, kind, question: qi }); };
  sub.questions.forEach((q, qi) => {
    const answers = q.answers ?? [];
    add(q.question_amharic ?? '', 'question', qi);
    answers.forEach((a, i) => {
      add(a.text_amharic ?? '', 'answer_A', qi);
      if (numbers[i] && a.text_amharic) add(`${numbers[i]}። ${a.text_amharic}`, 'answer_B', qi);
    });
    const correctText = answers.find((a) => a.is_correct)?.text_amharic ?? '';
    for (const p of praises) add(`${p} ${correctText}`, 'feedback_correct', qi);
    add(`${WRONG_PREFIX}${correctText}`, 'feedback_wrong', qi);
  });
  const seen = new Set();
  return items.filter((it) => (seen.has(it.text) ? false : (seen.add(it.text), true)))
    .map((it) => ({ ...it, file: recordedFilename(it.text), too_long: it.text.length > MAX_TTS_CHARS }));
}

// ─── Google TTS, byte-for-byte the request of supabase/functions/tts ──────────
export function ttsRequestBody(text) {
  return JSON.stringify({
    input: { text },
    voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
  });
}

async function synthesize(text) {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY },
        body: ttsRequestBody(text),
      });
      const data = await res.json();
      if (!res.ok || !data.audioContent) throw new Error('Google TTS ' + res.status + ' ' + JSON.stringify(data.error ?? {}).slice(0, 120));
      return Buffer.from(data.audioContent, 'base64');
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── publishing ───────────────────────────────────────────────────────────────
/** Supabase Storage answers a missing object with 400 + {"statusCode":"404"}. */
export function isMissingObject(status, body) {
  return status === 404 || (status === 400 && !!body && (body.statusCode === '404' || body.error === 'not_found' || body.code === 'NoSuchKey'));
}

/**
 * The published index, or [] when there is none yet. THROWS on anything else
 * (network, auth, server error, unreadable or malformed index): an index that
 * cannot be read with certainty must never be treated as empty (CODEX QA R2).
 */
export async function readIndex(getObject) {
  const { status, body } = await getObject(INDEX_PATH);
  if (status === 200) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new Error('index.json is not valid JSON'); }
    if (!parsed || !Array.isArray(parsed.files) || !parsed.files.every((f) => typeof f === 'string')) throw new Error('index.json has no valid files list');
    return parsed.files;
  }
  let json = null; try { json = JSON.parse(body); } catch {}
  if (isMissingObject(status, json)) return [];
  throw new Error('index.json could not be read (HTTP ' + status + ')');
}

/**
 * Record and publish the given sentences. deps: { getObject(path) -> {status, body},
 * putObject(path, buffer, {contentType, cacheControl}) -> void (throws on error),
 * synthesize(text) -> Buffer, log(msg) }.
 * Returns { recorded, failed, indexSize, published }.
 */
export async function publish(sentences, deps) {
  const { getObject, putObject, log = () => {} } = deps;
  const initial = await readIndex(getObject);                 // throws: nothing done yet
  const known = new Set(initial);
  const todo = [...new Map(sentences.filter((x) => !x.too_long).map((x) => [x.file, x])).values()].filter((x) => !known.has(x.file));
  log(`🎙️ to record: ${todo.length} (already published: ${known.size})`);

  const done = [];
  let failed = 0;
  const CONCURRENCY = 4;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(async (x) => {
      try {
        const mp3 = await deps.synthesize(x.text);
        await putObject(PREFIX + x.file, mp3, { contentType: 'audio/mpeg', cacheControl: '31536000' });
        done.push(x.file);
      } catch (e) {
        failed++;
        log(`  ❌ ${x.kind} q${x.question}: ${e.message}`);
      }
    }));
  }
  if (!done.length) return { recorded: 0, failed, indexSize: known.size, published: false };

  // Index last. Re-read it; if that read is not certain, publish NOTHING: the new
  // clips simply stay unused until a later run (safe), and the index that is
  // there now is never replaced by a shorter one.
  let latest;
  try { latest = await readIndex(getObject); }
  catch (e) { throw new Error('final index read failed, index NOT updated (' + e.message + '); clips are uploaded and unused; run again'); }
  const merged = [...new Set([...initial, ...latest, ...done])].sort();
  await putObject(INDEX_PATH, Buffer.from(JSON.stringify({ updated: new Date().toISOString(), files: merged })),
    { contentType: 'application/json', cacheControl: '60' });
  return { recorded: done.length, failed, indexSize: merged.length, published: true };
}

// ─── main ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  const args = process.argv.slice(2);
  const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const die = (msg) => { console.error('❌ ' + msg); process.exit(1); };
  const lists = phraseLists();
  const all = subtopics();

  if (args.includes('--list')) {
    for (const s of all) console.log(`${s.id.padEnd(10)} ${s.key.padEnd(24)} questions: ${s.questions.length}  sentences: ${sentencesFor(s, lists).length}`);
    console.log(`\n${all.length} subtopics | praise phrases: ${lists.praises.length} | numbers: ${lists.numbers.join(', ')} | speech guard: OK`);
    return;
  }

  const wanted = args.includes('--all') ? all
    : (arg('subtopic') ?? '').split(',').filter(Boolean).map((k) => all.find((s) => s.id === k || s.key === k) ?? die(`unknown subtopic ${k}`));
  if (!wanted.length) die('pass --subtopic=<id>[,<id>] or --all or --list');

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = wanted.map((s) => ({ id: s.id, key: s.key, sentences: sentencesFor(s, lists) }));
  const name = args.includes('--all') ? 'all' : wanted.map((s) => s.id || s.key).join('+');
  writeFileSync(join(OUT_DIR, `manifest_${name}.json`),
    JSON.stringify({ generated: new Date().toISOString(), praises: lists.praises, numbers: lists.numbers, subtopics: manifest }, null, 1), 'utf8');
  const total = manifest.reduce((n, s) => n + s.sentences.length, 0);
  const tooLong = manifest.flatMap((s) => s.sentences.filter((x) => x.too_long).map((x) => s.id + ':' + x.kind));
  console.log(`📝 manifest_${name}.json: ${manifest.length} subtopic(s), ${total} sentences${tooLong.length ? ` (${tooLong.length} over ${MAX_TTS_CHARS} chars, skipped: ${tooLong.join(' ')})` : ''}`);

  if (!args.includes('--upload')) return;
  if (args.includes('--all') || wanted.length !== 1) die('upload exactly ONE subtopic per run (--subtopic=<id>)');

  const URL = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY || !process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY) die('missing env (.env)');
  const auth = { Authorization: 'Bearer ' + KEY, apikey: KEY };
  const getObject = async (path) => {
    const res = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}?t=${Date.now()}`, { headers: auth });
    return { status: res.status, body: await res.text() };
  };
  const putObject = async (path, buf, { contentType, cacheControl }) => {
    const res = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST', body: buf,
      headers: { ...auth, 'Content-Type': contentType, 'cache-control': `max-age=${cacheControl}`, 'x-upsert': 'true' },
    });
    if (!res.ok) throw new Error('upload ' + path + ': HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
  };
  try {
    const r = await publish(manifest.flatMap((s) => s.sentences), { getObject, putObject, synthesize, log: console.log });
    console.log(`✅ recorded ${r.recorded}, failed ${r.failed}; ${r.published ? 'index now lists ' + r.indexSize + ' clips' : 'index unchanged'}`);
    if (r.failed) process.exitCode = 1;
  } catch (e) {
    die(e.message);
  }
}
