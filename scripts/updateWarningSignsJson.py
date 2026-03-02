"""
updateWarningSignsJson.py
========================
Updates content/signs.json:
  1. Renames image_filename for existing 12 warning signs to numbered PNGs (101.png etc.)
  2. Adds 40 new warning signs (101-152) with Hebrew names + basic Amharic content

Run: python -X utf8 scripts/updateWarningSignsJson.py
"""

import json, re, sys, os
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SIGNS_JSON = r"C:\Users\Yakov\Desktop\driving-theory-app\content\signs.json"

# ── Mapping: old descriptive filename → new numbered filename ─────────────────
OLD_TO_NEW = {
    'sign_bump.png':                '101.png',
    'sign_curve_right.png':         '102.png',
    'sign_curve_left.png':          '103.png',
    'sign_narrow_road.png':         '109.png',
    'sign_crossroads.png':          '114.png',
    'sign_t_junction.png':          '115.png',
    'sign_traffic_light_ahead.png': '121.png',
    'sign_pedestrian.png':          '135.png',
    'sign_school_zone.png':         '136.png',
    'sign_hill_descent.png':        '140.png',
    'sign_slippery.png':            '141.png',
    # sign_road_work.png stays as-is (no PDF number)
}

# ── All 52 warning signs data ─────────────────────────────────────────────────
# Format: number → (id_suffix, hebrew_name, amharic_name, amharic_explanation)
WARNING_SIGNS_DATA = {
    101: ('BUMP',             'גבשושית / מהמורה',              'ቡምፕ / ጉብታ',
          'ይህ ምልክት በቀጣዩ መንገድ ላይ ጉብታ ወይም ቡምፕ መኖሩን ያሳያል። ፍጥነቱን ቀንሶ ቀስ ብሎ ማለፍ ያስፈልጋል።'),
    102: ('CURVE_RIGHT',      'עקומה חדה ימינה',               'ሹርፕ ቀኝ ጠምዘዝ',
          'ይህ ምልክት ቀጣዩ መንገድ ወደ ቀኝ በሹርፕ ጠምዘዝ እንደሚሄድ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    103: ('CURVE_LEFT',       'עקומה חדה שמאלה',               'ሹርፕ ግራ ጠምዘዝ',
          'ይህ ምልክት ቀጣዩ መንገድ ወደ ግራ በሹርፕ ጠምዘዝ እንደሚሄድ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    104: ('DOUBLE_CURVE',     'עקומות (ראשונה ימין)',           'ድርብ ጠምዘዝ',
          'ይህ ምልክት ሁለት ተከታታይ ጠምዘዞች ቀጣዩ መንገድ ላይ እንዳሉ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    105: ('WINDING_ROAD',     'דרך מפותלת',                    'ጠምዘዘ መንገድ',
          'ይህ ምልክት ቀጣዩ ክፍል ብዙ ጠምዘዞች ያሉት ጠምዘዘ መንገድ እንደሆነ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያስፈልጋል።'),
    106: ('BEND_GUIDANCE',    'הכוונה בעקומה',                 'ጠምዘዝ አቅጣጫ',
          'ይህ ምልክት ጠምዘዝ ላይ ያለ አቅጣጫ ምልክት ነው። ምልክቱ የሚጠቁምበት አቅጣጫ ማዞር ያስፈልጋል።'),
    107: ('ROAD_DIRECTION',   'הכוונה לכיוון הדרך',            'የመንገድ አቅጣጫ',
          'ይህ ምልክት የቀጣዩ መንገድ አቅጣጫ ጠቁሟል። ምልክቱ ላይ ያሉ ቀስቶች አቅጣጫ ይከተሉ።'),
    108: ('CURVE_INFO',       'עקומה ומידע',                   'ጠምዘዝ ማስጠንቀቂያ',
          'ይህ ምልክት ቀጣዩ መንገድ ላይ ጠምዘዝ እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    109: ('NARROW_ROAD',      'צרות דרך',                      'ጠባ መንገድ',
          'ይህ ምልክት ቀጣዩ መንገድ ጠባ እንደሚሆን ያሳያል። ፍጥነቱን ቀንሶ ከሌሎች ተሽከርካሪዎች ጋር ጥንቃቄ ማድረግ ያስፈልጋል።'),
    110: ('NARROWS_ONE_SIDE', 'צרות דרך מצד',                  'ከጎን ጠባ መንገድ',
          'ይህ ምልክት ቀጣዩ መንገድ ከአንድ ጎን ጠባ እንደሚሆን ያሳያል። ጥንቃቄ ያስፈልጋል።'),
    111: ('NARROW_PASSAGE',   'מעבר צר או מכשול',              'ጠባ መሻገሪያ',
          'ይህ ምልክት ቀጣዩ ክፍል ጠባ መሻገሪያ ወይም ዕንቅፋት እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያስፈልጋል።'),
    112: ('ROAD_MARKINGS',    'סימוני כביש',                   'የመንገድ ምልክቶች',
          'ይህ ምልክት ቀጣዩ ክፍል ላይ ልዩ የመንገድ ምልክቶች እንዳሉ ያሳያል። ምልክቶቹን ተከትሎ መሄድ ያስፈልጋል።'),
    113: ('HEIGHT_LIMIT',     'מגבלת גובה 4.80 מ',             'ቁመት ወሰን 4.80 ሜ',
          'ይህ ምልክት ቀጣዩ ክፍል ቁመቱ ከ4.80 ሜትር ከበለጠ ተሽከርካሪ ማለፍ እንደማይቻል ያሳያል።'),
    114: ('CROSSROADS',       'צומת',                          'የትስስር መንገድ',
          'ይህ ምልክት ቀጣዩ ቦታ ትስስር መንገድ እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    115: ('T_JUNCTION',       'צומת T',                        'ቲ-ትስስር',
          'ይህ ምልክት ቀጣዩ ቦታ ቲ-ሸፕ ትስስር እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።'),
    116: ('JUNCTION_GUIDANCE','הכוונה בצומת',                  'የትስስር አቅጣጫ',
          'ይህ ምልክት ትስስር ላይ ያለ አቅጣጫ ምልክት ነው። ምልክቱ ላይ ያሉ ቀስቶች አቅጣጫ ይከተሉ።'),
    117: ('T_JUNCTION_WARN',  'אזהרה — צומת T קדימה',          'ማስጠንቀቂያ — ቲ-ትስስር',
          'ይህ ምልክት ቀጣዩ ቦታ ቲ-ሸፕ ትስስር እንዳለ ማስጠንቀቂያ ይሰጣል። ፍጥነቱን ቀንሶ ጥንቃቄ ያስፈልጋል።'),
    118: ('JUNCTION_ARROWS',  'צמתים עם חיצי כיוון',           'ጥቆማ ምልክቶች ያሉ ትስስር',
          'ይህ ምልክት ቀጣዩ ትስስር ላይ አቅጣጫ ቀስቶች እንዳሉ ያሳያል። ቀስቶቹን ተከትሎ ምንዛሬ ያድርጉ።'),
    119: ('S_CURVE',          'עקומת S',                       'ኤስ-ጠምዘዝ',
          'ይህ ምልክት ቀጣዩ መንገድ ወደ ሁለቱም አቅጣጫዎች የሚዞር ኤስ-ሸፕ ጠምዘዝ እንዳለ ያሳያል።'),
    120: ('ROUNDABOUT_AHEAD', 'כיכר קדימה',                    'ክብ-መሄጃ ቀጣይ',
          'ይህ ምልክት ቀጣዩ ቦታ ክብ-መሄጃ (ሮተሪ) እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ዝግጁ ሆን።'),
    121: ('TRAFFIC_LIGHT',    'רמזור קדימה',                   'ትራፊክ መብራት',
          'ይህ ምልክት ቀጣዩ ቦታ ትራፊክ መብራት እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ለሚጠበቀው ቀይ መብራት ዝግጁ ሁን።'),
    122: ('ROAD_MERGE',       'מיזוג דרכים',                   'ሁለት መንገዶች ተቀላቅለዋል',
          'ይህ ምልክት ቀጣዩ ቦታ ሁለት መንገዶች ተቀላቅለው አንድ እንደሚሆኑ ያሳያል። ሌሎች ተሽከርካሪዎችን ጠቁሞ ጥንቃቄ ያድርጉ።'),
    123: ('MERGE_PRIORITY',   'מיזוג עם עדיפות',               'ቅድሚያ ያለው ምዋሃድ',
          'ይህ ምልክት ቀጣዩ ምዋሃድ ቦታ ቅድሚያ ያለው ምዋሃድ እንዳለ ያሳያል። ቅድሚያ ለሚሰጡ ተሽከርካሪዎች ቆም ይበሉ።'),
    124: ('MERGE_INFO',       'מידע מיזוג',                    'ምዋሃድ ምልክት',
          'ይህ ምልክት ቀጣዩ ቦታ ምዋሃድ እንዳለ ያሳያል። ጥንቃቄ ያድርጉ።'),
    125: ('MERGE_SIDE',       'מיזוג ימין/שמאל',               'ከጎን ምዋሃድ',
          'ይህ ምልክት ቀጣዩ ቦታ ከቀኝ ወይም ከግራ ምዋሃድ እንዳለ ያሳያል። ጥንቃቄ ያድርጉ።'),
    126: ('LANE_ENDS',        'נתיב מסתיים',                   'መስመር ያልቃል',
          'ይህ ምልክት የእርስዎ መስመር ቀጣዩ ቦታ እንደሚያልቅ ያሳያል። ወደ ሌላ መስመር ቀስ ብሎ ይሸጋገሩ።'),
    127: ('CONGESTION',       'פקק תנועה קדימה',               'ትራፊክ ጭፍቃ ቀጣይ',
          'ይህ ምልክት ቀጣዩ ቦታ ትራፊክ ጭፍቃ (ፈቃዴ) እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ዝግጁ ሁን።'),
    128: ('RAILROAD_BARRIER', 'מסילת ברזל עם מחסום',           'ምሶሶ ያለው ባቡር መሻገሪያ',
          'ይህ ምልክት ቀጣዩ ቦታ ምሶሶ ያለው የባቡር መሻገሪያ እንዳለ ያሳያል። ቆም ብለህ ምሶሶ ሲወጣ ብቻ አልፍ።'),
    129: ('RAILROAD_NO_BARRIER','מסילת ברזל ללא מחסום',        'ምሶሶ የሌለው ባቡር መሻገሪያ',
          'ይህ ምልክት ቀጣዩ ቦታ ምሶሶ የሌለው የባቡር መሻገሪያ እንዳለ ያሳያል። ቆም ብለህ ሁለቱን አቅጣጫዎች ተመልከት።'),
    130: ('RAILROAD_300M',    'מסילת ברזל 300 מ׳',             'ባቡር መሻገሪያ 300 ሜ',
          'ይህ ምልክት ከ300 ሜትር ርቀት ላይ የባቡር መሻገሪያ እንዳለ ያሳያል። ዝግጁ ሁን።'),
    131: ('RAILROAD_200M',    'מסילת ברזל 200 מ׳',             'ባቡር መሻገሪያ 200 ሜ',
          'ይህ ምልክት ከ200 ሜትር ርቀት ላይ የባቡር መሻገሪያ እንዳለ ያሳያል። ዝግጁ ሁን።'),
    132: ('RAILROAD_100M',    'מסילת ברזל 100 מ׳',             'ባቡር መሻገሪያ 100 ሜ',
          'ይህ ምልክት ከ100 ሜትር ርቀት ላይ የባቡር መሻገሪያ እንዳለ ያሳያል። አሁን ዝግጁ ሁን።'),
    133: ('RAILROAD_SINGLE',  'מסילת ברזל — תלול יחיד',       'አንድ ሐዲድ ባቡር',
          'ይህ ምልክት ቀጣዩ ቦታ አንድ ሐዲድ ያለው የባቡር መሻገሪያ እንዳለ ያሳያል። ጥንቃቄ ያድርጉ።'),
    134: ('RAILROAD_MULTIPLE','מסילת ברזל — מסילות רבות',     'ብዙ ሐዲዶች ባቡር',
          'ይህ ምልክት ቀጣዩ ቦታ ብዙ ሐዲዶች ያሉበት የባቡር መሻገሪያ እንዳለ ያሳያል። ሁሉንም አቅጣጫዎች ተመልከት።'),
    135: ('PEDESTRIAN',       'מעבר חצייה להולכי רגל',         'የእግረኛ መሻገሪያ',
          'ይህ ምልክት ቀጣዩ ቦታ የእግረኞች መሻገሪያ እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ለእግረኞች ቅድሚያ ስጥ።'),
    136: ('SCHOOL_ZONE',      'ילדים — אזור בית ספר',          'ልጆች — የትምህርት ቤት አካባቢ',
          'ይህ ምልክት ቀጣዩ ቦታ የትምህርት ቤት አካባቢ እና ልጆች እንዳሉ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያድርጉ።'),
    137: ('BICYCLES',         'אופניים',                       'ብስክሌቶች',
          'ይህ ምልክት ቀጣዩ ቦታ ብስክሌቶች እንዳሉ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያድርጉ።'),
    138: ('STOP_AHEAD',       'תמרור עצור לפניכם',             'አስቁም ምልክት ቀጣይ',
          'ይህ ምልክት ቀጣዩ ቦታ አስቁም ምልክት እንዳለ ያሳያል። ለሙሉ ማቆም ዝግጁ ሁን።'),
    139: ('TUNNEL',           'מנהרה קדימה',                   'ዋሻ ቀጣይ',
          'ይህ ምልክት ቀጣዩ ቦታ ዋሻ (ሱርፋ) እንዳለ ያሳያል። መብራቶቹን አብርቶ ፍጥነቱን ቀንስ።'),
    140: ('HILL_DESCENT',     'ירידה תלולה',                   'ቁልቁለት',
          'ይህ ምልክት ቀጣዩ ቦታ ቁልቁለት እንዳለ ያሳያል። ፍጥነቱን ቀንሶ ብሬኩን ጥቡ ተጠቀም።'),
    141: ('SLIPPERY',         'סכנת החלקה',                    'ሸለሸለ መንገድ',
          'ይህ ምልክት ቀጣዩ መንገድ ሸለሸለ ሊሆን እንደሚችል ያሳያል። ፍጥነቱን ቀንሶ ርቀት ጠብቅ።'),
    142: ('FALLING_ROCKS',    'נפילת אבנים',                   'ድንጋይ ወድቆ',
          'ይህ ምልክት ቀጣዩ ቦታ ድንጋዮች ሊወድቁ እንደሚችሉ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያድርጉ።'),
    143: ('ROCKS_INFO',       'אזהרת נפילת אבנים',             'ድንጋይ ወድቆ ማስጠንቀቂያ',
          'ይህ ምልክት ቀጣዩ ቦታ ድንጋዮች ሊወድቁ እንደሚችሉ ማስጠንቀቂያ ይሰጣል።'),
    144: ('TRAFFIC_AHEAD',    'תנועה קדימה',                   'ትራፊክ ቀጣይ',
          'ይህ ምልክት ቀጣዩ ቦታ ትራፊክ ጭፍቃ ወይም ተሽከርካሪዎች እንዳሉ ያሳያል። ፍጥነቱን ቀንስ።'),
    145: ('ANIMALS',          'בעלי חיים בכביש',               'እንስሳት በመንገድ',
          'ይህ ምልክት ቀጣዩ ቦታ እንስሳት ሊኖሩ እንደሚችሉ ያሳያል። ፍጥነቱን ቀንሶ ጥንቃቄ ያድርጉ።'),
    146: ('TRACTOR',          'טרקטור / רכב עבודה',            'ትራክተር / ሥራ ተሽከርካሪ',
          'ይህ ምልክት ቀጣዩ ቦታ ትራክተር ወይም ሥራ ተሽከርካሪዎች ሊኖሩ እንደሚችሉ ያሳያል። ጥንቃቄ ያድርጉ።'),
    147: ('ROADSIDE_POSTS',   'עמודי הכוונה בצד הכביש',        'የጎዳና ምሶሶዎች',
          'ይህ ምልክት ቀጣዩ ቦታ የጎዳና ምሶሶዎች እንዳሉ ያሳያል። ምሶሶዎቹን ሳያርፉ ይቀጥሉ።'),
    148: ('REFLECTORS_RIGHT', 'עיני חתול — ימין',              'ብርሃን ማንጸባረቂያ — ቀኝ',
          'ይህ ምልክት ቀጣዩ ቦታ ከቀኝ ጎን ብርሃን ማንጸባረቂያዎች እንዳሉ ያሳያል።'),
    149: ('REFLECTORS',       'עיני חתול',                     'ብርሃን ማንጸባረቂያ',
          'ይህ ምልክት ቀጣዩ ቦታ ብርሃን ማንጸባረቂያዎች (ካት አይን) እንዳሉ ያሳያል።'),
    150: ('DANGEROUS_SPOT',   'מקום מסוכן',                    'አደገኛ ቦታ',
          'ይህ ምልክት ቀጣዩ ቦታ ልዩ አደጋ ያለበት አደገኛ ቦታ እንዳለ ያሳያል። ከፍተኛ ጥንቃቄ ያድርጉ።'),
    151: ('ACCIDENT_ZONE',    'אזור תאונות',                   'የትርፋት አካባቢ',
          'ይህ ምልክት ቀጣዩ ቦታ ብዙ ጊዜ አደጋ የሚፈጠርበት አካባቢ እንዳለ ያሳያል። ከፍተኛ ጥንቃቄ ያድርጉ።'),
    152: ('SIDE_WIND',        'רוח צד / מים עמוקים',           'የጎን ነፋስ / ጥልቅ ውሃ',
          'ይህ ምልክት ቀጣዩ ቦታ ጠንካራ የጎን ነፋስ ወይም ጥልቅ ውሃ እንዳለ ያሳያል። ጥንቃቄ ያድርጉ።'),
}


