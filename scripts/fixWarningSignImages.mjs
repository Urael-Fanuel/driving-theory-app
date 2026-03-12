/**
 * scripts/fixWarningSignImages.mjs
 *
 * Fixes an image offset bug: Wikimedia Commons has an extra sign at position 144
 * (a speed bump variant not in signs.json), which shifted all files 145–153 by +1.
 * As a result, signs 144–152 in the DB show the wrong image (one too early).
 *
 * What this script does:
 *   1. Uploads 153.png (deep water) to Storage as v4/153.png
 *   2. Uploads assets/images/sign_road_work.png (orange triangle) over v4/sign_road_work.png
 *   3. Updates image_url in `signs` table for 10 affected signs:
 *      SIGN_144 → v4/145.png  (was v4/144.png = wrong hump)
 *      SIGN_145 → v4/146.png  (was v4/145.png = wrong two-way arrows)
 *      SIGN_146 → v4/147.png  etc.
 *      SIGN_147 → v4/148.png
 *      SIGN_148 → v4/149.png
 *      SIGN_149 → v4/150.png
 *      SIGN_150 → v4/151.png
 *      SIGN_151 → v4/152.png  ⚠️ content "אזור תאונות" vs wind-sock image — verify!
 *      SIGN_152 → v4/153.png  (deep water, matches "מים עמוקים" part)
 *      SIGN_ROAD_WORK → v4/sign_road_work.png  (orange triangle placeholder)
 *
 * Run:
 *   node --env-file=.env scripts/fixWarningSignImages.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const BUCKET     = 'images';
const PREFIX     = 'v4';

// ─── Load env ─────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function storageUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PREFIX}/${filename}`;
}

// ─── Step 1 & 2: Upload the two images that need new/overwritten Storage files ─
const filesToUpload = [
  {
    localPath : join(ROOT, 'scripts', 'downloaded-signs', 'warning', '153.png'),
    storagePath: `${PREFIX}/153.png`,
    description: '153.png → v4/153.png (deep water sign)',
  },
  {
    localPath : join(ROOT, 'assets', 'images', 'sign_road_work.png'),
    storagePath: `${PREFIX}/sign_road_work.png`,
    description: 'sign_road_work.png → v4/sign_road_work.png (road work placeholder)',
  },
];

console.log('\n🔧  fixWarningSignImages.mjs');
console.log('═'.repeat(55));
console.log('\n📤  Uploading 2 image files...\n');

for (const { localPath, storagePath, description } of filesToUpload) {
  process.stdout.write(`  ${description} … `);

  if (!existsSync(localPath)) {
    console.log(`⚠️  LOCAL FILE NOT FOUND: ${localPath}`);
    continue;
  }

  const fileData = readFileSync(localPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileData, {
      contentType:  'image/png',
      cacheControl: '3600',
      upsert:       true,
    });

  if (error) {
    console.log(`❌  Upload error: ${error.message}`);
  } else {
    console.log('✅');
  }
}

// ─── Step 3: Update image_url in signs table ──────────────────────────────────
//
// Each sign gets the public URL of the correct image file (shifted by +1).
// SIGN_144 → uses 145.png, SIGN_145 → uses 146.png, … SIGN_152 → uses 153.png
// SIGN_ROAD_WORK → uses sign_road_work.png (now an orange triangle placeholder)

const updates = [
  { id: 'SIGN_144',      imageFile: '145.png'            },
  { id: 'SIGN_145',      imageFile: '146.png'            },
  { id: 'SIGN_146',      imageFile: '147.png'            },
  { id: 'SIGN_147',      imageFile: '148.png'            },
  { id: 'SIGN_148',      imageFile: '149.png'            },
  { id: 'SIGN_149',      imageFile: '150.png'            },
  { id: 'SIGN_150',      imageFile: '151.png'            },
  { id: 'SIGN_151',      imageFile: '152.png'            }, // ⚠️ verify content match
  { id: 'SIGN_152',      imageFile: '153.png'            }, // deep water ✓
  { id: 'SIGN_ROAD_WORK', imageFile: 'sign_road_work.png' },
];

console.log('\n📝  Updating image_url in signs table…\n');

let ok = 0, failed = 0;

for (const { id, imageFile } of updates) {
  const newUrl = storageUrl(imageFile);
  const { error } = await supabase
    .from('signs')
    .update({ image_url: newUrl })
    .eq('id', id);

  if (error) {
    console.log(`  ❌  ${id} → ${imageFile}  [${error.message}]`);
    failed++;
  } else {
    const warn = id === 'SIGN_151' ? ' ⚠️  (verify content!)' : '';
    console.log(`  ✅  ${id.padEnd(20)} → ${imageFile}${warn}`);
    ok++;
  }
}

console.log(`\n${'═'.repeat(55)}`);
console.log(`✅  Updated: ${ok}  |  ❌  Failed: ${failed}`);
console.log(`${'═'.repeat(55)}`);
console.log(`
⚠️  SIGN_151 has Amharic content "אזור תאונות" (accident zone) but now shows
    a WIND SOCK (side wind) image. You need to verify:
    → If the sign is actually "רוח צד" (side wind), update signs.json + regenerate audio.
    → Otherwise, find the correct accident zone image.

הרץ את האפליקציה ובדוק — עדכן אותי בתוצאות!
`);
