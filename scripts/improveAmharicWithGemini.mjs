/**
 * improveAmharicWithGemini.mjs
 *
 * Uses Gemini 2.0 Flash to rewrite name_amharic + explanation_amharic
 * for all 60 signs in content/signs.json.
 *
 * Usage:
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs                              # all signs
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --sign-number 101 --limit 10 # signs 101-110
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --sign-number 111 --limit 10 # signs 111-120
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --dry-run                    # preview only
 *
 * Requires: GEMINI_API_KEY in .env
 */

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const SIGNS_PATH  = join(ROOT, 'content', 'signs.json');
const BACKUP_PATH = join(ROOT, 'content', 'signs.json.backup');
const AUDIO_DIR   = join(ROOT, 'assets', 'audio');

const DRY_RUN = process.argv.includes('--dry-run');

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1], 10)
  : Infinity;

const OFFSET_ARG = process.argv.find(a => a.startsWith('--offset=') || a === '--offset');
const OFFSET = OFFSET_ARG
  ? parseInt(OFFSET_ARG.includes('=') ? OFFSET_ARG.split('=')[1] : process.argv[process.argv.indexOf('--offset') + 1], 10)
  : 0;

const SIGN_NUMBER_ARG = process.argv.find(a => a.startsWith('--sign-number=') || a === '--sign-number');
const SIGN_NUMBER = SIGN_NUMBER_ARG
  ? parseInt(SIGN_NUMBER_ARG.includes('=') ? SIGN_NUMBER_ARG.split('=')[1] : process.argv[process.argv.indexOf('--sign-number') + 1], 10)
  : null;

