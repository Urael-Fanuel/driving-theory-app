// Retry download for signs 206 and 207
import https from 'https';
import fs from 'fs';
import path from 'path';

const destDir = 'C:\\Users\\Yakov\\Desktop\\driving-theory-app\\assets\\images\\תמרורי הוריה';

const signs = [
  { num: 206, h1: '5', h2: '5b' },
  { num: 207, h1: 'd', h2: 'd2' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/png,image/*,*/*;q=0.8',
        'Referer': 'https://en.wikipedia.org/',
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); fs.unlink(destPath, () => {});
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

for (const sign of signs) {
  const filename = `Israel_road_sign_${sign.num}.svg`;
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${sign.h1}/${sign.h2}/${filename}/500px-${filename}.png`;
  const outPath = path.join(destDir, `${sign.num}.png`);
  console.log(`Trying: ${sign.num} from ${url}`);
  try {
    await downloadFile(url, outPath);
    console.log(`OK: ${sign.num}.png (${fs.statSync(outPath).size} bytes)`);
  } catch (err) {
    console.log(`FAIL: ${sign.num} — ${err.message}`);
  }
  await sleep(5000);
}
console.log('Done.');
