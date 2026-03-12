import { readFileSync, writeFileSync } from 'fs';
const path = 'content/signs.json';
let signs = JSON.parse(readFileSync(path, 'utf8'));
const before = signs.length;
signs = signs.filter(s => s.id !== 'SIGN_ROAD_WORK');
writeFileSync(path, JSON.stringify(signs, null, 2));
console.log(`✅ לפני: ${before} | אחרי: ${signs.length} — SIGN_ROAD_WORK הוסר מ-signs.json`);
