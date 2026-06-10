/**
 * updateTopicIcons.mjs
 * Updates topic icons to modern 2026 style in Supabase + topics.json
 *
 * Usage:
 *   node --env-file=.env scripts/updateTopicIcons.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Modern 2026 icons ─────────────────────────────────────────────────────────
const NEW_ICONS = {
  regulatory:            '🛡️',
  warning:               '🔔',
  right_of_way:          '⬆️',
  prohibitions:          '🚫',
  information_guidance:  '💡',
  public_transport:      '🚇',
  traffic_lights:        '🚦',
  road_markings:         '🗺️',
  work_site:             '🦺',
  vehicle_knowledge:     '🛠️',
  mind_safety:           '🧠',
  society_law:           '⚖️',
  the_road:              '🛣️',
  my_vehicle:            '🏎️',
  two_wheelers:          '🏍️',
  basics_license:        '🪪',
};

async function main() {
  console.log('🔄 Updating topic icons...\n');

  // ── 1. Update Supabase ───────────────────────────────────────────────────────
  let successCount = 0;
  for (const [topicId, icon] of Object.entries(NEW_ICONS)) {
    const { error } = await supabase
      .from('topics')
      .update({ icon })
      .eq('id', topicId);

    if (error) {
      console.warn(`  ⚠️  ${topicId}: ${error.message}`);
    } else {
      console.log(`  ✅ ${topicId} → ${icon}`);
      successCount++;
    }
  }

  // ── 2. Update topics.json ────────────────────────────────────────────────────
  const jsonPath  = join(ROOT, 'content', 'topics.json');
  const topics    = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const updated   = topics.map(t => ({
    ...t,
    icon: NEW_ICONS[t.id] ?? t.icon,
  }));
  writeFileSync(jsonPath, JSON.stringify(updated, null, 2), 'utf8');
  console.log('\n✅ topics.json updated');

  console.log(`\n🎉 Done — ${successCount}/${Object.keys(NEW_ICONS).length} topics updated in Supabase`);
}

main().catch(console.error);
