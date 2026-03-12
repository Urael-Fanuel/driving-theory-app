/**
 * scripts/startTranslationServer.mjs
 *
 * כלי תרגום מקומי — תמרורי אזהרה 101–153
 * מציג: שם + הסבר + 3 שאלות × 4 תשובות לכל תמרור
 * שומר ישירות ל-Supabase + signs.json
 *
 * הרצה:
 *   node --env-file=.env scripts/startTranslationServer.mjs
 * פתח בדפדפן: http://localhost:3001
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNS_JSON = join(ROOT, 'content', 'signs.json');

// ─── Load env ──────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Load signs.json ───────────────────────────────────────────────────────────
function loadSigns() {
  const raw = readFileSync(SIGNS_JSON, 'utf8');
  const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  return JSON.parse(stripped);
}

function saveSigns(signs) {
  writeFileSync(SIGNS_JSON, JSON.stringify(signs, null, 2), 'utf8');
}

// ─── HTML ──────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>כלי תרגום — תמרורי אזהרה</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #f0f2f5; direction: rtl; }

/* Header */
.header { background: #1a73e8; color: #fff; padding: 14px 24px; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 100; }
.header h1 { font-size: 17px; }
.header .sub { font-size: 12px; opacity: .75; }
#saveAllBtn { margin-right: auto; background: #fff; color: #1a73e8; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
#saveAllBtn:disabled { background: #ccc; color: #888; cursor: default; }
#globalStatus { font-size: 12px; }

/* Sign card */
.sign-card { background: #fff; border-radius: 10px; margin: 16px 24px; box-shadow: 0 1px 4px rgba(0,0,0,.1); overflow: hidden; }
.sign-header { background: #e8f0fe; padding: 10px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1a73e8; }
.sign-num { background: #1a73e8; color: #fff; border-radius: 6px; padding: 3px 10px; font-weight: bold; font-size: 15px; }
.sign-he { font-size: 15px; font-weight: bold; color: #333; }
.sign-saved-badge { margin-right: auto; font-size: 11px; color: #34a853; display: none; }

/* Sign fields */
.sign-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-bottom: 1px solid #eee; }
.field-group { padding: 12px 16px; border-left: 1px solid #eee; }
.field-group:first-child { border-left: none; }
.field-label { font-size: 11px; color: #888; margin-bottom: 4px; font-weight: bold; }
textarea { width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 13px; resize: vertical; font-family: inherit; direction: ltr; min-height: 56px; }
textarea:focus { outline: none; border-color: #1a73e8; }
textarea.dirty { border-color: #f4b400; background: #fffde7; }
textarea.saved { border-color: #34a853; background: #e8f5e9; }

/* Questions */
.questions-section { padding: 12px 16px; }
.q-block { border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
.q-header { background: #f8f9fa; padding: 8px 12px; font-size: 12px; font-weight: bold; color: #555; border-bottom: 1px solid #e0e0e0; }
.q-text-row { padding: 8px 12px; border-bottom: 1px solid #eee; }
.q-text-row textarea { min-height: 44px; }
.explanation-row { padding: 8px 12px; border-bottom: 1px solid #eee; }
.explanation-row textarea { min-height: 44px; width: 100%; }
.answers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.answer-cell { padding: 6px 12px; border-left: 1px solid #eee; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; gap: 8px; }
.answer-cell:nth-child(odd) { border-left: none; }
.answer-cell:last-child, .answer-cell:nth-last-child(2) { border-bottom: none; }
.answer-radio { margin-top: 10px; accent-color: #34a853; width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; }
.answer-label { font-size: 11px; font-weight: bold; color: #888; margin-bottom: 2px; }
.answer-cell textarea { min-height: 40px; font-size: 12px; }
.answer-correct-indicator { font-size: 10px; color: #34a853; font-weight: bold; }

/* Save button per card */
.card-save-row { padding: 10px 16px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; align-items: center; gap: 12px; }
.card-save-btn { background: #1a73e8; color: #fff; border: none; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; }
.card-save-btn:disabled { background: #aaa; cursor: default; }
.card-status { font-size: 12px; color: #888; }

/* Loading */
#loading { text-align: center; padding: 60px; color: #888; font-size: 16px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>כלי תרגום — תמרורי אזהרה 101–153</h1>
    <div class="sub">ערוך את השדות ולחץ "שמור" בכל תמרור</div>
  </div>
  <button id="saveAllBtn" disabled>💾 שמור הכל</button>
  <span id="globalStatus"></span>
</div>

<div id="loading">⏳ טוען תמרורים...</div>
<div id="cards"></div>

<script>
let allSigns = [];

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  const r = await fetch('/api/signs');
  allSigns = await r.json();
  document.getElementById('loading').style.display = 'none';
  renderAll();
}

// ── Render all sign cards ─────────────────────────────────────────────────────
function renderAll() {
  const container = document.getElementById('cards');
  container.innerHTML = '';
  allSigns.forEach(sign => container.appendChild(buildCard(sign)));
  updateSaveAllBtn();
}

function buildCard(sign) {
  const card = document.createElement('div');
  card.className = 'sign-card';
  card.id = 'card_' + sign.id;

  // Ensure 4 answers per question + pre-compute target correct position
  const questions = (sign.questions || []).map((q, qi) => {
    const answers = [...(q.answers || [])];
    while (answers.length < 4) {
      answers.push({ id: String.fromCharCode(65 + answers.length), text_amharic: '', is_correct: false });
    }
    // For signs 106+: pre-select correct position by formula so user sees the right slot
    // Signs 101–105 are already saved — show as-is from data
    const targetCorrectIdx = sign.display_order <= 105
      ? answers.findIndex(a => a.is_correct)
      : (sign.display_order - 101 + qi) % 4;
    return { ...q, answers, targetCorrectIdx };
  });

  const ansLabels = ['א', 'ב', 'ג', 'ד'];

  card.innerHTML =
    \`<div class="sign-header">
      <span class="sign-num">\${sign.display_order}</span>
      <span class="sign-he">\${esc(sign.name_hebrew)}</span>
      <span class="sign-saved-badge" id="badge_\${sign.id}">✅ נשמר</span>
    </div>
    <div class="sign-fields">
      <div class="field-group">
        <div class="field-label">שם — אמהרית</div>
        <textarea data-sign="\${sign.id}" data-field="name_amharic" rows="2">\${esc(sign.name_amharic||'')}</textarea>
      </div>
      <div class="field-group">
        <div class="field-label">הסבר — אמהרית</div>
        <textarea data-sign="\${sign.id}" data-field="explanation_amharic" rows="2">\${esc(sign.explanation_amharic||'')}</textarea>
      </div>
    </div>
    <div class="questions-section">
      \${questions.map((q, qi) => \`
      <div class="q-block">
        <div class="q-header">שאלה \${qi+1}</div>
        <div class="q-text-row">
          <div class="field-label">טקסט השאלה — אמהרית</div>
          <textarea data-sign="\${sign.id}" data-qid="\${q.id}" data-field="question_amharic" rows="2">\${esc(q.question_amharic||'')}</textarea>
        </div>
        <div class="answers-grid">
          \${q.answers.map((a, ai) => \`
          <div class="answer-cell">
            <input type="radio" class="answer-radio" name="correct_\${q.id}" value="\${a.id}"
              \${ai === q.targetCorrectIdx ? 'checked' : ''}
              data-sign="\${sign.id}" data-qid="\${q.id}" data-ansid="\${a.id}">
            <div style="flex:1">
              <div class="answer-label">\${ansLabels[ai]} \${ai === q.targetCorrectIdx ? '✓ נכונה' : ''}</div>
              <textarea data-sign="\${sign.id}" data-qid="\${q.id}" data-ansid="\${a.id}" data-field="answer_text" rows="2">\${esc(a.text_amharic||'')}</textarea>
            </div>
          </div>
          \`).join('')}
        </div>
        <div class="explanation-row">
          <div class="field-label" style="color:#34a853">✅ הסבר תשובה נכונה — אמהרית</div>
          <textarea data-sign="\${sign.id}" data-qid="\${q.id}" data-field="explanation_correct_amharic" rows="2" style="border-color:#34a853">\${esc(q.explanation_correct_amharic||'')}</textarea>
        </div>
        <div class="explanation-row">
          <div class="field-label" style="color:#ea4335">❌ הסבר תשובה שגויה — אמהרית</div>
          <textarea data-sign="\${sign.id}" data-qid="\${q.id}" data-field="explanation_wrong_amharic" rows="2" style="border-color:#ea4335">\${esc(q.explanation_wrong_amharic||'')}</textarea>
        </div>
      </div>
      \`).join('')}
    </div>
    <div class="card-save-row">
      <button class="card-save-btn" id="savebtn_\${sign.id}" onclick="saveCard('\${sign.id}')">💾 שמור תמרור \${sign.display_order}</button>
      <span class="card-status" id="status_\${sign.id}"></span>
    </div>\`;

  // Mark dirty on input
  card.querySelectorAll('textarea, input[type=radio]').forEach(el => {
    el.addEventListener('input', () => markDirty(sign.id, el));
    el.addEventListener('change', () => markDirty(sign.id, el));
  });

  return card;
}

function markDirty(signId, el) {
  if (el.tagName === 'TEXTAREA') el.classList.add('dirty');
  document.getElementById('savebtn_' + signId).disabled = false;
  updateSaveAllBtn();
}

function updateSaveAllBtn() {
  const anyDirty = document.querySelectorAll('textarea.dirty').length > 0;
  document.getElementById('saveAllBtn').disabled = !anyDirty;
}

// ── Save a single card ────────────────────────────────────────────────────────
async function saveCard(signId) {
  const btn = document.getElementById('savebtn_' + signId);
  const statusEl = document.getElementById('status_' + signId);
  btn.disabled = true;
  btn.textContent = '⏳ שומר...';
  statusEl.textContent = '';

  // Collect sign-level fields
  const signFields = {};
  document.querySelectorAll(\`textarea[data-sign="\${signId}"][data-field]\`).forEach(ta => {
    const field = ta.dataset.field;
    const qid = ta.dataset.qid;
    const ansid = ta.dataset.ansid;
    if (!qid && !ansid) signFields[field] = ta.value;
  });

  // Collect questions
  const questions = {};
  document.querySelectorAll(\`[data-sign="\${signId}"][data-qid]\`).forEach(el => {
    const qid = el.dataset.qid;
    if (!questions[qid]) questions[qid] = { id: qid, answers: {} };
    const ansid = el.dataset.ansid;
    if (el.tagName === 'TEXTAREA' && !ansid) {
      questions[qid][el.dataset.field] = el.value;
    } else if (el.tagName === 'TEXTAREA' && ansid) {
      if (!questions[qid].answers[ansid]) questions[qid].answers[ansid] = {};
      questions[qid].answers[ansid].text_amharic = el.value;
    } else if (el.tagName === 'INPUT' && el.type === 'radio' && el.checked) {
      questions[qid].correctAnswerId = ansid;
    }
  });

  // Convert answers object → array
  const questionsArray = Object.values(questions).map(q => ({
    ...q,
    answers: Object.entries(q.answers).map(([id, a]) => ({
      id,
      text_amharic: a.text_amharic || '',
      is_correct: id === q.correctAnswerId,
    })),
  }));

  const r = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signId, signFields, questions: questionsArray, displayOrder: allSigns.find(s => s.id === signId)?.display_order }),
  });
  const res = await r.json();

  btn.textContent = \`💾 שמור תמרור\`;
  if (res.ok) {
    statusEl.textContent = '✅ נשמר';
    statusEl.style.color = '#34a853';
    document.getElementById('badge_' + signId).style.display = 'inline';
    document.querySelectorAll(\`[data-sign="\${signId}"] textarea\`).forEach(ta => {
      ta.classList.remove('dirty');
      ta.classList.add('saved');
    });
    updateSaveAllBtn();
  } else {
    statusEl.textContent = '❌ שגיאה: ' + res.error;
    statusEl.style.color = '#c62828';
    btn.disabled = false;
  }
}

// ── Save All ──────────────────────────────────────────────────────────────────
async function saveAll() {
  const dirtyCards = [...new Set(
    [...document.querySelectorAll('textarea.dirty')].map(el => el.dataset.sign)
  )];
  document.getElementById('globalStatus').textContent = \`שומר \${dirtyCards.length} תמרורים...\`;
  for (const id of dirtyCards) await saveCard(id);
  document.getElementById('globalStatus').textContent = '✅ הכל נשמר!';
  setTimeout(() => document.getElementById('globalStatus').textContent = '', 3000);
}

document.getElementById('saveAllBtn').addEventListener('click', saveAll);

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

load();
</script>
</body>
</html>`;

// ─── Answer position rotation ──────────────────────────────────────────────────
// Makes sure the correct answer appears at a different position for each question.
// Formula: targetPos = (displayOrder - 101 + questionIndex) % 4
// Signs 101 and 102 are already saved — don't touch them.
function reorderAnswers(answers, displayOrder, questionIndex) {
  if (displayOrder <= 105) return answers;
  const targetPos = (displayOrder - 101 + questionIndex) % 4;
  const correctIdx = answers.findIndex(a => a.is_correct);
  if (correctIdx === -1 || correctIdx === targetPos) return answers;
  const result = answers.filter((_, i) => i !== correctIdx);
  result.splice(targetPos, 0, answers[correctIdx]);
  return result;
}

// ─── Server ────────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // GET / → HTML
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  // GET /api/signs → warning signs 101–153 with questions, sorted
  if (req.method === 'GET' && url.pathname === '/api/signs') {
    const allSigns = loadSigns();
    const warningSigns = allSigns
      .filter(s => {
        const n = parseInt(s.image_filename);
        return n >= 101 && n <= 153;
      })
      .sort((a, b) => parseInt(a.image_filename) - parseInt(b.image_filename))
      .map(s => ({ ...s, display_order: parseInt(s.image_filename) }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(warningSigns));
    return;
  }

  // POST /api/save → save sign + questions to Supabase + signs.json
  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { signId, signFields, questions, displayOrder } = JSON.parse(body);

        // Rotate correct answer position for signs 103+
        const finalQuestions = questions.map((q, qi) => ({
          ...q,
          answers: reorderAnswers(q.answers, displayOrder || 0, qi),
        }));

        // 1. Update signs table
        const { error: signErr } = await supabase
          .from('signs')
          .update(signFields)
          .eq('id', signId);

        if (signErr) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: signErr.message }));
          return;
        }

        // 2. Update each question
        for (const q of finalQuestions) {
          const { error: qErr } = await supabase
            .from('questions')
            .update({
              question_amharic: q.question_amharic,
              answers: q.answers,
              explanation_correct_amharic: q.explanation_correct_amharic || '',
              explanation_wrong_amharic: q.explanation_wrong_amharic || '',
            })
            .eq('id', q.id);

          if (qErr) {
            console.log(`  ⚠️  question ${q.id}: ${qErr.message}`);
          }
        }

        // 3. Update signs.json locally
        const allSigns = loadSigns();
        const idx = allSigns.findIndex(s => s.id === signId);
        if (idx !== -1) {
          Object.assign(allSigns[idx], signFields);
          // Update questions
          for (const q of finalQuestions) {
            const qi = allSigns[idx].questions?.findIndex(x => x.id === q.id);
            if (qi !== undefined && qi !== -1) {
              allSigns[idx].questions[qi].question_amharic = q.question_amharic;
              allSigns[idx].questions[qi].explanation_correct_amharic = q.explanation_correct_amharic || '';
              allSigns[idx].questions[qi].explanation_wrong_amharic = q.explanation_wrong_amharic || '';
              // Replace answers entirely — preserves all 4 answers including D
              allSigns[idx].questions[qi].answers = q.answers;
            }
          }
          saveSigns(allSigns);
        }

        console.log(`  ✅  שמור: ${signId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🌐  כלי תרגום — תמרורי אזהרה 101–153  ║');
  console.log('║                                          ║');
  console.log(`║   פתח בדפדפן: http://localhost:${PORT}      ║`);
  console.log('║                                          ║');
  console.log('║   Ctrl+C לסיום                           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
