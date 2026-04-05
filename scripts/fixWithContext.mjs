/**
 * fixWithContext.mjs
 * Updates explanation + questions for a sign based on Hebrew context provided by user.
 *
 * Usage:
 *   node --env-file=.env scripts/fixWithContext.mjs --sign-number 701 --context "Hebrew description..."
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const API_KEY = process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
const contextArg = process.argv.find((a, i) => process.argv[i - 1] === '--context');

if (!signNumArg || !contextArg) {
  console.error('Usage: node --env-file=.env scripts/fixWithContext.mjs --sign-number 701 --context "Hebrew description"');
  process.exit(1);
}

const PREFIXES = [
  'ትክክል!',
  'አዎ!',
  'እሰይ የኔ ጎቨዝ።',
  'ትክክል፥ አቬት እውቀት።',
  'ጎሽ!',
  'እንድያ ነው!',
  'አቬት ችሎታ፥ ትክክል።',
];

const ANSWER_IDS = ['A', 'B', 'C', 'D'];

function findSignImagePath(sign) {
  const folders = readdirSync(join(ROOT, 'assets', 'images'))
    .map(f => join(ROOT, 'assets', 'images', f));
  for (const folder of folders) {
    const base = sign.image_filename.replace(/\.(png|jpg)$/i, '');
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const p = join(folder, base + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function callGemini(prompt, imagePath, retries = 4) {
  const parts = [{ text: prompt }];
  if (imagePath) {
    const imgBuf = readFileSync(imagePath);
    const base64 = imgBuf.toString('base64');
    const mimeType = imagePath.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    parts.unshift({ inline_data: { mime_type: mimeType, data: base64 } });
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });
    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch(e) {
      throw new Error('Failed to parse API response: ' + rawText.slice(0, 200));
    }
    if (data.error) {
      const isRetryable = data.error.message?.includes('high demand') || data.error.code === 429 || data.error.code === 503;
      if (isRetryable && attempt < retries) {
        const wait = attempt * 8000;
        console.log(`  Gemini busy, retrying in ${wait/1000}s (attempt ${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error('Gemini error: ' + data.error.message);
    }
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const textPart = responseParts.find(p => p.text) || responseParts[0];
    return textPart?.text?.trim() || '';
  }
}

function deleteOldSignAudio(signNumber) {
  const audioDir = join(ROOT, 'assets', 'audio');
  const files = readdirSync(audioDir);
  const toDelete = files.filter(f =>
    f === `${signNumber}_name.mp3` ||
    f === `${signNumber}_explanation.mp3` ||
    f.startsWith(`${signNumber}_q`) ||
    f.startsWith(`answer_${signNumber}_q`)
  );
  toDelete.forEach(f => unlinkSync(join(audioDir, f)));
  return toDelete.length;
}

function stripPrefix(text) {
  // Find the FIRST '!' in the first 20 chars (prefix is always short).
  // Only strip if something meaningful remains after it.
  const first20 = text.slice(0, 20);
  let firstBang = -1;
  for (let i = 0; i < first20.length; i++) {
    if (first20[i] === '!') {
      firstBang = i;
      break;
    }
  }
  if (firstBang > 0) {
    const rest = text.slice(firstBang + 1).trim();
    if (rest.length > 3) return rest;
  }
  return text.trim();
}

function shuffleAnswers(answers) {
  // Fisher-Yates shuffle
  const arr = [...answers];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQuestionsArray(signNumber, qa) {
  return qa.questions.map((q, qIdx) => {
    const qId = `${signNumber}_q${qIdx + 1}`;
    const prefix = PREFIXES[(parseInt(signNumber) + qIdx) % PREFIXES.length];

    // Clean and re-prefix explanation_correct using robust stripPrefix
    const corrExpClean = stripPrefix(q.explanation_correct_amharic);
    const corrExp = `${prefix} ${corrExpClean}`;

    // Shuffle answers so correct answer is not always first
    const shuffled = shuffleAnswers(q.answers);
    const answers = shuffled.map((a, aIdx) => {
      const aId = ANSWER_IDS[aIdx];
      return {
        id: aId,
        text_amharic: a.text_amharic,
        is_correct: a.is_correct,
        audio_filename: `answer_${qId}_${aId}.mp3`,
      };
    });

    return {
      id: qId,
      question_amharic: q.question_amharic,
      question_audio: `${qId}_question.mp3`,
      explanation_correct_amharic: corrExp,
      explanation_wrong_amharic: q.explanation_wrong_amharic,
      explanation_correct_audio: `${qId}_correct.mp3`,
      explanation_wrong_audio: `${qId}_wrong.mp3`,
      answers,
    };
  });
}

async function main() {
  console.log(`\n🔄 fixWithContext.mjs — Sign ${signNumArg}`);
  console.log('='.repeat(50));

  const signsPath = join(ROOT, 'content', 'signs.json');
  const signs = JSON.parse(readFileSync(signsPath, 'utf8'));
  const signIdx = signs.findIndex(s => s.image_filename === `${signNumArg}.png`);
  if (signIdx === -1) { console.error(`Sign ${signNumArg} not found`); process.exit(1); }
  const sign = signs[signIdx];
  console.log(`Found: ${sign.id} (${sign.name_hebrew})`);

  const imagePath = findSignImagePath(sign);
  if (!imagePath) { console.error('Image not found'); process.exit(1); }
  console.log(`Image: ${sign.image_filename}`);

  // Step 1: Clear old data
  const deleted = deleteOldSignAudio(signNumArg);
  signs[signIdx].name_amharic = '';
  signs[signIdx].explanation_amharic = '';
  signs[signIdx].questions = [];
  writeFileSync(signsPath, JSON.stringify(signs, null, 2), 'utf8');
  console.log(`Cleared old data (${deleted} audio files deleted)`);

  // Step 2: Generate Amharic explanation
  console.log('\nGenerating Amharic explanation...');
  const explPrompt = `You are an Israeli traffic sign expert teaching Ethiopian immigrants in Israel to understand driving theory in simple Amharic.

The official Hebrew description of this traffic sign is:
"${contextArg}"

Write a clear explanation in Amharic. Follow these rules STRICTLY:
1. Include ALL information from the Hebrew description — do NOT skip, shorten, or omit any rule, number, condition, or instruction.
2. Write in very SIMPLE Amharic that any person with basic literacy can understand — no complex words or academic language.
3. Do NOT repeat words from the same root in the same sentence (e.g. avoid using ምልክት, ምልክቱ, ምልክቶች together in one sentence).
4. Avoid complex verb forms — use the simplest possible phrasing.
5. Clearly state what the driver MUST DO and what is FORBIDDEN.
6. If the Hebrew mentions: overtaking (עקיפה), sign numbers (like 813, 926, 201 etc.), distances, specific conditions, times (day/night), or exceptions — include ALL of them in the explanation.
7. Maximum 4-5 short sentences.
8. Return ONLY the Amharic text — no headers, no JSON, no extra text.`;

  const explanationAmharic = await callGemini(explPrompt, imagePath);
  console.log(`New explanation: ${explanationAmharic.slice(0, 100)}...`);

  // Step 3: Generate Q&A
  console.log('\nGenerating questions + answers...');
  const qaPrompt = `You are an expert in Israeli driving theory exams and Amharic (Ge'ez script).

Sign info:
Hebrew name: "${sign.name_hebrew}"
Hebrew description: "${contextArg}"
Amharic explanation: "${explanationAmharic}"

Task: Create 3 exam questions in the style of the Israeli Ministry of Transport, translated to Amharic.

STRICT RULES:
- Question 1: "What does this sign mean?" style
- Question 2: "How do you behave according to this sign?" style
- Question 3: Specific question about one key rule from this sign
- Each question has exactly 4 answers (1 correct, 3 plausible but wrong)
- All answers must be in SIMPLE Amharic — no complex words
- The 3 wrong answers must be believable but clearly incorrect based on the Hebrew description
- explanation_correct_amharic: MUST be a FULL meaningful sentence (minimum 8 words) explaining WHY the answer is correct — never just one word or a fragment
- explanation_wrong_amharic: MUST start with "ስህተት! ትክክለኛው መልስ: " then explain the correct answer in full
- Do NOT repeat words from the same root in the same sentence
- The correct answer must always be placed FIRST in the answers array (it will be shuffled later)

Return ONLY valid JSON (no markdown, no extra text):
{
  "questions": [
    {
      "index": 1,
      "question_amharic": "...",
      "explanation_correct_amharic": "ትክክል! [full sentence explaining why this is correct]",
      "explanation_wrong_amharic": "ስህተት! ትክክለኛው መልስ: [full sentence with the correct answer]",
      "answers": [
        {"text_amharic": "...", "is_correct": true},
        {"text_amharic": "...", "is_correct": false},
        {"text_amharic": "...", "is_correct": false},
        {"text_amharic": "...", "is_correct": false}
      ]
    }
  ]
}`;

  const qaRaw = await callGemini(qaPrompt, imagePath);
  const qaJson = qaRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  let qa;
  try {
    qa = JSON.parse(qaJson);
  } catch(e) {
    console.error('Failed to parse QA JSON:', qaRaw.slice(0, 300));
    process.exit(1);
  }

  console.log(`Generated ${qa.questions.length} questions`);
  qa.questions.forEach((q, i) => {
    const correct = q.answers.find(a => a.is_correct);
    console.log(`   Q${i+1}: ${q.question_amharic.slice(0, 60)}`);
    console.log(`     correct: ${correct?.text_amharic?.slice(0, 60)}`);
  });

  // Step 4: Update signs.json
  signs[signIdx].explanation_amharic = explanationAmharic;
  signs[signIdx].questions = buildQuestionsArray(signNumArg, qa);
  writeFileSync(signsPath, JSON.stringify(signs, null, 2), 'utf8');
  console.log(`\nsigns.json updated (explanation + questions) for sign ${signNumArg}`);

  // Step 5: Delete old Supabase questions
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  console.log(`\nDeleting old Supabase questions for ${sign.id}...`);
  const { error } = await supabase.from('questions').delete().eq('sign_id', sign.id);
  if (error) console.warn('Supabase delete warning:', error.message);
  else console.log(`Old questions deleted from Supabase`);

  console.log('\n' + '='.repeat(50));
  console.log(`Done! Next steps:`);
  console.log(`   1. npx tsx scripts/generateAllAudio.ts`);
  console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs --from=${signNumArg} --to=${signNumArg}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
