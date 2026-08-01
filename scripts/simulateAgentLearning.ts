/**
 * scripts/simulateAgentLearning.ts
 *
 * Proves the learning agent actually learns, without waiting for enough
 * real traffic to show it. With ~26 testers and a handful of real answers,
 * question_difficulty/user_ability don't yet have enough data for the
 * "the agent improves over time" graph to be honest — this script produces
 * that evidence a different, standard way: OFFLINE EVALUATION on simulated
 * data, using the EXACT SAME algorithm as production.
 *
 * It imports supabase/functions/_shared/elo.ts directly — the same file
 * agent-select-questions and agent-record-answer import. There is no
 * second implementation of the ELO math to keep in sync; if this script's
 * graph says the agent improves, that is a claim about the real algorithm,
 * not about a stand-in.
 *
 * Method (standard "offline evaluation" / "replay" methodology):
 *   1. Build a synthetic population with TRUE hidden ability/difficulty
 *      values (unknown to the model — this is the simulation's ground
 *      truth, playing the role real human behavior would play).
 *   2. Freeze ONE held-out test set of (user, question) pairs, with
 *      outcomes drawn once from the TRUE probabilities and never touched
 *      again — a fixed exam the model is re-tested on throughout.
 *   3. Feed the model a stream of TRAINING answers (same TRUE probabilities
 *      generate each outcome), letting it update its ESTIMATED ratings via
 *      updateElo() exactly as production does, one answer at a time.
 *   4. After each checkpoint, score the model's CURRENT estimates against
 *      the frozen test set: log-loss, accuracy, AUC. Write the row to
 *      agent_metrics with is_simulated = true.
 *   5. Alongside it, write a "no-learning" baseline (every prediction stays
 *      at 0.5 forever) evaluated on the identical test set — the dashboard
 *      line that makes "learning helped" a comparison, not an assertion.
 *
 * Writes ONLY to agent_metrics (app_id, policy_version, log_loss, auc,
 * accuracy, sample_size, is_simulated) — a table with no foreign keys to
 * real questions/users, chosen for exactly this reason: this script can
 * run as many times as needed without ever touching a real row.
 *
 * Run: npx tsx scripts/simulateAgentLearning.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// No '.ts' extension here (unlike the Deno-side imports of this same file) —
// Deno requires an explicit extension, but the project's tsc config rejects
// one on the Node side (TS5097) without an extra compiler flag. Node/tsx
// resolves the extensionless path to the same file just fine.
import { updateElo, expectedCorrect, ELO_DEFAULT_RATING } from '../supabase/functions/_shared/elo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Load .env (same small loader every other script here uses) ───────────
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
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APP_ID       = '678d1968-f21e-4d02-aa96-463eb4dddd6b'; // same fixed id as the two migrations

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Simulation parameters ─────────────────────────────────────────────────
const N_USERS         = 200;   // order of magnitude of the real user base
const N_QUESTIONS     = 300;   // order of magnitude of the real question bank (828 today, kept smaller for a cleaner signal)
const TEST_SET_SIZE   = 4000;  // frozen, scored at every checkpoint
const CHECKPOINTS     = [100, 500, 1500, 3000, 6000, 12000, 25000, 50000]; // cumulative training answers seen
const RANDOM_SEED     = 20260730; // fixed seed — reproducible, not cherry-picked per run

// ── Deterministic PRNG (mulberry32) — reproducible across runs ───────────
function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, using the seeded RNG. */
function randNormal(rng: () => number, mean: number, stdDev: number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

const rng = makeRng(RANDOM_SEED);

// ── 1. Ground truth (hidden from the model) ───────────────────────────────
// Real learners vary; real questions vary. Both drawn from a normal spread
// around the same 1200 default the model itself starts from.
const trueUserAbility = Array.from({ length: N_USERS },     () => randNormal(rng, 1200, 220));
const trueQuestionDiff = Array.from({ length: N_QUESTIONS }, () => randNormal(rng, 1200, 180));

// ── 2. Model state (what the agent actually knows — starts blank) ─────────
const estUserAbility     = new Array(N_USERS).fill(ELO_DEFAULT_RATING);
const estUserAttempts    = new Array(N_USERS).fill(0);
const estQuestionDiff    = new Array(N_QUESTIONS).fill(ELO_DEFAULT_RATING);
const estQuestionAttempts = new Array(N_QUESTIONS).fill(0);

function drawPair(): { u: number; q: number } {
  return { u: Math.floor(rng() * N_USERS), q: Math.floor(rng() * N_QUESTIONS) };
}

/** Ground-truth outcome for a (user, question) pair — the "what really happened". */
function trueOutcome(u: number, q: number): boolean {
  const p = expectedCorrect(trueUserAbility[u], trueQuestionDiff[q]);
  return rng() < p;
}

// ── 3. Freeze ONE held-out test set, labels generated once and never reused for training ──
interface TestCase { u: number; q: number; outcome: boolean }
const testSet: TestCase[] = Array.from({ length: TEST_SET_SIZE }, () => {
  const { u, q } = drawPair();
  return { u, q, outcome: trueOutcome(u, q) };
});

// ── Evaluation: score the model's CURRENT estimates against the frozen test set ──
function evaluate(ability: number[], difficulty: number[]): { logLoss: number; accuracy: number; auc: number } {
  const eps = 1e-9;
  let lossSum = 0;
  let correctCount = 0;
  const positives: number[] = [];
  const negatives: number[] = [];

  for (const { u, q, outcome } of testSet) {
    const p = Math.min(1 - eps, Math.max(eps, expectedCorrect(ability[u], difficulty[q])));
    lossSum += outcome ? -Math.log(p) : -Math.log(1 - p);
    if ((p >= 0.5) === outcome) correctCount++;
    (outcome ? positives : negatives).push(p);
  }

  // AUC via the Mann-Whitney rank-sum identity: P(random positive scores
  // higher than random negative), computed by ranking all scores together.
  const scored = testSet.map(({ u, q }) => expectedCorrect(ability[u], difficulty[q]));
  const withLabel = scored.map((p, i) => ({ p, y: testSet[i].outcome }))
    .sort((a, b) => a.p - b.p);
  let rankSum = 0;
  let i = 0;
  let rank = 1;
  while (i < withLabel.length) {
    let j = i;
    while (j < withLabel.length && withLabel[j].p === withLabel[i].p) j++;
    const avgRank = (rank + (rank + (j - i) - 1)) / 2;
    for (let k = i; k < j; k++) if (withLabel[k].y) rankSum += avgRank;
    rank += j - i;
    i = j;
  }
  const nPos = positives.length, nNeg = negatives.length;
  const auc = nPos > 0 && nNeg > 0
    ? (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
    : 0.5;

  return {
    logLoss: lossSum / testSet.length,
    accuracy: correctCount / testSet.length,
    auc,
  };
}

// ── 4. Train, checkpointing along the way ─────────────────────────────────
interface MetricRow {
  policy_version: string;
  evaluated_at: string;
  sample_size: number;
  log_loss: number;
  auc: number;
  accuracy: number;
  is_simulated: boolean;
  notes: string;
}

// Wrapped in an async main(), not top-level await — tsx transforms this
// file in CJS mode, which esbuild rejects top-level await under (matches
// the pattern scripts/generateAllAudio.ts already uses).
async function main() {

const rows: MetricRow[] = [];
let trained = 0;
const baseTime = Date.now() - CHECKPOINTS[CHECKPOINTS.length - 1] * 1000; // spread checkpoints across fake timestamps for a readable time axis

// Baseline: no learning at all, ratings pinned at the default forever.
const baselineAbility = new Array(N_USERS).fill(ELO_DEFAULT_RATING);
const baselineDiff    = new Array(N_QUESTIONS).fill(ELO_DEFAULT_RATING);
const baselineEval = evaluate(baselineAbility, baselineDiff);

for (const checkpoint of CHECKPOINTS) {
  while (trained < checkpoint) {
    const { u, q } = drawPair();
    const outcome = trueOutcome(u, q);

    const { newAbility, newDifficulty } = updateElo({
      userAbility: estUserAbility[u],
      userAttempts: estUserAttempts[u],
      questionDifficulty: estQuestionDiff[q],
      questionAttempts: estQuestionAttempts[q],
      isCorrect: outcome,
    });
    estUserAbility[u]  = newAbility;
    estQuestionDiff[q] = newDifficulty;
    estUserAttempts[u]++;
    estQuestionAttempts[q]++;
    trained++;
  }

  const evalResult = evaluate(estUserAbility, estQuestionDiff);
  const evaluatedAt = new Date(baseTime + checkpoint * 1000).toISOString();

  rows.push({
    policy_version: 'elo-v1-simulated',
    evaluated_at: evaluatedAt,
    sample_size: checkpoint,
    log_loss: evalResult.logLoss,
    auc: evalResult.auc,
    accuracy: evalResult.accuracy,
    is_simulated: true,
    notes: `Offline evaluation on a frozen ${TEST_SET_SIZE}-case held-out set, ` +
           `after ${checkpoint} simulated training answers. Seed ${RANDOM_SEED}.`,
  });

  // One flat baseline row per checkpoint, at the same x-position, so the
  // dashboard can plot "with learning" vs "without" as two lines that share
  // a time axis.
  rows.push({
    policy_version: 'random-baseline',
    evaluated_at: evaluatedAt,
    sample_size: checkpoint,
    log_loss: baselineEval.logLoss,
    auc: baselineEval.auc,
    accuracy: baselineEval.accuracy,
    is_simulated: true,
    notes: 'No-learning baseline: every prediction fixed at the default rating (0.5 expected), for comparison.',
  });

  console.log(
    `sample_size=${String(checkpoint).padStart(6)}  ` +
    `log_loss=${evalResult.logLoss.toFixed(4)}  ` +
    `accuracy=${(evalResult.accuracy * 100).toFixed(1)}%  ` +
    `auc=${evalResult.auc.toFixed(4)}   ` +
    `(baseline: log_loss=${baselineEval.logLoss.toFixed(4)}, accuracy=${(baselineEval.accuracy * 100).toFixed(1)}%)`
  );
}

// ── 5. Write to agent_metrics ──────────────────────────────────────────────
console.log('');
console.log(`Writing ${rows.length} rows to agent_metrics...`);

const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_metrics`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify(rows.map(r => ({ app_id: APP_ID, ...r }))),
});

if (!res.ok) {
  console.error('❌ Failed to write agent_metrics:', await res.text());
  process.exit(1);
}

console.log('✅ Done. Query agent_metrics WHERE is_simulated = true to see the trend.');

} // end main()

main().catch((err) => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});
