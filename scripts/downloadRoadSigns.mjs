import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const destDir = path.join(
  'C:\\Users\\Yakov\\Desktop\\driving-theory-app\\assets\\images\\תמרורי הוריה'
);

const signs = [
  { num: 201, url: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Israel_road_sign_201.svg' },
  { num: 202, url: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Israel_road_sign_202.svg' },
  { num: 203, url: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Israel_road_sign_203.svg' },
  { num: 204, url: 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Israel_road_sign_204.svg' },
  { num: 205, url: 'https://upload.wikimedia.org/wikipedia/commons/3/30/Israel_road_sign_205.svg' },
  { num: 206, url: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Israel_road_sign_206.svg' },
  { num: 207, url: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Israel_road_sign_207.svg' },
  { num: 208, url: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/Israel_road_sign_208.svg' },
  { num: 209, url: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Israel_road_sign_209.svg' },
  { num: 210, url: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Israel_road_sign_210.svg' },
  { num: 211, url: 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Israel_road_sign_211.svg' },
  { num: 212, url: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Israel_road_sign_212.svg' },
  { num: 213, url: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Israel_road_sign_213.svg' },
  { num: 214, url: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Israel_road_sign_214.svg' },
  { num: 215, url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/Israel_road_sign_215.svg' },
  { num: 216, url: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Israel_road_sign_216.svg' },
  { num: 217, url: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Israel_road_sign_217.svg' },
  { num: 218, url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Israel_road_sign_218.svg' },
  { num: 219, url: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Israel_road_sign_219.svg' },
  { num: 220, url: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Israel_road_sign_220.svg' },
  { num: 221, url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Israel_road_sign_221.svg' },
  { num: 222, url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Israel_road_sign_222.svg' },
  { num: 223, url: 'https://upload.wikimedia.org/wikipedia/commons/3/30/Israel_road_sign_223.svg' },
  { num: 224, url: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Israel_road_sign_224.svg' },
  { num: 225, url: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Israel_road_sign_225.svg' },
  { num: 226, url: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Israel_road_sign_226.svg' },
  { num: 227, url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Israel_road_sign_227.svg' },
  { num: 228, url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Israel_road_sign_228.svg' },
  { num: 229, url: 'https://upload.wikimedia.org/wikipedia/commons/6/61/Israel_road_sign_229.svg' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/svg+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
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

async function downloadWithRetry(url, destPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadFile(url, destPath);
      return;
    } catch (err) {
      if (err.message.includes('429') && attempt < retries) {
        const wait = attempt * 5000;
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

// Skip already-downloaded files
const alreadyDone = new Set(
  fs.existsSync(destDir)
    ? fs.readdirSync(destDir).filter(f => f.endsWith('.svg')).map(f => parseInt(f))
    : []
);

for (const sign of signs) {
  if (alreadyDone.has(sign.num)) {
    console.log(`SKIP: ${sign.num}.svg (already exists)`);
    ok.push(sign.num);
    continue;
  }
  const outPath = path.join(destDir, `${sign.num}.svg`);
  try {
    await downloadWithRetry(sign.url, outPath);
    console.log(`OK: ${sign.num}.svg`);
    ok.push(sign.num);
  } catch (err) {
    console.log(`FAIL: ${sign.num} — ${err.message}`);
    fail.push(sign.num);
  }
  // Polite delay between downloads: 2 seconds
  await sleep(2000);
}

console.log('\n=== SUMMARY ===');
console.log(`Downloaded OK (${ok.length}): ${ok.join(', ')}`);
if (fail.length) console.log(`Failed (${fail.length}): ${fail.join(', ')}`);
console.log(`Not on Wikimedia (2 signs): 230, 231`);
