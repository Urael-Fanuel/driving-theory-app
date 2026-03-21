// Download Israeli regulatory road signs 201-231 as large PNG thumbnails from Wikimedia
// Uses the thumbnail URL pattern (500px wide) — much less rate-limited than direct SVG downloads

import https from 'https';
import fs from 'fs';
import path from 'path';

const destDir = 'C:\\Users\\Yakov\\Desktop\\driving-theory-app\\assets\\images\\תמרורי הוריה';

// Full sign data: num -> {hash1, hash2} extracted from Wikipedia page
const signs = [
  { num: 201, h1: '0', h2: '05' },
  { num: 202, h1: '7', h2: '7c' },
  { num: 203, h1: '7', h2: '71' },
  { num: 204, h1: '1', h2: '1f' },
  { num: 205, h1: '3', h2: '30' },
  { num: 206, h1: '5', h2: '5b' },
  { num: 207, h1: 'd', h2: 'd2' },
  { num: 208, h1: '9', h2: '9c' },
  { num: 209, h1: '3', h2: '38' },
  { num: 210, h1: '7', h2: '7b' },
  { num: 211, h1: 'e', h2: 'e4' },
  { num: 212, h1: 'a', h2: 'a2' },
  { num: 213, h1: '4', h2: '44' },
  { num: 214, h1: '0', h2: '01' },
  { num: 215, h1: 'e', h2: 'ee' },
  { num: 216, h1: 'f', h2: 'f5' },
  { num: 217, h1: '1', h2: '1b' },
  { num: 218, h1: 'b', h2: 'b2' },
  { num: 219, h1: '3', h2: '33' },
  { num: 220, h1: 'f', h2: 'f5' },
  { num: 221, h1: 'b', h2: 'bb' },
  { num: 222, h1: '4', h2: '46' },
  { num: 223, h1: '3', h2: '30' },
  { num: 224, h1: 'f', h2: 'f1' },
  { num: 225, h1: '1', h2: '19' },
  { num: 226, h1: '2', h2: '24' },
  { num: 227, h1: '3', h2: '31' },
  { num: 228, h1: '3', h2: '3d' },
  { num: 229, h1: '6', h2: '61' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/png,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://en.wikipedia.org/',
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(destPath, () => {});
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function downloadWithRetry(url, destPath, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadFile(url, destPath);
      return;
    } catch (err) {
      if ((err.message.includes('429') || err.message.includes('503')) && attempt < retries) {
        const wait = attempt * 8000;
        console.log(`  Rate limited, waiting ${wait/1000}s before retry ${attempt+1}/${retries}...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

const ok = [];
const fail = [];

console.log(`Saving to: ${destDir}\n`);

// Check already-downloaded files (skip if .svg or .png already there)
const existing = new Set(
  fs.existsSync(destDir)
    ? fs.readdirSync(destDir)
        .filter(f => f.match(/^\d+\.(svg|png)$/))
        .map(f => parseInt(f))
    : []
);

for (const sign of signs) {
  if (existing.has(sign.num)) {
    console.log(`SKIP: ${sign.num} (already exists)`);
    ok.push(sign.num);
    continue;
  }

  const filename = `Israel_road_sign_${sign.num}.svg`;
  // Use 500px PNG thumbnail — high quality, served via thumbs CDN
  // URL pattern: /thumb/h1/h2/filename/500px-filename.png  (h1 is first char, h2 is two-char hash)
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${sign.h1}/${sign.h2}/${filename}/500px-${filename}.png`;
  const outPath = path.join(destDir, `${sign.num}.png`);

  try {
    await downloadWithRetry(url, outPath);
    const size = fs.statSync(outPath).size;
    console.log(`OK: ${sign.num}.png (${size} bytes)`);
    ok.push(sign.num);
  } catch (err) {
    console.log(`FAIL: ${sign.num} — ${err.message}`);
    fail.push(sign.num);
  }

  // Polite delay: 3 seconds between downloads
  await sleep(3000);
}

console.log('\n=== SUMMARY ===');
console.log(`Downloaded OK (${ok.length}): ${ok.join(', ')}`);
if (fail.length) console.log(`Failed (${fail.length}): ${fail.join(', ')}`);
console.log(`Not on Wikimedia (2 signs): 230, 231`);
