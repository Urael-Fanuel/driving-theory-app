/**
 * addSkeletonSigns.mjs
 * Adds 41 skeleton entries for signs 401-441 (prohibitions topic) to signs.json.
 * Run ONCE before improveAmharicWithGemini.mjs.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIGNS_PATH = join(__dirname, '..', 'content', 'signs.json');

const signs = JSON.parse(readFileSync(SIGNS_PATH, 'utf8'));

// Check none already exist
const existing = signs.filter(s => /^4\d\d\.png$/.test(s.image_filename || ''));
if (existing.length > 0) {
  console.log(`⚠️  Already have ${existing.length} signs with 4xx.png — aborting.`);
  process.exit(0);
}

const skeletons = [];
for (let num = 401; num <= 441; num++) {
  skeletons.push({
    id: `PROHIBITION_${num}`,
    topic_id: 'prohibitions',
    order: num - 400,
    image_filename: `${num}.png`,
    video_filename: null,
    name_hebrew: `${num}`,
    name_amharic: '',
    explanation_amharic: '',
    audio_name_filename: `${num}_name.mp3`,
    audio_explanation_filename: `${num}_explanation.mp3`,
    questions: [],
  });
}

const updated = [...signs, ...skeletons];
writeFileSync(SIGNS_PATH, JSON.stringify(updated, null, 2), 'utf8');

console.log(`✅  Added ${skeletons.length} skeleton signs (401-441) to signs.json`);
console.log(`   Total signs now: ${updated.length}`);
