// Logic test for the first launch on a poor connection (CODEX QA Q10): backend/topicsLoader.ts and the
// sign-in wait in services/identity.ts. Real files, fake server/storage. NOT an Android test.
// Every expectation is an assertion; any failure exits with code 1.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const ts = require(root + '/node_modules/typescript');
const tick = () => new Promise(r => setImmediate(r));
const flush = async () => { for (let i = 0; i < 20; i++) await tick(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const load = (file, deps = () => ({})) => {
  const ctx = { exports: {}, console: { warn() {}, error() {}, log() {} }, process: { env: {} }, setTimeout, clearTimeout, require: deps };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
  return ctx.exports;
};
const BUNDLED = ['b1', 'b2'], SERVER = ['s1', 's2', 's3'];

function loader(server) {
  const calls = { server: 0, write: 0 };
  const { createTopicsLoader } = load('backend/topicsLoader.ts');
  const l = createTopicsLoader({
    fetchFromServer: () => { calls.server++; return server(); },
    readStored: async () => null, writeStored: async () => { calls.write++; },
    bundled: () => BUNDLED, onServerFailure() {}, firstWaitMs: 100,
  });
  return { l, calls };
}
const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push(['OK  ', name]); }
  catch (e) { results.push(['FAIL', name + '  ->  ' + e.message.split('\n')[0]]); }
}

(async () => {
  await scenario('1 Q10 first launch, server silent: the bundled list comes after the short wait, not the full deadline', async () => {
    const hung = deferred();
    const { l } = loader(() => hung.promise);
    const t = Date.now(); const got = await l.get(); const ms = Date.now() - t;
    assert.strictEqual(JSON.stringify(got), JSON.stringify(BUNDLED));
    assert.ok(ms < 1000, 'waited ' + ms + ' ms');
  });

  await scenario('2 Q10 the bundled list is remembered: the next call does not wait again', async () => {
    const hung = deferred();
    const { l } = loader(() => hung.promise);
    await l.get();
    const t = Date.now(); await l.get(); const ms = Date.now() - t;
    assert.ok(ms < 20, 'second call waited ' + ms + ' ms');
  });

  await scenario('3 when the server answers later, the next call gives the server list (and saves it)', async () => {
    const late = deferred();
    const { l, calls } = loader(() => late.promise);
    await l.get();
    late.resolve(SERVER); await flush();
    assert.strictEqual(JSON.stringify(await l.get()), JSON.stringify(SERVER));
    assert.strictEqual(calls.write, 1);
  });

  await scenario('4 server down at first, back later: a later call retries in the background and upgrades', async () => {
    let up = false;
    const { l, calls } = loader(() => up ? Promise.resolve(SERVER) : Promise.reject(new Error('offline')));
    assert.strictEqual(JSON.stringify(await l.get()), JSON.stringify(BUNDLED));
    up = true;
    await l.get(); await flush();                       // returns bundled at once, asks again behind it
    assert.strictEqual(JSON.stringify(await l.get()), JSON.stringify(SERVER));
    assert.ok(calls.server >= 2);
  });

  await scenario('5 a fast server still wins on first launch (no needless bundled list)', async () => {
    const { l } = loader(() => Promise.resolve(SERVER));
    assert.strictEqual(JSON.stringify(await l.get()), JSON.stringify(SERVER));
  });

  await scenario('6 Q10 first launch waits at most 4 s for the sign-in (it was 15 s)', async () => {
    const src = fs.readFileSync(root + '/services/identity.ts', 'utf8');
    const m = src.match(/const SIGN_IN_WAIT_MS = ([\d_]+);/);
    assert.ok(m, 'constant not found');
    assert.strictEqual(Number(m[1].replace(/_/g, '')), 4000);
  });

  for (const [mark, name] of results) console.log(mark, name);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