// Verified facts (confirmed from an authoritative source) that ground Gemini's
// reading of specific signs — supplements the image, never replaces "look at
// the image" as the primary identification step. Edit this map per sign
// instead of passing long strings on the command line (keeps terminal
// commands short — see feedback_content_review_before_audio.md).
const SIGN_NOTES = {
  403: `Sign 403 (מחסום, shown with diagonal red-white stripes) itself means: the road ahead is closed/blocked. Separately, there is sometimes an ADDITIONAL directional sign posted alongside sign 403 pointing a mandatory detour direction. Per Wikipedia's Israeli road signs article, verbatim: 'מחסום: הדרך חסומה. הוצב תמרור המורה על כוון, מותר להתקדם רק בכוון המצוין בתמרור' — meaning: sign 403 alone means the road is closed; IF an additional direction sign is also posted with it, the driver is legally required to proceed only in that indicated direction. Do not claim the diagonal stripes on sign 403 itself are the direction indicator — the direction comes from a separate accompanying sign when present.`,
  404: `Sign 404 (מחסום) is specifically a railway level-crossing barrier (מחסום לפני מפגש מסילת ברזל) — NOT a generic road closure like sign 403. Per verified sources: the barrier can be lowered (horizontal), rising, or raised; the driver must stop and not proceed for as long as the barrier is in the lowered/horizontal or moving (rising/lowering) position. This is about a railway crossing gate, not a general road blockage — the explanation and questions must mention the railway/train crossing context explicitly.`,
  432: `Sign 432 (חניה אסורה / "No Parking", shown with ONE diagonal stripe over a blue circle) prohibits PARKING (leaving the vehicle standing/unattended for an extended time) on the side of the road where the sign is posted. Per verified source: it does NOT prohibit briefly stopping to pick up or drop off passengers, or to load/unload goods — that is explicitly PERMITTED under this sign. The prohibition applies from the sign until the next intersection or a cancelling sign (e.g. sign 434). This is a lighter restriction than sign 433 (No Stopping) — the explanation and at least one question must make clear that brief stopping for passengers/loading IS allowed under sign 432, in contrast to sign 433 where it is not.`,
  433: `Sign 433 (עצירה אסורה / "No Stopping", shown with TWO diagonal stripes over a blue circle) prohibits BOTH parking AND stopping completely on the side of the road where the sign is posted — including brief stops to pick up/drop off passengers or load/unload goods, which are NOT allowed here (unlike sign 432). The only exception is stopping required by law or a genuine emergency. The prohibition applies from the sign until the next intersection or a cancelling sign. This is a stricter restriction than sign 432 (No Parking) — the explanation and at least one question must make clear that NO stopping at all is allowed under sign 433, not even briefly for passengers, in contrast to sign 432.`,
  817: `Sign 817 is a ROAD MARKING, not a road-edge/obstacle indicator: alternating blue-and-white painted curbstones along the side of the road. Verified from two independent sources: this marking means parking IS PERMITTED next to these curbstones. The specific conditions (payment required, time limits, vehicle-type restrictions) are set by an ADDITIONAL accompanying sign 439 posted nearby — sign 817 alone does not itself impose payment or a time limit. If sign 439 is NOT posted alongside it, parking next to the blue-white curbstones is free, subject to the regular local parking rules. Do NOT describe this as marking a road edge, obstacle, or traffic island (that is signs 815/814) — it is specifically about permitted/regulated roadside parking. The explanation and at least one question must mention that sign 439 is what determines payment/time-limit conditions, and that without it parking there is free.`,
  818: `Sign 818 is a ROAD MARKING, NOT a physical barrier/fence closing the road (do not describe it as a gate or road-closure barrier). It consists of curbstones painted red-and-white (alternating or continuously) along the side of the road or a parking bay next to it — same physical style as sign 817 but red-white instead of blue-white. Verified from Israeli sources: it means an ABSOLUTE PROHIBITION on stopping AND parking a vehicle on the road or in the parking bay next to these red-white curbstones — unlike sign 817's blue-white marking (which permits parking), red-white means no stopping at all, not even briefly while remaining in the vehicle. This is the road-marking equivalent of sign 433 (No Stopping). Exceptions: (1) stopping required to comply with the law (e.g. a police officer's instruction or another sign), and (2) per traffic regulations, a taxi is permitted to stop briefly at the roadside specifically to pick up or drop off passengers. The explanation and at least one question must state this is an absolute stop+park ban (contrasted with sign 817's blue-white = permitted parking), and mention the law-compliance and taxi-passenger exceptions.`,
  807: `Sign 807 is a solid YELLOW line marking the edge of the drivable road surface (roadway boundary), used in places that have no curbstones — it substitutes for a curbstone at the right edge of the road. Verified from Israeli sources: this is NOT primarily a stopping/parking prohibition — it defines the right-hand boundary of the driving area. The instruction is: drive on the LEFT side of the line (i.e. stay within the driving lane), and it is absolutely forbidden to cross it or drive on its right side, EXCEPT: (1) to avoid an accident, (2) to overtake a vehicle driving very slowly that would obstruct traffic, or (3) when required to comply with the law. Do NOT describe this sign as being about stopping or parking a vehicle — that is a different topic (see signs 817/818, which are about curbstone-painting parking rules, a different marking). The explanation and at least one question must state that this line marks the road's right edge/boundary and must drive to its left, and must list the three crossing exceptions.`,
};
const EXTRA_CONTEXT_ARG = process.argv.find(a => a.startsWith('--extra-context='));
const EXTRA_CONTEXT = EXTRA_CONTEXT_ARG
  ? EXTRA_CONTEXT_ARG.split('=').slice(1).join('=')
  : (SIGN_NOTES[SIGN_NUMBER] ?? null);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const DELAY_MS       = 10000; // 10s between calls → ~6 req/min, well under free tier limit
const RETRY_DELAY_MS = 30000; // 30s wait on error (handles 429 quota reset)
const MAX_RETRIES    = 3;

// ─── Gemini prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `\
You are an expert driving instructor and Amharic content writer specializing in Israeli traffic signs. \
Your audience is Ethiopian immigrants in Israel who are learning to drive — many have limited reading ability.

