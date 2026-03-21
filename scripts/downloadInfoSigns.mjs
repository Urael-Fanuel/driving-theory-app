import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '..', 'assets', 'images', 'תמרורי מודיעין והדרכה');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// תמרורי מודיעין והדרכה 601-637
const SIGN_NUMS = Array.from({ length: 37 }, (_, i) => 601 + i);

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
console.log('Downloading תמרורי מודיעין והדרכה (601-637) to:', dest);
console.log('');

const failed = [];

for (const num of SIGN_NUMS) {
  const out = path.join(dest, `${num}.png`);

  if (fs.existsSync(out)) {
    console.log(`⏭️   ${num}.png — כבר קיים, מדלג`);
    continue;
  }

  // Wikimedia Special:Redirect — לא דורש חישוב hash
  const url = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Israel_road_sign_${num}.svg&width=500`;

  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await download(url, out);
      const sz = fs.statSync(out).size;
      console.log(`✅  ${num}.png (${sz} bytes)`);
      success = true;
      break;
    } catch (e) {
      if (e.message.includes('429') && attempt < 3) {
        console.log(`⏳  ${num} — HTTP 429, ממתין 30 שניות...`);
        await sleep(30000);
      } else {
        console.log(`❌  ${num} — ${e.message}`);
        failed.push(num);
        break;
      }
    }
  }

  if (success) await sleep(2000);
}

console.log('');
if (failed.length > 0) {
  console.log('⚠️  הורדה נכשלה — יש להוריד ידנית:');
  for (const n of failed) console.log(`   - ${n}.png`);
  console.log('שמור אותם בתיקייה: assets/images/תמרורי מודיעין והדרכה/');
} else {
  console.log('🎉 כל התמרורים הורדו בהצלחה!');
}
