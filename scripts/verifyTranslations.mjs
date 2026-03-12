/**
 * verifyTranslations.mjs
 * Verifies that signs 101-105 are correctly saved in both Supabase and signs.json
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIGNS_JSON_PATH = join(__dirname, '../content/signs.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ansLabels = ['א', 'ב', 'ג', 'ד'];

function truncate(str, len = 50) {
  if (!str) return '(ריק)';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

async function main() {
  console.log('\n🔍 בודק תמרורים 101-105 ב-Supabase ו-signs.json...\n');

  // Load signs.json
  const rawJson = readFileSync(SIGNS_JSON_PATH, 'utf-8').replace(/^\uFEFF/, '');
  const localSigns = JSON.parse(rawJson);

  // Fetch signs 101-105 from Supabase by display_order
  const { data: dbSigns, error: signsError } = await supabase
    .from('signs')
    .select('id, display_order, name_amharic, explanation_amharic')
    .in('display_order', [101, 102, 103, 104, 105])
    .order('display_order');

  if (signsError) {
    console.error('❌ שגיאה בטעינת תמרורים מ-Supabase:', signsError.message);
    process.exit(1);
  }

  if (!dbSigns || dbSigns.length === 0) {
    console.error('❌ לא נמצאו תמרורים 101-105 ב-Supabase');
    process.exit(1);
  }

  let totalIssues = 0;

  for (const dbSign of dbSigns) {
    const num = dbSign.display_order;
    console.log(`\n📋 תמרור ${num} (${dbSign.id}):`);

    // Check name_amharic
    const nameOk = dbSign.name_amharic && dbSign.name_amharic.trim().length > 0;
    console.log(`  שם: ${nameOk ? '✅' : '❌'} ${truncate(dbSign.name_amharic)}`);
    if (!nameOk) totalIssues++;

    // Check explanation_amharic
    const explOk = dbSign.explanation_amharic && dbSign.explanation_amharic.trim().length > 0;
    console.log(`  הסבר: ${explOk ? '✅' : '❌'} ${truncate(dbSign.explanation_amharic)}`);
    if (!explOk) totalIssues++;

    // Fetch questions from Supabase
    const { data: dbQuestions, error: qError } = await supabase
      .from('questions')
      .select('id, question_amharic, answers')
      .eq('sign_id', dbSign.id)
      .order('id');

    if (qError) {
      console.log(`  ❌ שגיאה בטעינת שאלות: ${qError.message}`);
      totalIssues++;
      continue;
    }

    if (!dbQuestions || dbQuestions.length === 0) {
      console.log(`  ❌ אין שאלות ב-Supabase`);
      totalIssues++;
      continue;
    }

    console.log(`  שאלות (${dbQuestions.length}):`);

    for (let qi = 0; qi < dbQuestions.length; qi++) {
      const q = dbQuestions[qi];
      const answers = typeof q.answers === 'string' ? JSON.parse(q.answers) : q.answers;

      const questionOk = q.question_amharic && q.question_amharic.trim().length > 0;
      const answerCount = answers ? answers.length : 0;
      const correctAnswers = answers ? answers.filter(a => a.is_correct) : [];
      const correctIdx = answers ? answers.findIndex(a => a.is_correct) : -1;
      const emptyAnswers = answers ? answers.filter(a => !a.text_amharic || a.text_amharic.trim() === '') : [];

      const qOk = questionOk && answerCount === 4 && correctAnswers.length === 1 && emptyAnswers.length === 0;

      console.log(`    שאלה ${qi + 1}: ${qOk ? '✅' : '❌'}`);
      if (!questionOk) {
        console.log(`      ⚠️  question_amharic ריק`);
        totalIssues++;
      } else {
        console.log(`      שאלה: ${truncate(q.question_amharic)}`);
      }
      console.log(`      תשובות: ${answerCount}/4`);
      if (answerCount !== 4) totalIssues++;

      if (correctAnswers.length === 1) {
        console.log(`      נכונה: ${ansLabels[correctIdx] || correctIdx}`);
      } else {
        console.log(`      ⚠️  תשובות נכונות: ${correctAnswers.length} (צריך בדיוק 1)`);
        totalIssues++;
      }

      if (emptyAnswers.length > 0) {
        console.log(`      ⚠️  ${emptyAnswers.length} תשובות ריקות`);
        totalIssues++;
      }
    }

    // Check signs.json sync
    const localSign = localSigns.find(s => s.id === dbSign.id);
    if (!localSign) {
      console.log(`  signs.json: ❌ תמרור לא נמצא בקובץ`);
      totalIssues++;
    } else {
      const nameSync = localSign.name_amharic === dbSign.name_amharic;
      const explSync = localSign.explanation_amharic === dbSign.explanation_amharic;
      const localQCount = localSign.questions ? localSign.questions.length : 0;
      const localAns4 = localSign.questions ? localSign.questions.every(q => q.answers && q.answers.length === 4) : false;

      const localOk = nameSync && explSync && localQCount === 3 && localAns4;
      console.log(`  signs.json: ${localOk ? '✅ מסונכרן' : '⚠️  יש הבדלים:'}`);
      if (!nameSync) {
        console.log(`    ⚠️  שם לא מסונכרן`);
        console.log(`      Supabase: ${truncate(dbSign.name_amharic)}`);
        console.log(`      local:    ${truncate(localSign.name_amharic)}`);
        totalIssues++;
      }
      if (!explSync) {
        console.log(`    ⚠️  הסבר לא מסונכרן`);
        totalIssues++;
      }
      if (localQCount !== 3) {
        console.log(`    ⚠️  שאלות ב-signs.json: ${localQCount} (צריך 3)`);
        totalIssues++;
      }
      if (!localAns4) {
        console.log(`    ⚠️  חלק מהשאלות ב-signs.json יש פחות מ-4 תשובות`);
        totalIssues++;
      }
    }
  }

  console.log('\n' + '─'.repeat(50));
  if (totalIssues === 0) {
    console.log('✅ הכל תקין! 5 תמרורים, 15 שאלות, 60 תשובות — הכל שמור כראוי.');
  } else {
    console.log(`⚠️  נמצאו ${totalIssues} בעיות — בדוק למעלה ותקן דרך כלי התרגום.`);
  }
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