def make_questions(num: int, name_amharic: str, explanation_amharic: str) -> list:
    """Generate 3 placeholder questions for a sign."""
    q_id = f"SIGN_{num}"
    return [
        {
            "id": f"Q_{q_id}_001",
            "question_amharic": f"ምልክት {num} ሲያዩ ምን ማድረግ አለብዎ?",
            "question_audio": f"q_{num}_001.mp3",
            "answers": [
                {"id": "A", "text_amharic": "ፍጥነቱን ቀንሶ ጥንቃቄ ያድርጉ",  "image": "answer_slow_down.png",  "is_correct": True},
                {"id": "B", "text_amharic": "ቶሎ ያልፉ",                  "image": "answer_speed_up.png",   "is_correct": False},
                {"id": "C", "text_amharic": "ምንም ለውጥ የለም",            "image": "answer_continue.png",   "is_correct": False},
            ],
            "explanation_correct_amharic": f"ትክክል! {name_amharic} ምልክት ሲያዩ ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።",
            "explanation_wrong_amharic":   f"ስህተት። {name_amharic} ምልክት ሲያዩ ፍጥነቱን ቀንሶ ጥንቃቄ ማድረግ ያስፈልጋል።",
            "explanation_correct_audio":   f"q_{num}_001_correct.mp3",
            "explanation_wrong_audio":     f"q_{num}_001_wrong.mp3",
        },
        {
            "id": f"Q_{q_id}_002",
            "question_amharic": f"ምልክት {num} ምን ዓይነት አደጋ ያሳያል?",
            "question_audio": f"q_{num}_002.mp3",
            "answers": [
                {"id": "A", "text_amharic": name_amharic,                "image": "answer_correct.png",    "is_correct": True},
                {"id": "B", "text_amharic": "ሙሉ ለሙሉ ቁም",              "image": "answer_full_stop.png",  "is_correct": False},
                {"id": "C", "text_amharic": "ፍጥነቱን ጨምር",              "image": "answer_speed_up.png",   "is_correct": False},
            ],
            "explanation_correct_amharic": f"ትክክል! ምልክት {num} {name_amharic} ያሳያል።",
            "explanation_wrong_amharic":   f"ስህተት። ምልክት {num} {name_amharic} ያሳያል።",
            "explanation_correct_audio":   f"q_{num}_002_correct.mp3",
            "explanation_wrong_audio":     f"q_{num}_002_wrong.mp3",
        },
        {
            "id": f"Q_{q_id}_003",
            "question_amharic": f"ይህ ምልክት ማሳወቅ የሚፈልገው ምንድን ነው?",
            "question_audio": f"q_{num}_003.mp3",
            "answers": [
                {"id": "A", "text_amharic": "ቶሎ ያልፉ",                  "image": "answer_speed_up.png",   "is_correct": False},
                {"id": "B", "text_amharic": "ምንም ለውጥ የለም",            "image": "answer_continue.png",   "is_correct": False},
                {"id": "C", "text_amharic": explanation_amharic[:60],    "image": "answer_correct.png",    "is_correct": True},
            ],
            "explanation_correct_amharic": f"ትክክል! {explanation_amharic[:80]}",
            "explanation_wrong_amharic":   f"ስህተት። {explanation_amharic[:80]}",
            "explanation_correct_audio":   f"q_{num}_003_correct.mp3",
            "explanation_wrong_audio":     f"q_{num}_003_wrong.mp3",
        },
    ]