Your goal is EDUCATION — write content that truly teaches. \
Model your output on this high-quality example for a warning sign:
  name_amharic: "የተበላሸ መንገድ ማስጠንቀቂያ"
  explanation_amharic: "ይህ ምልክት በመንገዱ ላይ ጉድጓዶች፣ እብጠቶች ወይም መጥፎ ጥርጊያ መኖሩን ያስጠነቅቀናል። አሽከርካሪው ይህንን ምልክት ሲያይ ፍጥነቱን መቀነስ እና ጥንቃቄ ማድረግ አለበት።"

Strict rules — follow all without exception:

1. name_amharic: A SHORT label (2–6 words) naming the sign — not a sentence.
   It must NOT restate or paraphrase anything that appears in explanation_amharic —
   the two fields must never overlap in wording or content. name_amharic is only
   a short title shown above the full explanation, never a summary of it.

2. explanation_amharic: 2–3 sentences covering ALL of:
   a. What this sign means and its purpose
   b. Exactly what the driver MUST DO — specific actions
   c. Consequence of ignoring it (danger, fine, accident)

3. questions: Exactly 3 questions that test understanding of THIS specific sign.
   Each question must have exactly 4 answers (A, B, C, D) — exactly 1 correct.
   Rules for questions:
   - Questions must be directly about what this sign means and what the driver must do
   - Each answer must be a FULL SENTENCE (not 2-3 words) — minimum 5 words
   - Correct answer must be clearly correct per Israeli traffic law
   - Wrong answers must be plausible but clearly wrong
   - explanation_correct_amharic: why the correct answer is right (1 sentence)
   - explanation_wrong_amharic: what the driver risks by choosing wrong (1 sentence)

4. Write in clear, simple Amharic that any ordinary adult can understand — no jargon.
5. Use a respectful, moderately formal tone — NOT street slang, NOT bureaucratic language.
6. Be 100% accurate to the Israeli Highway Code — never add or omit meaning.
7. Use correct Amharic spelling and diacritics (fidel) — this is critical.
8. Return valid JSON only — no markdown, no extra text, no code fences.`;

function buildPrompt(sign) {
  const signNum = sign.image_filename?.replace(/\.(png|jpg)$/i, '');
  const isNumeric = signNum && /^\d+$/.test(signNum);

  if (isNumeric) {
    const factLine = EXTRA_CONTEXT
      ? `\n\nMANDATORY FACT — verified from an authoritative source about this specific sign. This is not background color: it is REQUIRED that explanation_amharic explicitly covers this fact, and that AT LEAST ONE of the 3 questions specifically tests understanding of it. Do not contradict it, do not omit it, do not water it down to a generic statement: ${EXTRA_CONTEXT}`
      : '';
    return `This is Israeli traffic sign number ${signNum} (from the Israeli Highway Code).

Look at the image and use your knowledge of Israeli traffic laws (תקנות התעבורה) to write complete educational Amharic content for Ethiopian immigrants learning to drive in Israel.${factLine}

Return JSON with this exact structure:
{
  "name_amharic": "short 2-6 word label, must not overlap with explanation_amharic",
  "explanation_amharic": "2-3 sentences: meaning + what driver must do + consequence",
  "questions": [
    {
      "question_amharic": "question in Amharic?",
      "explanation_correct_amharic": "why correct answer is right",
      "explanation_wrong_amharic": "what the driver risks by choosing wrong",
      "answers": [
        { "id": "A", "text_amharic": "full sentence answer", "is_correct": false },
        { "id": "B", "text_amharic": "full sentence answer", "is_correct": true },
        { "id": "C", "text_amharic": "full sentence answer", "is_correct": false },
        { "id": "D", "text_amharic": "full sentence answer", "is_correct": false }
      ]
    },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] }
  ]
}`;
  }

  // Fallback for non-numeric signs (semantic IDs) — name + explanation only
  return `Write educational Amharic content for this Israeli traffic sign.

