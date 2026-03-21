import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, '..', 'assets', 'images', 'תמרורי רמזורים ובקרת נתיבים');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Sign numbers for תמרורי רמזורים ובקרת נתיבים
const signNumbers = [
  701, 702, 703, 704, 705, 706, 707, 708,
  709, 710, 711, 712, 713, 714, 715, 716,
  718, 719, 720, 721, 722,
  723, 724, 725, 726
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
console.log('מנסה להוריד תמרורי רמזורים ובקרת נתיבים מוויקיפדיה...');
console.log('תיקייה:', dest);
console.log('');

const failed = [];
const succeeded = [];

for (const num of signNumbers) {
  const out = path.join(dest, `${num}.png`);

  if (fs.existsSync(out)) {
    console.log(`⏭️   ${num}.png — כבר קיים, מדלג`);
    succeeded.push(num);
    continue;
  }

  // Try Wikimedia Commons Special:Redirect API
  const url = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Israel_road_sign_${num}.svg&width=500`;

  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await download(url, out);
      const sz = fs.statSync(out).size;
      console.log(`✅  ${num}.png (${sz} bytes)`);
      succeeded.push(num);
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
console.log('=== סיכום ===');
console.log(`✅ הורדו בהצלחה: ${succeeded.length} תמרורים`);
console.log(`❌ נכשלו (לא נמצאו בוויקיפדיה): ${failed.length} תמרורים`);

if (failed.length > 0) {
  console.log('');
  console.log('📋 תמרורים להורדה ידנית (שמור כ-NNN.png בתיקייה assets/images/תמרורי רמזורים ובקרת נתיבים/):');
  for (const n of failed) {
    console.log(`   ${n}.png`);
  }
  console.log('');
  console.log('🌐 הורד מ: https://tamrurim.co.il/לוח-התמרורים/תמרורי-רמזורים-ובקרת-נתיבים/');
  console.log('   או מ: https://www.megapro.org.il/מגהמה/לוח-תמרורים-חדש/תמרורי-רמזורים-ובקרת-נתיבים/1');
}
