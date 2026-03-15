import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '..', 'assets', 'images', 'תמרורי תחבורה ציבורית');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const signs = [
  { num: 501, h1: '6', h2: '68' },
  { num: 502, h1: '9', h2: '91' },
  { num: 503, h1: '1', h2: '16' },
  { num: 504, h1: 'c', h2: 'cb' },
  { num: 505, h1: '6', h2: '6f' },
  { num: 506, h1: 'a', h2: 'a4' },
  { num: 507, h1: '6', h2: '61' },
  { num: 508, h1: '2', h2: '2e' },
  { num: 509, h1: 'f', h2: 'fd' },
  { num: 510, h1: 'b', h2: 'b6' },
  { num: 511, h1: '3', h2: '34' },
  { num: 512, h1: 'b', h2: 'b1' },
  { num: 513, h1: '2', h2: '23' },
  { num: 514, h1: 'e', h2: 'e3' },
  { num: 515, h1: 'e', h2: 'ea' },
  { num: 516, h1: '8', h2: '86' },
  { num: 517, h1: '7', h2: '71' },
  { num: 518, h1: '9', h2: '96' },
  { num: 519, h1: '6', h2: '6f' },
];

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
console.log('Downloading תמרורי תחבורה ציבורית (501-519) to:', dest);
console.log('');

const failed = [];

for (const s of signs) {
  const fname = `Israel_road_sign_${s.num}.svg`;
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${s.h1}/${s.h2}/${fname}/500px-${fname}.png`;
  const out = path.join(dest, `${s.num}.png`);

  if (fs.existsSync(out)) {
    console.log(`⏭️   ${s.num}.png — כבר קיים, מדלג`);
    continue;
  }

  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await download(url, out);
      const sz = fs.statSync(out).size;
      console.log(`✅  ${s.num}.png (${sz} bytes)`);
      success = true;
      break;
    } catch(e) {
      if (e.message.includes('429') && attempt < 3) {
        console.log(`⏳  ${s.num} — HTTP 429, ממתין 30 שניות...`);
        await sleep(30000);
      } else {
        console.log(`❌  ${s.num} — ${e.message}`);
        failed.push(s.num);
        break;
      }
    }
  }

  if (success) await sleep(4000);
}

console.log('');
if (failed.length > 0) {
  console.log('⚠️  הורדה נכשלה — יש להוריד ידנית:');
  for (const n of failed) console.log(`   - ${n}.png`);
  console.log('שמור אותם בתיקייה: assets/images/תמרורי תחבורה ציבורית/');
} else {
  console.log('🎉 כל התמרורים הורדו בהצלחה!');
}
