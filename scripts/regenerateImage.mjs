/**
 * regenerateImage.mjs
 * Re-uploads ONLY the diagram image for a given road-scene subtopic, from a
 * PNG already rendered by buildRoadScenarioDiagram.mjs. Deletes the old
 * image from Supabase Storage first (this app's standing convention: never
 * leave an orphaned file behind), uploads the new one, and updates the
 * subtopic's image_url in its scaffold. Does NOT touch narration/audio or
 * questions — the counterpart to regenerateAudio.mjs, for when only the
 * picture itself changed.
 *
 * Usage:
 *   node --env-file=.env scripts/regenerateImage.mjs --subtopic rd_l4_s3 --png <path>
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const SUBTOPIC_ID = arg('subtopic');
const PNG_PATH = arg('png');
if (!SUBTOPIC_ID || !PNG_PATH) { console.error('Usage: --subtopic <id> --png <path>'); process.exit(1); }

const SCAFFOLD_MAP = {
  vk_: 'vehicle_knowledge_scaffold.json',
  ms_: 'mind_safety_scaffold.json',
  sl_: 'society_law_scaffold.json',
  tr_: 'the_road_scaffold.json',
  mv_: 'my_vehicle_scaffold.json',
  tw_: 'two_wheelers_scaffold.json',
  bl_: 'basics_license_scaffold.json',
  rd_: 'road_decisions_scaffold.json',
};
const scaffoldFile = Object.entries(SCAFFOLD_MAP).find(([p]) => SUBTOPIC_ID.startsWith(p))?.[1];
if (!scaffoldFile) { console.error(`No scaffold mapping for prefix of ${SUBTOPIC_ID}`); process.exit(1); }
const SCAFFOLD_PATH = join(ROOT, 'content', scaffoldFile);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing SUPABASE_URL / SERVICE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));
let sub = null;
for (const level of scaffold.levels) { const s = level.subtopics.find(x => x.id === SUBTOPIC_ID); if (s) sub = s; }
if (!sub) { console.error(`❌ not found: ${SUBTOPIC_ID}`); process.exit(1); }
if (!existsSync(PNG_PATH)) { console.error(`❌ png not found: ${PNG_PATH}`); process.exit(1); }

console.log(`🎯 ${sub.name_hebrew} (${SUBTOPIC_ID})`);

if (sub.image_url) {
  const oldName = sub.image_url.split('/images/').pop()?.split('?')[0];
  if (oldName) {
    const { error } = await supabase.storage.from('images').remove([oldName]);
    console.log(error ? `  ⚠️  old image remove: ${error.message}` : `  🗑️  removed old image: ${oldName}`);
  }
}

const png = readFileSync(PNG_PATH);
const ts = Date.now();
const pngName = `behavioral/behavioral_${SUBTOPIC_ID}_diagram_${ts}.png`;
const { error: upErr } = await supabase.storage.from('images').upload(pngName, png, { contentType: 'image/png', upsert: false });
if (upErr) { console.error('❌ upload failed:', upErr.message); process.exit(1); }

const imageUrl = supabase.storage.from('images').getPublicUrl(pngName).data.publicUrl;
sub.image_url = imageUrl;
writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');

console.log(`  ✅ uploaded: ${pngName} (${(png.byteLength / 1024).toFixed(1)} KB)`);
console.log(`\nimage_url:\n${imageUrl}`);
