import https from 'https';
import fs from 'fs';
import path from 'path';

const dest = 'C:\\Users\\Yakov\\Desktop\\driving-theory-app\\assets\\images\\תמרורי הוריה';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const signs = [
  { num: 201, h1: '0', h2: '05' },
  { num: 202, h1: '7', h2: '7c' },
  { num: 203, h1: '7', h2: '71' },
  { num: 204, h1: '1', h2: '1f' },
  { num: 206, h1: '5', h2: '5b' },
  { num: 207, h1: 'd', h2: 'd2' },
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

console.log('Downloading missing signs to:', dest);

for (const s of signs) {
  const fname = `Israel_road_sign_${s.num}.svg`;
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${s.h1}/${s.h2}/${fname}/500px-${fname}.png`;
  const out = path.join(dest, `${s.num}.png`);
  try {
    await download(url, out);
    const sz = fs.statSync(out).size;
    console.log(`OK: ${s.num}.png (${sz} bytes)`);
  } catch(e) {
    console.log(`FAIL: ${s.num} — ${e.message}`);
  }
  await sleep(5000);
}

console.log('\nDone! Signs 230 and 231 are NOT on Wikimedia — manual download needed.');