Hebrew sign name: ${sign.name_hebrew}
Sign category: ${sign.topic_id || 'traffic sign'}

Teach the learner: what this sign means, what the driver must do, and why it matters.
Return JSON:
{
  "name_amharic": "short 2-6 word label, must not overlap with explanation_amharic",
  "explanation_amharic": "..."
}`;
}

// ─── Image loader ─────────────────────────────────────────────────────────────

// Folders where downloaded sign images live, searched in order
const IMAGE_FOLDERS = [
  join(ROOT, 'assets', 'images', 'תמרורי זכות קדימה'),
  join(ROOT, 'assets', 'images', 'תמרורי הוריה'),
  join(ROOT, 'assets', 'images', 'תמרורי אזהרה'),
  join(ROOT, 'assets', 'images', 'תמרורי איסורים והגבלות'),
  join(ROOT, 'assets', 'images', 'תמרורי מודיעין והדרכה'),
  join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית'),
  join(ROOT, 'assets', 'images', 'תמרורי רמזורים ובקרת נתיבים'),
  join(ROOT, 'assets', 'images', 'תמרורי סימון על פני הדרך'),
  join(ROOT, 'assets', 'images', 'תמרורים באתר עבודה'),
];

function loadSignImage(sign) {
  const base = sign.image_filename?.replace(/\.(png|jpg|jpeg)$/i, '');
  if (!base) return null;
  const exts = ['.png', '.jpg', '.jpeg'];
  for (const folder of IMAGE_FOLDERS) {
    for (const ext of exts) {
      const p = join(folder, base + ext);
      if (existsSync(p)) {
        const data = readFileSync(p);
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        return { base64: data.toString('base64'), mime };
      }
    }
  }
  return null;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────

async function callGemini(sign, attempt = 1) {
  const img = loadSignImage(sign);
  const textPart = { text: buildPrompt(sign) };
  const userParts = img
    ? [{ inline_data: { mime_type: img.mime, data: img.base64 } }, textPart]
    : [textPart];

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
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from Gemini: ${raw.slice(0, 200)}`);
  }

  if (!parsed.name_amharic || !parsed.explanation_amharic) {
    throw new Error(`Missing fields in response: ${JSON.stringify(parsed)}`);
  }

  // Validate questions if present
  if (parsed.questions) {
    if (!Array.isArray(parsed.questions) || parsed.questions.length !== 3) {
      throw new Error(`questions must be array of 3, got: ${parsed.questions?.length}`);
    }
    for (const q of parsed.questions) {
      if (!q.question_amharic || !Array.isArray(q.answers) || q.answers.length !== 4) {
        throw new Error(`Invalid question structure: ${JSON.stringify(q).slice(0, 100)}`);
      }
      const correctCount = q.answers.filter(a => a.is_correct).length;
      if (correctCount !== 1) {
        throw new Error(`Each question must have exactly 1 correct answer, got ${correctCount}`);
      }
    }
  }

  return parsed;
}

