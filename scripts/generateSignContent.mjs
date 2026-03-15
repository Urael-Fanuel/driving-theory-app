/**
 * generateSignContent.mjs
 *
 * Uses Gemini API to generate full Amharic content for traffic signs:
 * - name_amharic, explanation_amharic
 * - 3 questions per sign, each with 4 answers + correct/wrong explanations
 *
 * Saves to: signs.json (local) + Supabase + Google Docs
 *
 * Usage:
 *   node --env-file=.env scripts/generateSignContent.mjs --sign-number 106 --limit 5
 *   node --env-file=.env scripts/generateSignContent.mjs --sign-number 111 --limit 5
 *   node --env-file=.env scripts/generateSignContent.mjs --dry-run --sign-number 106 --limit 5
 *
 * Requires: GEMINI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const SIGNS_PATH  = join(ROOT, 'content', 'signs.json');
const BACKUP_PATH = join(ROOT, 'content', 'signs.json.backup');
const IMAGES_DIR  = join(ROOT, 'assets', 'images');

// Search for image in flat dir first, then in named subdirectories
function findImagePath(filename) {
  const candidates = [
    join(IMAGES_DIR, filename),
    join(IMAGES_DIR, 'תמרורי אזהרה', filename),
    join(IMAGES_DIR, 'תמרורי הוריה', filename),
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

// ─── Google Apps Script URL (saves to Google Docs) ────────────────────────────
const GOOGLE_DOCS_URL = 'https://script.google.com/macros/s/AKfycbxf82JhSe_amhei9x-feBRQTD5uHtq_Z8KgZ4S6uANAwXLMDTZOd_G-_328JMxDFumr/exec';

// ─── Args ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1], 10)
  : 5;

const SIGN_NUMBER_ARG = process.argv.find(a => a.startsWith('--sign-number=') || a === '--sign-number');
const SIGN_NUMBER = SIGN_NUMBER_ARG
  ? parseInt(SIGN_NUMBER_ARG.includes('=') ? SIGN_NUMBER_ARG.split('=')[1] : process.argv[process.argv.indexOf('--sign-number') + 1], 10)
  : 106;

// ─── Gemini config ────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const DELAY_MS       = 10000;
const RETRY_DELAY_MS = 30000;
const MAX_RETRIES    = 3;

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Answer rotation ──────────────────────────────────────────────────────────
// Rotates correct answer to a different position per question/sign
// Formula: targetPos = (signNumber - 101 + questionIndex) % 4
// Always relabels A/B/C/D based on final position (fixes id:"undefined" bug)
function rotateAnswers(answers, signNumber, questionIndex) {
  const targetPos  = (signNumber - 101 + questionIndex) % 4;
  const correctIdx = answers.findIndex(a => a.is_correct);
  let result = [...answers];
  if (correctIdx !== -1 && correctIdx !== targetPos) {
    result = answers.filter((_, i) => i !== correctIdx);
    result.splice(targetPos, 0, answers[correctIdx]);
  }
  // Always relabel A/B/C/D based on final position
  return result.map((a, i) => ({ ...a, id: ['A', 'B', 'C', 'D'][i] }));
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `\
You are an expert in Israeli traffic signs and Amharic language.
Your audience is Ethiopian immigrants in Israel who are learning to drive.
Write in clear, simple Amharic that any ordinary adult can understand.

STRICT STYLE RULES — follow exactly:

1. name_amharic: A FULL SENTENCE (not short words) that describes what the sign indicates.
   Pattern: "xxxxxxxxx ያመለክታል።"
   Example for bump sign: "ከፊትህ ባለው መንገድ ላይ የጎደጎደ ወይም የተበላሸ መንገድ መኖሩን ያመለክታል።"

2. explanation_amharic: Exactly 2 sentences.
   Sentence 1: starts with "ይህ ምልክት " — what the sign warns about.
   Sentence 2: starts with "አሽከርካሪው " — what the driver must do.
   Example: "ይህ ምልክት በመንገዱ ላይ ጉድጓዶች፣ እብጠቶች ወይም መጥፎ ጥርጊያ መኖሩን ያስጠነቅቀናል። አሽከርካሪው ይህንን ምልክት ሲያይ ፍጥነቱን መቀነስ እና ጥንቃቄ ማድረግ አለበት።"

3. Write exactly 3 questions:
   - Question 1: ALWAYS "ይህን የትራፊክ ምልክት ስታይ ምን ማድረግ ይገባል?" (what to do when seeing this sign)
   - Question 2: ALWAYS "ይህ ምልክት በየትኛው የምልክት ምድብ ውስጥ ይመደባል?" (which sign category)
   - Question 3: A specific question about what this particular sign warns about or means.

4. Each question has exactly 4 answers (A, B, C, D) — only one is correct.
   Answers are COMPLETE SENTENCES ending with "።"
   Example: "ፍጥነትን መቀነስ እና በመንገዱ ላይ ለሚገኙ ጉድጓዶች ወይም እብጠቶች መዘጋጀት።"

5. explanation_correct_amharic: MUST start with "ትክክል! " then explain why it is correct (1-2 sentences).
   Example: "ትክክል! ይህ ምልክት መንገድ ላይ ጉድጓድ ወይም እብጠት እንዳለ ያሳያል። ፍጥነት መቀነስ መኪናህን ከጉዳት ይጠብቃል።"

6. explanation_wrong_amharic: MUST start with "ስህተት! ትክክለኛው መልስ: " then repeat the correct answer, then explain why.
   Example: "ስህተት! ትክክለኛው መልስ: ፍጥነትን መቀነስ እና ... ፍጥነት መጨመር አደጋ ሊያስከትል ይችላል።"

7. For Question 2 (sign category), the 4 answers must always be these exact options:
   - "የማስጠንቀቂያ ምልክቶች።" (warning)
   - "የትእዛዝ ምልክቶች።" (regulatory)
   - "የቅድሚያ መብት ምልክቶች።" (right of way)
   - "የመረጃ ምልክቶች።" (information)
   Mark the correct one based on the sign's category.

8. If similar signs exist with different directions (right/left), explicitly mention the specific direction in name, explanation, and all questions/answers.

9. Use correct Amharic spelling and diacritics (fidel).

10. Return valid JSON only — no markdown, no code fences, no extra text.`;

// Topic ID → Amharic category answer
const TOPIC_CATEGORY_MAP = {
  warning:      'የማስጠንቀቂያ ምልክቶች።',
  regulatory:   'የትእዛዝ ምልክቶች።',
  right_of_way: 'የቅድሚያ መብት ምልክቶች።',
  information:  'የመረጃ ምልክቶች።',
  road_markings:'የመረጃ ምልክቶች።',
  safety:       'የማስጠንቀቂያ ምልክቶች።',
};

function buildPrompt(sign, previousResult = null) {
  const signNum  = sign.image_filename?.replace('.png', '') ?? sign.id;
  const category = TOPIC_CATEGORY_MAP[sign.topic_id] ?? 'የማስጠንቀቂያ ምልክቶች།';

  let mirrorContext = '';
  if (previousResult) {
    mirrorContext = `
── MIRROR SIGN CHECK ──
The FIRST image above is the PREVIOUS sign. The SECOND image is the CURRENT sign.
Compare both images carefully.

IF the current sign is a MIRROR VERSION of the previous sign (same shape/type but opposite direction — e.g. arrows pointing left vs right):
  → Copy the EXACT same content from the previous sign below.
  → Replace ONLY the direction words throughout ALL fields:
      ወደ ቀኝ  ↔  ወደ ግራ
      የቀኝ    ↔  የግራ
      ቀኝ     ↔  ግራ
  → Keep every sentence structure, every question, every answer — identical except direction.
  → Return the mirrored JSON.

IF the current sign is NOT a mirror (different type/shape/meaning):
  → Ignore the previous sign content completely.
  → Generate fresh content as described below.

Previous sign content for reference:
${JSON.stringify(previousResult, null, 2)}
── END MIRROR CHECK ──
`;
  }

  return `Look carefully at the image(s) provided above.${mirrorContext}

Create full Amharic content for Israeli traffic sign number ${signNum}.

Hebrew name: ${sign.name_hebrew}
Category: ${sign.topic_id || 'warning'} → correct Amharic category answer = "${category}"

Return this EXACT JSON structure (follow style rules strictly):
{
  "name_amharic": "full sentence ending with ያመለክታል།",
  "explanation_amharic": "Sentence starting with ይህ ምልክት... Second sentence starting with አሽከርካሪው...",
  "questions": [
    {
      "question_amharic": "ይህን የትራፊክ ምልክት ስታይ ምን ማድረግ ይገባል?",
      "answers": [
        {"id": "A", "text_amharic": "complete sentence ending with ።", "is_correct": true},
        {"id": "B", "text_amharic": "complete sentence ending with ።", "is_correct": false},
        {"id": "C", "text_amharic": "complete sentence ending with ።", "is_correct": false},
        {"id": "D", "text_amharic": "complete sentence ending with ።", "is_correct": false}
      ],
      "explanation_correct_amharic": "ትክክል! ...",
      "explanation_wrong_amharic": "ስህተት! ትክክለኛው መልስ: ..."
    },
    {
      "question_amharic": "ይህ ምልክት በየትኛው የምልክት ምድብ ውስጥ ይመደባል?",
      "answers": [
        {"id": "A", "text_amharic": "one of the 4 category options", "is_correct": false},
        {"id": "B", "text_amharic": "one of the 4 category options", "is_correct": false},
        {"id": "C", "text_amharic": "${category}", "is_correct": true},
        {"id": "D", "text_amharic": "one of the 4 category options", "is_correct": false}
      ],
      "explanation_correct_amharic": "ትክክል! ...",
      "explanation_wrong_amharic": "ስህተት! ትክክለኛው መልስ: ${category} ..."
    },
    {
      "question_amharic": "specific question about what this sign warns/indicates",
      "answers": [
        {"id": "A", "text_amharic": "complete sentence ending with ።", "is_correct": false},
        {"id": "B", "text_amharic": "complete sentence ending with ።", "is_correct": true},
        {"id": "C", "text_amharic": "complete sentence ending with ።", "is_correct": false},
        {"id": "D", "text_amharic": "complete sentence ending with ።", "is_correct": false}
      ],
      "explanation_correct_amharic": "ትክክል! ...",
      "explanation_wrong_amharic": "ስህተት! ትክክለኛው መልስ: ..."
    }
  ]
}`;
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
async function callGemini(sign, previousResult = null, previousSign = null) {
  const userParts = [];

  // If previous sign exists, send its image FIRST so Gemini can compare both
  if (previousSign?.image_filename) {
    const prevImagePath = findImagePath(previousSign.image_filename);
    if (prevImagePath) {
      const prevBase64 = readFileSync(prevImagePath).toString('base64');
      userParts.push({ inline_data: { mime_type: 'image/png', data: prevBase64 } });
    }
  }

  // Attach current sign image
  const imagePath = sign.image_filename ? findImagePath(sign.image_filename) : null;
  if (imagePath) {
    const imageBase64 = readFileSync(imagePath).toString('base64');
    userParts.push({ inline_data: { mime_type: 'image/png', data: imageBase64 } });
  }

  userParts.push({ text: buildPrompt(sign, previousResult) });

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
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`Invalid JSON from Gemini: ${raw.slice(0, 200)}`); }

  if (!parsed.name_amharic)        throw new Error('Missing name_amharic');
  if (!parsed.explanation_amharic) throw new Error('Missing explanation_amharic');
  if (!Array.isArray(parsed.questions) || parsed.questions.length < 3)
    throw new Error(`Expected 3 questions, got ${parsed.questions?.length ?? 0}`);

  for (const q of parsed.questions) {
    if (!q.question_amharic) throw new Error('Missing question_amharic');
    if (!Array.isArray(q.answers) || q.answers.length !== 4)
      throw new Error(`Expected 4 answers, got ${q.answers?.length ?? 0}`);
    if (!q.explanation_correct_amharic) throw new Error('Missing explanation_correct_amharic');
    if (!q.explanation_wrong_amharic)   throw new Error('Missing explanation_wrong_amharic');
  }

  return parsed;
}

async function callGeminiWithRetry(sign, previousResult = null, previousSign = null) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try { return await callGemini(sign, previousResult, previousSign); }
    catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      process.stdout.write(` ⚠️  retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ─── Supabase save ────────────────────────────────────────────────────────────
async function saveToSupabase(sign, result, signNumber) {
  // 1. Update signs table
  const { error: signErr } = await supabase
    .from('signs')
    .update({
      name_amharic:        result.name_amharic,
      explanation_amharic: result.explanation_amharic,
    })
    .eq('id', sign.id);

  if (signErr) {
    console.log(`   ⚠️  Supabase signs error: ${signErr.message}`);
    return;
  }

  // 2. Update each question
  for (let qi = 0; qi < result.questions.length; qi++) {
    const q         = result.questions[qi];
    const signQ     = sign.questions?.[qi];
    if (!signQ) continue;

    // Rotate answers
    const rotated = rotateAnswers(q.answers, signNumber, qi);

    const { error: qErr } = await supabase
      .from('questions')
      .update({
        question_amharic:             q.question_amharic,
        answers:                      rotated,
        explanation_correct_amharic:  q.explanation_correct_amharic,
        explanation_wrong_amharic:    q.explanation_wrong_amharic,
      })
      .eq('id', signQ.id);

    if (qErr) console.log(`   ⚠️  question ${signQ.id}: ${qErr.message}`);
  }
}

// ─── Google Docs save ─────────────────────────────────────────────────────────
async function saveToGoogleDocs(batchResults) {
  try {
    const res = await fetch(GOOGLE_DOCS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(batchResults, null, 2),
    });
    if (res.ok) console.log(`   📄  Saved to Google Docs ✅`);
    else        console.log(`   ⚠️  Google Docs failed: HTTP ${res.status}`);
  } catch (err) {
    console.log(`   ⚠️  Google Docs failed: ${err.message}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) { console.error('❌  GEMINI_API_KEY not set'); process.exit(1); }

  console.log(`\n🤖  generateSignContent.mjs${DRY_RUN ? '  [DRY-RUN]' : ''}`);
  console.log('═'.repeat(60));

  const signsData      = JSON.parse(readFileSync(SIGNS_PATH, 'utf-8'));
  const signs          = Array.isArray(signsData) ? signsData : signsData.signs;
  const startIndex     = signs.findIndex(s => s.image_filename === `${SIGN_NUMBER}.png`);

  if (startIndex === -1) {
    console.error(`❌  Sign ${SIGN_NUMBER} not found`); process.exit(1);
  }

  const signsToProcess = signs.slice(startIndex, startIndex + LIMIT);
  console.log(`🔍  Start: sign ${SIGN_NUMBER}  |  Processing: ${signsToProcess.length} signs`);
  console.log(`📋  ${signsToProcess[0]?.id} → ${signsToProcess[signsToProcess.length - 1]?.id}`);

  if (!DRY_RUN) {
    copyFileSync(SIGNS_PATH, BACKUP_PATH);
    console.log(`💾  Backup → content/signs.json.backup`);
  }

  console.log(`\n🔄  Generating...\n`);

  let changed = 0, failed = 0;
  const batchResults = [];

  // Pre-load mirror context from the sign immediately before the batch start.
  // This ensures mirror detection works even when re-running a single sign mid-batch.
  let previousSignResult = null;
  let previousSign       = null;
  if (startIndex > 0) {
    const prevSign = signs[startIndex - 1];
    if (prevSign?.name_amharic && Array.isArray(prevSign?.questions) && prevSign.questions.length >= 3) {
      previousSign = prevSign;
      previousSignResult = {
        name_amharic:        prevSign.name_amharic,
        explanation_amharic: prevSign.explanation_amharic,
        questions: prevSign.questions.map(q => ({
          question_amharic:            q.question_amharic,
          answers:                     q.answers,
          explanation_correct_amharic: q.explanation_correct_amharic,
          explanation_wrong_amharic:   q.explanation_wrong_amharic,
        })),
      };
      console.log(`🔗  Mirror context pre-loaded from: ${prevSign.id}`);
    }
  }

  for (let i = 0; i < signsToProcess.length; i++) {
    const sign      = signsToProcess[i];
    const signNum   = parseInt(sign.image_filename?.replace('.png', '') ?? '0');
    const num       = String(startIndex + i + 1).padStart(2, ' ');
    process.stdout.write(`  ${num}/${signs.length}  ${sign.id.padEnd(25)} `);

    if (DRY_RUN) { process.stdout.write(`[dry-run]\n`); continue; }

    let result;
    try { result = await callGeminiWithRetry(sign, previousSignResult, previousSign); }
    catch (err) {
      process.stdout.write(`❌  ${err.message.slice(0, 80)}\n`);
      failed++;
      previousSignResult = null;  // reset — failed sign can't be used as mirror reference
      previousSign       = null;
      await sleep(DELAY_MS);
      continue;
    }

    process.stdout.write(`✏️  done\n`);
    changed++;
    previousSignResult = result;  // save for next sign's mirror check
    previousSign       = sign;

    // Apply answer rotation to signs.json copy
    const rotatedQuestions = result.questions.map((q, qi) => ({
      ...q,
      answers: rotateAnswers(q.answers, signNum, qi),
    }));

    // Update signs.json in memory
    sign.name_amharic        = result.name_amharic;
    sign.explanation_amharic = result.explanation_amharic;
    for (let qi = 0; qi < rotatedQuestions.length; qi++) {
      const sq = sign.questions?.[qi];
      if (!sq) continue;
      sq.question_amharic              = rotatedQuestions[qi].question_amharic;
      sq.explanation_correct_amharic   = rotatedQuestions[qi].explanation_correct_amharic;
      sq.explanation_wrong_amharic     = rotatedQuestions[qi].explanation_wrong_amharic;
      sq.answers = rotatedQuestions[qi].answers.map((a, ai) => ({
        ...sq.answers?.[ai],
        id:           a.id,          // Always use id from rotated/relabeled answer (A/B/C/D)
        text_amharic: a.text_amharic,
        is_correct:   a.is_correct,
      }));
    }

    // Save to signs.json
    writeFileSync(SIGNS_PATH, JSON.stringify(Array.isArray(signsData) ? signs : signsData, null, 2), 'utf-8');

    // Save to Supabase
    await saveToSupabase(sign, { ...result, questions: rotatedQuestions }, signNum);

    // Collect for Google Docs
    batchResults.push({
      sign_id: sign.id,
      sign_number: signNum,
      name_hebrew: sign.name_hebrew,
      name_amharic: result.name_amharic,
      explanation_amharic: result.explanation_amharic,
      questions: rotatedQuestions,
    });

    if (i < signsToProcess.length - 1) await sleep(DELAY_MS);
  }

  // Send to Google Docs
  if (!DRY_RUN && batchResults.length > 0) {
    console.log(`\n📤  Sending to Google Docs...`);
    await saveToGoogleDocs(batchResults);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`📊  Done: ${changed}  |  Failed: ${failed}`);

  if (!DRY_RUN && changed > 0) {
    console.log(`\n⏭️   Next steps:`);
    console.log(`   1. npx tsx scripts/generateAllAudio.ts`);
    console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs`);
  }

  console.log(`\n✅  Done!`);
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