def main():
    with open(SIGNS_JSON, 'r', encoding='utf-8-sig') as f:
        signs = json.load(f)

    # ── Step 1: Update image_filename for existing 12 warning signs ───────────
    old_updated = 0
    for sign in signs:
        old_fn = sign.get('image_filename', '')
        if old_fn in OLD_TO_NEW:
            sign['image_filename'] = OLD_TO_NEW[old_fn]
            old_updated += 1
            print(f"  [rename] {old_fn} → {OLD_TO_NEW[old_fn]}")

    print(f"\n  Updated existing: {old_updated} warning signs")

    # ── Step 2: Collect existing warning sign IDs to avoid duplicates ─────────
    existing_warning_ids = {
        s['id'] for s in signs if s.get('topic_id') == 'warning'
    }
    # Build map of used PDF numbers from existing signs
    used_nums = set()
    for src_fn, new_fn in OLD_TO_NEW.items():
        m = re.match(r'(\d+)\.png', new_fn)
        if m:
            used_nums.add(int(m.group(1)))

    # ── Step 3: Remove old warning signs, rebuild with all 52 ─────────────────
    # Keep all non-warning signs
    non_warning = [s for s in signs if s.get('topic_id') != 'warning']

    # Build complete warning signs list from WARNING_SIGNS_DATA
    # First, collect existing warning signs keyed by their new number
    existing_by_num = {}
    for sign in signs:
        if sign.get('topic_id') == 'warning':
            fn = sign.get('image_filename', '')
            m = re.match(r'(\d+)\.png', fn)
            if m:
                existing_by_num[int(m.group(1))] = sign

    new_warning_signs = []
    order = 1

    for num in range(101, 153):
        if num not in WARNING_SIGNS_DATA:
            continue
        suffix, heb, amh, expl = WARNING_SIGNS_DATA[num]

        if num in existing_by_num:
            # Keep existing sign, just ensure image_filename is updated
            s = existing_by_num[num]
            s['image_filename'] = f'{num}.png'
            s['order'] = order
            new_warning_signs.append(s)
            print(f"  [keep] {num}.png  (existing content preserved)")
        else:
            # Create new sign entry
            new_sign = {
                "id":                          f"SIGN_{num}",
                "topic_id":                    "warning",
                "order":                       order,
                "image_filename":              f"{num}.png",
                "video_filename":              f"sign_{num}_amharic.mp4",
                "name_hebrew":                 heb,
                "name_amharic":                amh,
                "explanation_amharic":         expl,
                "audio_name_filename":         f"sign_{num}_name.mp3",
                "audio_explanation_filename":  f"sign_{num}_explanation.mp3",
                "questions":                   make_questions(num, amh, expl),
            }
            new_warning_signs.append(new_sign)
            print(f"  [new]  {num}.png  {heb}")
        order += 1

    # Add road_work placeholder (no PDF number) — keep it
    rw = next((s for s in signs if s.get('image_filename') == 'sign_road_work.png'), None)
    if rw:
        rw['order'] = order
        new_warning_signs.append(rw)
        print(f"  [keep] sign_road_work.png")

    # ── Step 4: Rebuild signs array: non-warning + new warning ────────────────
    updated_signs = non_warning + new_warning_signs

    with open(SIGNS_JSON, 'w', encoding='utf-8') as f:
        json.dump(updated_signs, f, ensure_ascii=False, indent=4)

    print(f"\n✅ signs.json updated")
    print(f"   Non-warning signs: {len(non_warning)}")
    print(f"   Warning signs:     {len(new_warning_signs)} (52 numbered + road_work)")
    print(f"   Total:             {len(updated_signs)}")


if __name__ == '__main__':
    main()
