// supabase/functions/_shared/elo.ts
//
// The learning agent's entire "how does it learn" answer lives in this one
// file. Every place that computes an ELO update or an expected-correctness
// probability — agent-record-answer, agent-select-questions, and the offline
// simulation in scripts/simulateAgentLearning.mjs — imports THIS module
// rather than re-implementing the formulas. If the math only existed twice
// (once in production, once in the simulation), the "proof the agent
// improves" graph could quietly stop matching what production actually does.
//
// Deliberately plain TypeScript with zero runtime-specific APIs (no Deno.*,
// no Node built-ins) so it can be imported unmodified from a Deno Edge
// Function and from a Node script running via `tsx`.
//
// Why ELO and not a neural model: it produces a sane number from the very
// first answer (no cold-start problem with 26 users), and "the rating went
// up because they got more answers right than the model expected" is a
// sentence a project reviewer can verify by hand.

/** Every question and every user starts here before any data exists. */
export const ELO_DEFAULT_RATING = 1200;

/**
 * Probability that a user with `abilityRating` answers a question with
 * `difficultyRating` correctly, under the standard logistic ELO model.
 * Same formula chess uses for "expected score" — 400 is the standard scale
 * constant (a 400-point gap implies a 10x-more-likely outcome).
 */
export function expectedCorrect(abilityRating: number, difficultyRating: number): number {
  return 1 / (1 + Math.pow(10, (difficultyRating - abilityRating) / 400));
}

/**
 * How much a single answer should move a rating. Starts large (a rating
 * with little evidence behind it should move fast) and shrinks as more
 * evidence accumulates (`halfLife` is roughly "how many attempts until the
 * step size has roughly halved") — this is what makes ratings CONVERGE
 * instead of oscillating forever. Same idea as USCF chess's K=32 for new
 * players vs K=16 for established ones, just smoothed into a continuous
 * curve instead of a lookup table.
 */
export function kFactor(attemptsSoFar: number, base: number, halfLife: number): number {
  return base / (1 + attemptsSoFar / halfLife);
}

/** attemptsSoFar/halfLife saturating at 1.0 — "how much to trust this rating yet." */
export function confidenceFromAttempts(attemptsSoFar: number, halfLife = 20): number {
  return Math.min(1, attemptsSoFar / halfLife);
}

export interface EloUpdateInput {
  userAbility: number;
  /** Attempts already recorded for this user+topic BEFORE this answer. */
  userAttempts: number;
  questionDifficulty: number;
  /** Attempts already recorded for this question BEFORE this answer. */
  questionAttempts: number;
  isCorrect: boolean;
}

export interface EloUpdateResult {
  newAbility: number;
  newDifficulty: number;
  /** P(correct) the model held BEFORE seeing this answer — the input to log-loss/AUC evaluation. */
  expectedCorrectBefore: number;
}

/**
 * One answer, two ratings updated: the user's ability moves toward
 * "how well they actually did against this question's difficulty", and the
 * question's difficulty moves the OPPOSITE way (a question everyone gets
 * right drifts easier; a question everyone misses drifts harder).
 *
 * Questions accumulate evidence from every user in the app, so their
 * K-factor uses a longer half-life (50) than a single user's ability (20) —
 * a question's difficulty should settle down slower and be harder for any
 * one user's lucky/unlucky streak to swing.
 */
export function updateElo(input: EloUpdateInput): EloUpdateResult {
  const { userAbility, userAttempts, questionDifficulty, questionAttempts, isCorrect } = input;

  const expectedCorrectBefore = expectedCorrect(userAbility, questionDifficulty);
  const actual = isCorrect ? 1 : 0;

  const kUser     = kFactor(userAttempts, 32, 20);
  const kQuestion = kFactor(questionAttempts, 32, 50);

  const newAbility    = userAbility + kUser * (actual - expectedCorrectBefore);
  // Question difficulty moves opposite to the user's ability: a correct
  // answer (actual=1 > expected) should make the question look EASIER.
  const newDifficulty = questionDifficulty - kQuestion * (actual - expectedCorrectBefore);

  return { newAbility, newDifficulty, expectedCorrectBefore };
}

/**
 * How "desirable" a question is to show next: peaks at the target success
 * rate (0.7 by default — the commonly-cited sweet spot where material is
 * hard enough to be worth practicing but not so hard it's discouraging),
 * and falls off the further the predicted P(correct) is from it.
 * Used only for RANKING candidate questions, not for evaluation metrics.
 */
export function desirability(pCorrect: number, target = 0.7): number {
  return -Math.abs(pCorrect - target);
}
