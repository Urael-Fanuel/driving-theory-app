// Local logic test of services/audioCache.ts download pipeline (mocks the device
// file system + network; NOT an Android test). Loads the real project file.
const fs = require('fs'), vm = require('vm');
const root = 'C:/Users/Yakov/Desktop/driving-theory-app';
const ts = require(root + '/node_modules/typescript');
const source = fs.readFileSync(root + '/services/audioCache.ts', 'utf8')
  + '\nexport const qa = { downloadAtomic, hasUsableCopy, seedIndex: (rows: any[]) => { _index = new Map(rows); _indexLoaded = true; } };';
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function setup(plan) {
  // plan: { status, bodyBytes, declared, hang, existing }
  const files = new Map(); const log = [];
  if (plan.existing != null) files.set('file:///docs/audio/a.mp3', plan.existing);
  let started = 0, cancelled = 0, resolveHang = null;
  const timers = [];
  const FS = {
    documentDirectory: 'file:///docs/',
    getInfoAsync: async p => files.has(p) ? { exists: true, size: files.get(p), modificationTime: 1 } : { exists: false },
    makeDirectoryAsync: async () => {},
    readDirectoryAsync: async () => [],
    writeAsStringAsync: async () => {},
    readAsStringAsync: async () => '{}',
    deleteAsync: async p => { log.push('delete ' + p.split('/').pop()); files.delete(p); },
    moveAsync: async ({ from, to }) => { log.push('move -> ' + to.split('/').pop()); if (plan.moveFails) throw new Error('rename failed'); files.set(to, files.get(from)); files.delete(from); },
    createDownloadResumable: (url, p) => ({
      downloadAsync: () => new Promise((resolve, reject) => {
        started++;
        if (plan.hang) { resolveHang = () => resolve(undefined); return; }   // settles only when cancelled
        if (plan.throws) { reject(new Error('connection reset')); return; }
        files.set(p, plan.bodyBytes);   // partial or full file appears under the TEMP name
        resolve({ status: plan.status ?? 200, headers: plan.declared != null ? { 'Content-Length': String(plan.declared) } : {} });
      }),
      cancelAsync: async () => { cancelled++; if (resolveHang) resolveHang(); },
    }),
  };
  const reports = [];
  const ctx = {
    exports: {}, console, process: { env: {} },
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.cleared = true; },
    require: p => p.includes('file-system') ? FS : p.includes('errorReporter') ? { reportError: (...a) => reports.push(a.slice(0, 3)), errorText: e => String(e && e.message || e) } : {},
  };
  vm.runInNewContext(js, ctx);
  return { api: ctx.exports, files, log, reports, timers, stats: () => ({ started, cancelled }) };
}

const url = 'https://x.invalid/storage/v1/object/public/audio/a.mp3';
const FINAL = 'file:///docs/audio/a.mp3';
const finals = t => [...t.files.keys()].filter(k => !k.endsWith('.part'));
const parts  = t => [...t.files.keys()].filter(k => k.endsWith('.part'));
let failures = 0;
const judge = c => { if (!c) failures++; return c ? 'OK' : 'FAIL'; };
(async () => {
  let t, r;

  t = setup({ bodyBytes: 5000, declared: 5000 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('1 complete download:   ok=%s final=%s partsLeft=%d', r.ok, t.files.get(FINAL), parts(t).length, judge(r.ok && t.files.get(FINAL) === 5000 && parts(t).length === 0));

  t = setup({ bodyBytes: 3000, declared: 5000 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('2 truncated (3000/5000): ok=%s finalExists=%s partsLeft=%d', r.ok, t.files.has(FINAL), parts(t).length, judge(!r.ok && !t.files.has(FINAL) && parts(t).length === 0));

  t = setup({ bodyBytes: 600, status: 404 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('3 HTTP 404 body:        ok=%s finalExists=%s partsLeft=%d', r.ok, t.files.has(FINAL), parts(t).length, judge(!r.ok && !t.files.has(FINAL) && parts(t).length === 0));

  t = setup({ bodyBytes: 100 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('4 tiny file (100B):     ok=%s finalExists=%s', r.ok, t.files.has(FINAL), judge(!r.ok && !t.files.has(FINAL)));

  t = setup({ throws: true, existing: 7777 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('5 network error, GOOD OLD COPY kept: ok=%s final=%s', r.ok, t.files.get(FINAL), judge(!r.ok && t.files.get(FINAL) === 7777));

  t = setup({ bodyBytes: 5000, declared: 5000, moveFails: true, existing: 7777 }); r = await t.api.qa.downloadAtomic(url, 'test');
  console.log('6 rename fails, old copy kept: ok=%s final=%s partsLeft=%d', r.ok, t.files.get(FINAL), parts(t).length, judge(!r.ok && t.files.get(FINAL) === 7777 && parts(t).length === 0));

  t = setup({ bodyBytes: 5000, declared: 5000 });
  const [a, b] = await Promise.all([t.api.qa.downloadAtomic(url, 'one'), t.api.qa.downloadAtomic(url, 'two')]);
  console.log('7 two callers, same file: downloads started=%d both ok=%s', t.stats().started, a.ok && b.ok, judge(t.stats().started === 1 && a.ok && b.ok));

  t = setup({ hang: true });
  const pending = t.api.qa.downloadAtomic(url, 'test');
  await new Promise(r => setImmediate(r));   // let the download actually start
  const killer = t.timers.find(x => x.ms === 90000);   // the per-file timeout
  killer.fn();                                          // time passes
  r = await pending;
  console.log('8 hung download, 90s passes: settled=true ok=%s cancelCalls=%d partsLeft=%d finalExists=%s', r.ok, t.stats().cancelled, parts(t).length, t.files.has(FINAL), judge(!r.ok && t.stats().cancelled === 1 && parts(t).length === 0 && !t.files.has(FINAL)));

  t = setup({ existing: 0 }); t.api.qa.seedIndex([['a.mp3', { bytes: 0, lastAccess: 0 }]]);
  const usable = await t.api.qa.hasUsableCopy(FINAL);
  console.log('9 empty leftover file:  usable=%s removed=%s', usable, !t.files.has(FINAL), judge(!usable && !t.files.has(FINAL)));

  t = setup({ existing: 40000 }); const usable10 = await t.api.qa.hasUsableCopy(FINAL);
  console.log('10 healthy cached file: usable=%s kept=%s', usable10, t.files.has(FINAL), judge(usable10 && t.files.has(FINAL)));
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASSED');
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.log('TEST ERROR', e); process.exitCode = 1; });