async function callGeminiWithRetry(sign) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(sign, attempt);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      process.stdout.write(` ⚠️  retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDiff(field, oldVal, newVal) {
  if (oldVal === newVal) return '';
  return `    ${field}:\n      − ${oldVal}\n      + ${newVal}\n`;
}

// Same readable format as scripts/printSignContent.mjs and temp_behavioral/geminiTranslate.mjs
// output — [NAME]/[EXPLANATION]/[QUESTIONS], ge'ez answer letters, (✓) mark.
// Printed automatically for single-sign runs so the user reviews content in
// the SAME command that generated it — no separate print step needed.
const GEEZ_LETTERS = ['ሀ', 'ለ', 'ሐ', 'መ'];
function printReadableSign(sign, result) {
  console.log(`\n=== תמרור ${sign.name_hebrew} (${sign.id}) ===\n`);
  console.log('[NAME]');
  console.log(result.name_amharic || sign.name_amharic || '(ריק)');
  console.log('');
  console.log('[EXPLANATION]');
  console.log(result.explanation_amharic || sign.explanation_amharic || '(ריק)');
  const questions = result.questions || sign.questions;
  if (questions?.length) {
    console.log('');
    console.log('[QUESTIONS]');
    questions.forEach((q, i) => {
      console.log('');
      console.log(`${i + 1}. ${q.question_amharic || '(ריק)'}`);
      (q.answers || []).forEach((a, ai) => {
        const mark = a.is_correct ? ' (✓)' : '';
        console.log(`${GEEZ_LETTERS[ai] || ai + 1}. ${a.text_amharic}${mark}`);
      });
    });
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('❌  GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  console.log(`\n🤖  improveAmharicWithGemini.mjs${DRY_RUN ? '  [DRY-RUN — no files will be changed]' : ''}`);
  console.log('═'.repeat(60));

  // Load signs
  const signsData = JSON.parse(readFileSync(SIGNS_PATH, 'utf-8'));
  const signs     = Array.isArray(signsData) ? signsData : signsData.signs ?? Object.values(signsData);

  // Resolve start index — either from --sign-number or --offset
  let startIndex = OFFSET;
  if (SIGN_NUMBER !== null) {
    startIndex = signs.findIndex(s => s.image_filename === `${SIGN_NUMBER}.png`);
    if (startIndex === -1) {
      console.error(`❌  Sign number ${SIGN_NUMBER} not found (image_filename: "${SIGN_NUMBER}.png" missing in signs.json)`);
      process.exit(1);
    }
    console.log(`🔍  --sign-number ${SIGN_NUMBER} → found at position ${startIndex + 1} in array`);
  }

  const end = LIMIT === Infinity ? signs.length : startIndex + LIMIT;
  const signsToProcess = signs.slice(startIndex, end);
  const firstSign = signsToProcess[0];
  const lastSign  = signsToProcess[signsToProcess.length - 1];
  console.log(`📋  Signs loaded: ${signs.length}  |  Processing: ${signsToProcess.length}  (${firstSign?.id} → ${lastSign?.id})`);

  // Backup (only in live mode)
  if (!DRY_RUN) {
    copyFileSync(SIGNS_PATH, BACKUP_PATH);
    console.log(`💾  Backup saved → content/signs.json.backup`);
  }

  console.log(`\n🔄  Processing signs (${DRY_RUN ? 'dry-run preview' : 'live'})...\n`);

  let changed     = 0;
  let unchanged   = 0;
  let failed      = 0;
  const audioToDelete = [];
  const diffLines     = [];

  for (let i = 0; i < signsToProcess.length; i++) {
    const sign = signsToProcess[i];
    const num  = String(startIndex + i + 1).padStart(2, ' ');
    process.stdout.write(`  ${num}/${signs.length}  ${sign.id.padEnd(20)} `);

    let result;
    try {
      result = await callGeminiWithRetry(sign);
    } catch (err) {
      process.stdout.write(`❌  FAILED: ${err.message.slice(0, 80)}\n`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    const nameChanged = result.name_amharic        !== sign.name_amharic;
    const explChanged = result.explanation_amharic  !== sign.explanation_amharic;
    const hasNewQuestions = Array.isArray(result.questions) && result.questions.length === 3;

    if (!nameChanged && !explChanged && !hasNewQuestions) {
      process.stdout.write(`✓  (unchanged)\n`);
      unchanged++;
    } else {
      process.stdout.write(`✏️  changed${hasNewQuestions ? ' + questions' : ''}\n`);
      changed++;

      // Collect diff
      const diff = formatDiff('name_amharic', sign.name_amharic, result.name_amharic)
                 + formatDiff('explanation_amharic', sign.explanation_amharic, result.explanation_amharic);
      if (diff) diffLines.push(`  ${sign.id} (${sign.name_hebrew}):\n${diff}`);

      // Track audio files to delete (name + explanation)
      if (nameChanged && sign.audio_name_filename) audioToDelete.push(sign.audio_name_filename);
      if (explChanged && sign.audio_explanation_filename) audioToDelete.push(sign.audio_explanation_filename);

      // Track old question audio files
      if (hasNewQuestions && sign.questions) {
        for (const q of sign.questions) {
          if (q.question_audio) audioToDelete.push(q.question_audio);
          if (q.explanation_correct_audio) audioToDelete.push(q.explanation_correct_audio);
          if (q.explanation_wrong_audio) audioToDelete.push(q.explanation_wrong_audio);
          for (const a of (q.answers || [])) {
            if (a.audio_filename) audioToDelete.push(a.audio_filename);
          }
        }
      }

      // Apply changes
      if (!DRY_RUN) {
        sign.name_amharic        = result.name_amharic;
        sign.explanation_amharic = result.explanation_amharic;

        // Apply new questions with auto-generated IDs and audio filenames
        if (hasNewQuestions) {
          const signNum = sign.image_filename?.replace(/\.(png|jpg)$/i, '');
          sign.questions = result.questions.map((q, qi) => {
            const qKey = `${signNum}_q${qi + 1}`;
            return {
              id: qKey,
              question_amharic: q.question_amharic,
              question_audio: `${qKey}_question.mp3`,
              explanation_correct_amharic: q.explanation_correct_amharic,
              explanation_wrong_amharic: q.explanation_wrong_amharic,
              explanation_correct_audio: `${qKey}_correct.mp3`,
              explanation_wrong_audio: `${qKey}_wrong.mp3`,
              answers: q.answers.map(a => ({
                id: a.id,
                text_amharic: a.text_amharic,
                is_correct: a.is_correct,
                audio_filename: `answer_${qKey}_${a.id}.mp3`,
              })),
            };
          });
        }
      }
    }

    // Single-sign run — print the full readable content right here, in this
    // same command, so the user can review and approve without a second step.
    if (signsToProcess.length === 1) printReadableSign(sign, result);

    // Incremental save after every sign (live mode only)
    if (!DRY_RUN) {
      writeFileSync(SIGNS_PATH, JSON.stringify(Array.isArray(signsData) ? signs : signsData, null, 2), 'utf-8');
    }

    // Rate limit
    if (i < signsToProcess.length - 1) await sleep(DELAY_MS);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log(`📊  Results:`);
  console.log(`   ✏️   Changed  : ${changed}`);
  console.log(`   ✓   Unchanged: ${unchanged}`);
  console.log(`   ❌  Failed   : ${failed}`);

  if (diffLines.length > 0) {
    console.log(`\n📝  Changes summary:\n`);
    diffLines.forEach(d => console.log(d));
  }

  // ─── Audio cleanup ──────────────────────────────────────────────────────────

  if (audioToDelete.length > 0 && !DRY_RUN) {
    console.log(`\n🗑️   Deleting ${audioToDelete.length} stale audio files...`);
    let deleted = 0;
    for (const filename of audioToDelete) {
      const filePath = join(AUDIO_DIR, filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        deleted++;
      }
    }
    console.log(`   Deleted: ${deleted} files (${audioToDelete.length - deleted} were already missing)`);
  }

  if (DRY_RUN && audioToDelete.length > 0) {
    console.log(`\n🗑️   Audio files that would be deleted (${audioToDelete.length}):`);
    audioToDelete.forEach(f => console.log(`   - ${f}`));
  }

  // ─── Next steps ─────────────────────────────────────────────────────────────

  if (!DRY_RUN && changed > 0) {
    console.log(`\n⏭️   Next steps:`);
    console.log(`   1. npx tsx scripts/generateAllAudio.ts`);
    console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs`);
  }

  if (DRY_RUN) {
    console.log(`\n✅  Dry-run complete. Run without --dry-run to apply changes.`);
  } else {
    console.log(`\n✅  Done! signs.json updated.`);
    if (changed > 0) console.log(`   Backup preserved at: content/signs.json.backup`);
  }
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
