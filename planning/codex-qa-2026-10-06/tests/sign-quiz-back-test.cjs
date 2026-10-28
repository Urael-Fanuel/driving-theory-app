// Runs the REAL handleBack of the Engine A sign quiz (app/(engineA)/question/[id].tsx, extracted with the
// TypeScript parser) with a fake router, to check that leaving the quiz does not leave a duplicate sign page
// behind (the extra press the owner complained about, 2026-10-27).
// NOT a React or device test.   Run from anywhere:  node sign-quiz-back-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');

const FILE = 'app/(engineA)/question/[id].tsx';
const src = fs.readFileSync(root + '/' + FILE, 'utf8');
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
let handleBackText = null;
const visit = n => {
  if (!handleBackText && ts.isVariableDeclaration(n) && n.name.getText(sf) === 'handleBack' && n.initializer) {
    let init = n.initializer;
    if (ts.isCallExpression(init) && init.expression.getText(sf) === 'useCallback') init = init.arguments[0];
    handleBackText = init.getText(sf);
  }
  ts.forEachChild(n, visit);
};
visit(sf);
assert.ok(handleBackText, 'handleBack not found');
const js = ts.transpileModule('module.exports = ' + handleBackText + ';',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function make({ signId, origin, canGoBack = true, stopHold, backThrowsOnce }) {
  const calls = { back: 0, replace: [], stop: 0, listen: 0 };
  const ctx = {
    module: { exports: null }, Promise, signId, origin, console: { warn() {}, log() {}, error() {} },
    leavingRef: { current: false },
    router: { canGoBack: () => canGoBack, back: () => { calls.back++; if (backThrowsOnce && calls.back === 1) throw new Error('nav'); }, replace: p => calls.replace.push(p) },
    stopAudio: async () => { calls.stop++; if (stopHold) await stopHold; },
    cancelListening: () => { calls.listen++; },
  };
  vm.runInNewContext(js, ctx);
  return { ctx, calls, fn: ctx.module.exports };
}
function run(opts) { const t = make(opts); return t.fn().then(() => t.calls); }

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); } catch (e) { results.push(['FAIL', name + '  ->  ' + String(e.message).split('\n')[0]]); }
}

(async () => {
  await scenario('quiz opened from this sign (no arrows used): goes back one page, no new page is opened', async () => {
    const c = await run({ signId: '302' });
    assert.strictEqual(c.back, 1); assert.deepStrictEqual(c.replace, []);
    assert.strictEqual(c.stop, 1); assert.strictEqual(c.listen, 1, 'audio and microphone must be stopped first');
  });
  await scenario('arrows used but the learner is back on the sign it started from: still goes back one page', async () => {
    const c = await run({ signId: '302', origin: '302' });
    assert.strictEqual(c.back, 1); assert.deepStrictEqual(c.replace, []);
  });
  await scenario('arrows moved to ANOTHER sign: opens the CURRENT sign page (the one below is a different sign)', async () => {
    const c = await run({ signId: '303', origin: '302' });
    assert.strictEqual(c.back, 0); assert.deepStrictEqual(c.replace, ['/(engineA)/sign/303']);
  });
  await scenario('nothing to go back to: opens the sign page instead of doing nothing', async () => {
    const c = await run({ signId: '302', canGoBack: false });
    assert.strictEqual(c.back, 0); assert.deepStrictEqual(c.replace, ['/(engineA)/sign/302']);
  });
  await scenario('R6-3: two in-app Back presses at the same moment (audio stop still pending) pop ONE page', async () => {
    let release; const hold = new Promise(r => { release = r; });
    const t = make({ signId: '302', stopHold: hold });
    const p1 = t.fn(); const p2 = t.fn();
    release(); await Promise.all([p1, p2]);
    assert.strictEqual(t.calls.back, 1, 'popped ' + t.calls.back + ' pages');
  });
  await scenario('R6-3: a failed exit releases the guard, the next press leaves', async () => {
    const t = make({ signId: '302', backThrowsOnce: true });
    await t.fn();
    assert.strictEqual(t.ctx.leavingRef.current, false);
    await t.fn();
    assert.strictEqual(t.calls.back, 2);
  });
  await scenario('wiring: the ‹ › sign arrows hand the starting sign on (origin = origin or this sign)', async () => {
    assert.strictEqual((src.match(/\?origin=\$\{origin \|\| signId\}/g) || []).length, 2);
  });

  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
