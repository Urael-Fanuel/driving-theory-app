import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NEW_TOPICS = [
  {
    id: 'the_road',
    name_amharic: 'የመንገድ ሁኔታዎች',
    name_hebrew: 'תנאי הדרך',
    icon: '🏙️',
    color: '#2E7D32',
    description_amharic: 'የመንገድ አካባቢ፣ ከተማ ውስጥ ሹፌርነት፣ መስቀለኛ መንገድ፣ ከባድ ሁኔታዎች።',
    audio_intro_url: null,
    sign_count: 0,
    display_order: 12,
  },
  {
    id: 'my_vehicle',
    name_amharic: 'ትክክለኛ አነዳድ',
    name_hebrew: 'נהיגה נכונה',
    icon: '🚘',
    color: '#37474F',
    description_amharic: 'መኪናን በደህንነት ማስኬድ፣ ቁጥጥር እና ፍጥነት።',
    audio_intro_url: null,
    sign_count: 0,
    display_order: 13,
  },
  {
    id: 'two_wheelers',
    name_amharic: 'ሁለት ጎማ ተሽከርካሪዎች',
    name_hebrew: 'דו-גלגלי',
    icon: '🏍️',
    color: '#E65100',
    description_amharic: 'ሞተርሳይክል እና የኤሌክትሪክ ብስክሌቶች።',
    audio_intro_url: null,
    sign_count: 0,
    display_order: 14,
  },
  {
    id: 'basics_license',
    name_amharic: 'መሠረቶች እና ፍቃድ',
    name_hebrew: 'יסודות ורישיון',
    icon: '📋',
    color: '#00695C',
    description_amharic: 'የሹፌርነት ትምህርት መሠረቶች፣ ደህንነታዊ ሹፌርነት መርሆዎች።',
    audio_intro_url: null,
    sign_count: 0,
    display_order: 15,
  },
];

const { error } = await supabase
  .from('topics')
  .upsert(NEW_TOPICS, { onConflict: 'id' });

if (error) {
  console.error('❌ שגיאה:', error.message);
} else {
  console.log('✅ 4 נושאים הועלו בהצלחה: the_road, my_vehicle, two_wheelers, basics_license');
}
