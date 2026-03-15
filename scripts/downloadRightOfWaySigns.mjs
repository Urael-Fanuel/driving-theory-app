import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '..', 'assets', 'images', 'תמרורי זכות קדימה');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// MD5 hashes of each SVG filename (for Wikimedia thumb URL)
const signs = [
  { num: 301, h1: '8', h2: '85' },
  { num: 302, h1: '2', h2: '24' },
  { num: 307, h1: '5', h2: '51' },
  { num: 308, h1: '2', h2: '29' },
  { num: 309, h1: '9', h2: '9b' },
];

const NOT_FOUND = [303, 304, 305, 306, 310];

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research bot)' } };
    https.get(url, opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(outPath); } catch {}
        return download(res.headers.location, outPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(outPath); } catch {}
        return reject(new Error('HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => {
      try { fs.unlinkSync(outPath); } catch {}
      reject(err);
    });
  });
}

fs.mkdirSync(dest, { recursive: true });
console.log('Downloading תמרורי זכות קדימה to:', dest);
console.log('');

for (const s of signs) {
  const fname = `Israel_road_sign_${s.num}.svg`;
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${s.h1}/${s.h2}/${fname}/500px-${fname}.png`;
  const out = path.join(dest, `${s.num}.png`);
  try {
    await download(url, out);
    const sz = fs.statSync(out).size;
    console.log(`✅  ${s.num}.png (${sz} bytes)`);
  } catch(e) {
    console.log(`❌  ${s.num} — ${e.message}`);
  }
  await sleep(3000);
}

console.log('');
console.log('⚠️  התמרורים הבאים לא נמצאו ב-Wikimedia — יש להוריד ידנית:');
for (const n of NOT_FOUND) {
  console.log(`   - ${n}.png`);
}
console.log('');
console.log('שמור אותם בתיקייה: assets/images/תמרורי זכות קדימה/');
