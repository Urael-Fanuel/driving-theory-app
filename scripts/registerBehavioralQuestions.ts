/**
 * scripts/registerBehavioralQuestions.ts
 *
 * Registers every behavioral question as a row in the `questions` table.
 *
 * WHY THIS EXISTS
 * Behavioral questions live in content/*_scaffold.json and are rendered
 * from there. But `user_progress.question_id` and
 * `question_difficulty.question_id` are foreign keys to `questions`, so
 * without a matching row, every behavioral answer failed to save with a
 * 23503 FK violation (and api.ts retried 3x with backoff, wasting ~3
 * seconds per answer on the user's device). This registers them so those
 * foreign keys resolve.
 *
 * ⚠️ THESE ROWS ARE A REGISTRY, NOT THE CONTENT SOURCE.
 * The app still reads behavioral question text/answers from the bundled
 * JSON — that is what makes them work with no connection. These rows exist
 * only so progress and agent tracking can reference them. If the JSON ever
 * changes (new subtopic, reordered questions), re-run this script to keep
 * the registry in sync.
 *
 * ID SCHEME — must match backend/api.ts exactly
 * Both loadBehavioralExamQuestions() and loadBehavioralTopicQuestions()
 * build ids as `beh_{topicId}_{levelIndex}_{subtopicIndex}_{questionIndex}`.
 * This script reproduces that formula. If it ever drifts from api.ts, saves
 * will start failing again with the same FK violation, because the app will
 * send an id that has no row here.
 *
 * Prerequisite: backend/migration_behavioral_questions.sql must be run
 * first (it drops the NOT NULL constraint on questions.sign_id).
 *
 * Safe to re-run: upserts on the primary key, so it updates existing rows
 * rather than duplicating them.
 *
 * Run: npx tsx scripts/registerBehavioralQuestions.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load .env (same loader the other scripts here use) ───────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/** Every behavioral topic that has a scaffold file. */
const BEHAVIORAL_TOPICS = [
  'vehicle_knowledge',
  'mind_safety',
  'society_law',
  'the_road',
  'my_vehicle',
  'two_wheelers',
  'road_decisions',
  'basics_license',
];

/** Mirrors ANSWER_IDS in backend/api.ts. */
const ANSWER_IDS = ['A', 'B', 'C', 'D'] as const;

interface QuestionRow {
  id: string;
  sign_id: null;
  topic_id: string;
  question_amharic: string;
  answers: Array<{ id: string; text_amharic: string; is_correct: boolean }>;
  explanation_correct_amharic: string;
  explanation_wrong_amharic: string;
  difficulty: number;
}

function buildRows(): QuestionRow[] {
  const rows: QuestionRow[] = [];

  for (const topicId of BEHAVIORAL_TOPICS) {
    const path = join(ROOT, 'content', `${topicId}_scaffold.json`);
    if (!existsSync(path)) {
      console.warn(`⚠️  Scaffold not found, skipping: ${topicId}`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf8'));

    (data.levels ?? []).forEach((level: any, li: number) => {
      (level.subtopics ?? []).forEach((sub: any, si: number) => {
        (sub.questions ?? []).forEach((q: any, qi: number) => {
          rows.push({
            id: `beh_${topicId}_${li}_${si}_${qi}`,
            sign_id: null,
            topic_id: topicId,
            question_amharic: q.question_amharic ?? '',
            answers: (q.answers ?? []).map((a: any, ai: number) => ({
              id: ANSWER_IDS[ai] ?? 'A',
              text_amharic: a.text_amharic ?? '',
              is_correct: a.is_correct ?? false,
            })),
            // The app renders feedback for behavioral questions from the
            // JSON/TTS path, not from these columns — but the columns are
            // NOT NULL, so empty strings it is.
            explanation_correct_amharic: '',
            explanation_wrong_amharic: '',
            difficulty: 1,
          });
        });
      });
    });
  }

  return rows;
}

async function main() {
  const rows = buildRows();

  if (rows.length === 0) {
    console.error('❌ No behavioral questions found — nothing to register.');
    process.exit(1);
  }

  // Sanity checks before touching the database.
  const malformed = rows.filter(
    (r) => r.answers.length < 4 || !r.answers.some((a) => a.is_correct)
  );
  if (malformed.length > 0) {
    console.error(`❌ ${malformed.length} question(s) are malformed (need 4 answers + one correct):`);
    for (const m of malformed.slice(0, 5)) console.error(`   ${m.id}`);
    process.exit(1);
  }

  const duplicates = rows.length - new Set(rows.map((r) => r.id)).size;
  if (duplicates > 0) {
    console.error(`❌ ${duplicates} duplicate id(s) generated — aborting.`);
    process.exit(1);
  }

  const byTopic: Record<string, number> = {};
  for (const r of rows) byTopic[r.topic_id] = (byTopic[r.topic_id] ?? 0) + 1;

  console.log(`Registering ${rows.length} behavioral questions:`);
  for (const [t, c] of Object.entries(byTopic)) {
    console.log(`  ${t.padEnd(22)}${c}`);
  }
  console.log('');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      // Upsert on the primary key so re-running updates instead of failing.
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    console.error('❌ Insert failed:', res.status, await res.text());
    process.exit(1);
  }

  console.log('✅ Registered. Verifying...');

  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?sign_id=is.null&select=id`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    }
  );
  const range = check.headers.get('content-range');
  const count = range ? range.split('/')[1] : '?';
  console.log(`✅ questions with sign_id IS NULL (behavioral) now in DB: ${count}`);
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
