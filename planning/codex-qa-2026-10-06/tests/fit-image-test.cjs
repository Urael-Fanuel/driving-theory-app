// Logic test for hooks/useFitImageSize.ts (Engine A question screens: image shrinks so the 🎤 button fits).
// Loads the REAL file with a tiny fake of React's hooks. NOT an Android test. Run: node fit-image-test.cjs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
function make(max, min) {
  const cells = []; let i = 0, rerender = () => {};
  const R = {
    useState: (init) => { const k = i++; if (!(k in cells)) cells[k] = init; return [cells[k], (v) => { const nv = typeof v === 'function' ? v(cells[k]) : v; if (nv !== cells[k]) { cells[k] = nv; rerender(); } }]; },
    useRef: (init) => { const k = i++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
    useCallback: (fn) => fn,
  };
  const ctx = { exports: {}, require: p => p === 'react' ? R : {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/hooks/useFitImageSize.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  const call = () => { i = 0; return ctx.exports.useFitImageSize(max, min); };
  let hook = call(); rerender = () => { hook = call(); };
  return { get: () => hook, ev: h => ({ nativeEvent: { layout: { height: h } } }) };
}
const results = [];
const scenario = (n, f) => { try { f(); results.push(['OK  ', n]); } catch (e) { results.push(['FAIL', n + '  ->  ' + e.message]); } };

scenario('1 content taller than the screen by 90: the image gives up exactly 90 (200 -> 110 but never below 120 -> 120)', () => {
  const h = make(200, 120); h.get().onLayout(h.ev(800), true); h.get().onContent(890, true);
  assert.strictEqual(h.get().size, 120);
});
scenario('2 overflow 50: 200 -> 150, and the next measurement (now fitting) changes nothing', () => {
  const h = make(200, 120); h.get().onLayout(h.ev(800), true); h.get().onContent(850, true);
  assert.strictEqual(h.get().size, 150);
  h.get().onContent(800, true); assert.strictEqual(h.get().size, 150);
});
scenario('3 content fits: the image stays at its full size', () => {
  const h = make(220, 120); h.get().onLayout(h.ev(900), true); h.get().onContent(850, true);
  assert.strictEqual(h.get().size, 220);
});
scenario('4 never grows back (the 🎤 button disappears after an answer)', () => {
  const h = make(200, 120); h.get().onLayout(h.ev(800), true); h.get().onContent(850, true);
  h.get().onContent(700, true); assert.strictEqual(h.get().size, 150);
});
scenario('5 a question without an image never shrinks it', () => {
  const h = make(200, 120); h.get().onLayout(h.ev(800), false); h.get().onContent(990, false);
  assert.strictEqual(h.get().size, 200);
});
scenario('6 measured in either order (content before viewport) gives the same result', () => {
  const h = make(200, 120); h.get().onContent(850, true); h.get().onLayout(h.ev(800), true);
  assert.strictEqual(h.get().size, 150);
});
scenario('7 style follows the size', () => {
  const h = make(200, 120); h.get().onLayout(h.ev(800), true); h.get().onContent(850, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.get().style)), { width: 150, height: 150 });
});
for (const [s, n] of results) console.log(s, n);
const bad = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - bad} of ${results.length} scenarios passed`);
process.exitCode = bad ? 1 : 0;
