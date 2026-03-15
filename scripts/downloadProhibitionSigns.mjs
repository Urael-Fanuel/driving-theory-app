import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '..', 'assets', 'images', 'תמרורי איסורים והגבלות');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const signs = [
  { num: 401, h1: 'd', h2: 'db' },
  { num: 402, h1: '5', h2: '53' },
  { num: 403, h1: '8', h2: '84' },
  { num: 404, h1: 'c', h2: 'c7' },
  { num: 405, h1: '0', h2: '02' },
  { num: 406, h1: 'e', h2: 'e1' },
  { num: 407, h1: 'e', h2: 'e6' },
  { num: 408, h1: 'b', h2: 'b6' },
  { num: 409, h1: '6', h2: '69' },
  { num: 410, h1: '7', h2: '76' },
  { num: 411, h1: '1', h2: '10' },
  { num: 412, h1: '1', h2: '1d' },
  { num: 413, h1: '0', h2: '08' },
  { num: 414, h1: 'b', h2: 'b6' },
  { num: 415, h1: 'c', h2: 'ce' },
  { num: 416, h1: '6', h2: '63' },
  { num: 417, h1: 'c', h2: 'c9' },
  { num: 418, h1: '8', h2: '8e' },
  { num: 419, h1: 'f', h2: 'fc' },
  { num: 420, h1: '0', h2: '02' },
  { num: 421, h1: '6', h2: '65' },
  { num: 422, h1: '9', h2: '9b' },
  { num: 423, h1: '9', h2: '9c' },
  { num: 424, h1: 'a', h2: 'a0' },
  { num: 425, h1: 'c', h2: 'cb' },
  { num: 426, h1: 'e', h2: 'e0' },
  { num: 427, h1: 'e', h2: 'ee' },
  { num: 428, h1: 'b', h2: 'b3' },
  { num: 429, h1: '9', h2: '92' },
  { num: 430, h1: 'c', h2: 'c7' },
  { num: 431, h1: '8', h2: '8b' },
  { num: 432, h1: '8', h2: '80' },
  { num: 433, h1: 'e', h2: 'e1' },
  { num: 434, h1: '5', h2: '57' },
  { num: 435, h1: '7', h2: '7a' },
  { num: 436, h1: '8', h2: '87' },
  { num: 437, h1: '8', h2: '84' },
  { num: 438, h1: 'd', h2: 'd7' },
  { num: 439, h1: '9', h2: '96' },
  { num: 440, h1: '4', h2: '46' },
  { num: 441, h1: 'b', h2: 'b6' },
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
console.log('Downloading תמרורי איסורים והגבלות (401-441) to:', dest);
console.log('');

const failed = [];

for (const s of signs) {
  const fname = `Israel_road_sign_${s.num}.svg`;
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${s.h1}/${s.h2}/${fname}/500px-${fname}.png`;
  const out = path.join(dest, `${s.num}.png`);

  // Skip if already downloaded
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
  console.log('');
  console.log('שמור אותם בתיקייה: assets/images/תמרורי איסורים והגבלות/');
} else {
  console.log('🎉 כל התמרורים הורדו בהצלחה!');
}
