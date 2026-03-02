"""
updateRightOfWaySignsJson.py
============================
Updates content/signs.json for Part 3 (right-of-way signs 301-310):
  1. Removes all existing right_of_way signs (descriptive IDs)
  2. Adds 10 new signs (301-310) with numbered filenames (301.png … 310.png)

Run: python -X utf8 scripts/updateRightOfWaySignsJson.py
"""

import json, sys, os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SIGNS_JSON = r"C:\Users\Yakov\Desktop\driving-theory-app\content\signs.json"

# ── Sign data: number → (hebrew_name, amharic_name, amharic_explanation) ────────
ROW_SIGNS_DATA = {
    301: ('תן זכות קדימה',
          'ቅድሚያ ስጥ',
          'ይህ ምልክት ቀጣዩ ቦታ ላይ ቅድሚያ ሰጥቶ ማለፍ አለብህ ማለት ነው። ሌሎች ተሽከርካሪዎች ካሉ ቀዝቅዞ ወይም ቆሞ ቅድሚያ ስጥ።'),
    302: ('עצור',
          'ቁም',
          'ይህ ምልክት ሙሉ ለሙሉ ቆሞ ከዛ ቅድሚያ ሰጥቶ ማለፍ አለብህ ማለት ነው። ሳይቆም ማለፍ ክልክል ነው።'),
    303: ('תן זכות קדימה לתנועת הכיכר',
          'በክብ-መሄጃ ቅድሚያ ስጥ',
          'ወደ ክብ-መሄጃ (ሮተሪ) ስትገባ ቀደም ብሎ ለሚሄደው ትራፊክ ቅድሚያ ስጥ። ክብ-መሄጃ ውስጥ ላሉ ተሽከርካሪዎች ቅድሚያ አለ።'),
    304: ('עצור! המתן לאישור לחציית מפגש',
          'ቁም! ፈቃድ ጠብቅ',
          'ሙሉ ለሙሉ ቁሞ ወደፊት ለመቀጠል ፈቃድ እስኪሰጥ ጠብቅ። ያለ ፈቃድ ማለፍ ክልክል ነው።'),
    305: ('תמרור נייד — תן זכות קדימה',
          'ተንቀሳቃሽ ቅድሚያ ምልክት',
          'ይህ ምልክት ተንቀሳቃሽ ሲሆን ለጊዜያዊ ሁኔታዎች (ለምሳሌ ግንባታ) ቅድሚያ ሰጥቶ ማለፍ አለብህ ማለት ነው።'),
    306: ('תן זכות קדימה להולכי רגל',
          'ለእግረኞች ቅድሚያ ስጥ',
          'ይህ ምልክት ባለበት ቦታ ለእግረኞች ቅድሚያ ሰጥቶ ማለፍ አለብህ። እግረኞች ሲሻገሩ ቆሞ ጠብቅ።'),
    307: ('תן זכות קדימה לתנועה הנגדית',
          'ለተቃራኒ ትራፊክ ቅድሚያ ስጥ',
          'በዚህ ጠባ መንገድ ላይ ለተቃራኒ ትራፊክ ቅድሚያ ስጥ። ሌሎቹ ካለፉ በኋላ ቀጥል።'),
    308: ('יש לך זכות קדימה על התנועה הנגדית',
          'ቅድሚያ አለህ',
          'በዚህ ጠባ መንገድ ላይ አንተ ቅድሚያ አለህ። ተቃራኒ ትራፊክ ለአንተ ቅድሚያ ይሰጣል።'),
    309: ('יש לך זכות קדימה עד לצומת הקרוב',
          'እስከ ቀጣይ ምንዛሬ ቅድሚያ አለህ',
          'ቀጣዩ ምንዛሬ (ትስስር) ድረስ አንተ ቅድሚያ አለህ። ሌሎቹ ለአንተ ቅድሚያ ይሰጣሉ።'),
    310: ('סיום זכות הקדימה',
          'የቅድሚያ መጨረሻ',
          'ከዚህ ቦታ ጀምሮ ቅድሚያህ ተቋጭቷል። ሌሎቹ ቅድሚያ ሊኖራቸው ይችላል፤ ጥንቃቄ አድርግ።'),
}

# ── Questions per sign (3 each) ──────────────────────────────────────────────
def make_questions(num: int) -> list:
    q = {
        301: [
            {'question_amharic': 'ምልክት 301 ምን ያዛል?',
             'answers': [
                 {'text': 'ቅድሚያ ሰጥቶ ማለፍ', 'is_correct': True},
                 {'text': 'ሙሉ ለሙሉ ቆም', 'is_correct': False},
                 {'text': 'ፍጥነት ጨምር', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 301 ቅድሚያ ሰጥቶ ማለፍ አለብህ ማለት ነው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 301 ቅድሚያ ሰጥቶ ማለፍ ያዛል — ሙሉ ቆም አይደለም።'},
            {'question_amharic': 'ምልክት 301 ያለበት ቦታ ላይ ሌሎች ተሽከርካሪዎች ከሌሉ ምን ያደርጋሉ?',
             'answers': [
                 {'text': 'ቆሞ መጠበቅ አያስፈልግም', 'is_correct': True},
                 {'text': 'ሁልጊዜ ሙሉ ለሙሉ ቆም', 'is_correct': False},
                 {'text': 'ቀስ ብሎ ፍጥነት ቀንሶ ማለፍ ብቻ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 301 ሌሎቹ ከሌሉ ሳይቆሙ ማለፍ ይፈቅዳል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 302 (Stop) ሙሉ ቆምን ያስገድዳል፤ 301 አይደለም።'},
            {'question_amharic': 'ምልክት 301 ምን ዓይነት ቅርጽ አለው?',
             'answers': [
                 {'text': 'ወደ ታች ያለ ትሪያንግል', 'is_correct': True},
                 {'text': 'ስምንት ጎን ቅርጽ', 'is_correct': False},
                 {'text': 'ክብ ቅርጽ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 301 ወደ ታች ያለ ነጭ ትሪያንግል ቅርጽ አለው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 301 ወደ ታች ያለ ትሪያንግል ቅርጽ አለው — ስምንት ጎን አይደለም።'},
        ],
        302: [
            {'question_amharic': 'ምልክት 302 ምን ያዛል?',
             'answers': [
                 {'text': 'ሙሉ ለሙሉ ቆም ከዛ ቅድሚያ ስጥ', 'is_correct': True},
                 {'text': 'ቅድሚያ ሰጥቶ ማለፍ', 'is_correct': False},
                 {'text': 'ፍጥነት ቀንስ ብቻ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 302 ሙሉ ለሙሉ ቆሞ ቅድሚያ ሰጥቶ ማለፍ ያዛል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 302 ሙሉ ቆምን ያስገድዳል — ቅድሚያ ሰጥቶ ማለፍ ብቻ አይደለም።'},
            {'question_amharic': 'ምልክት 302 (Stop) ምን ዓይነት ቅርጽ አለው?',
             'answers': [
                 {'text': 'ስምንት ጎን (octagon)', 'is_correct': True},
                 {'text': 'ወደ ታች ያለ ትሪያንግል', 'is_correct': False},
                 {'text': 'ክብ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 302 ስምንት ጎን (octagon) ቅርጽ አለው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 302 ስምንት ጎን ቅርጽ አለው — ወደ ታች ትሪያንግል አይደለም።'},
            {'question_amharic': 'ምልክት 302 ላይ ሳይቆሙ ካለፉ ምን ይሆናል?',
             'answers': [
                 {'text': 'የትራፊክ ህግ ጥሰት ነው', 'is_correct': True},
                 {'text': 'ምንም አይደለም', 'is_correct': False},
                 {'text': 'ፍጥነት ቢቀनሱ ተፈቅዷል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 302 ሳይቆሙ ማለፍ ከባድ የትራፊክ ህግ ጥሰት ነው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 302 ሳይቆሙ ማለፍ ህግን መጣስ ነው።'},
        ],
        303: [
            {'question_amharic': 'ወደ ክብ-መሄጃ ስትገባ ምልክት 303 ምን ያዛል?',
             'answers': [
                 {'text': 'ክብ-መሄጃ ውስጥ ላሉ ቅድሚያ ስጥ', 'is_correct': True},
                 {'text': 'ፍጥነት ጨምሮ ቀጥታ ሂድ', 'is_correct': False},
                 {'text': 'ሁሌ ቆም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 303 ወደ ክብ-መሄጃ ስትገባ ቀደም ያሉ ተሽከርካሪዎች ቅድሚያ አላቸው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 303 ክብ-መሄጃ ውስጥ ላሉ ቅድሚያ ሰጥቶ ማለፍ ያዛል።'},
            {'question_amharic': 'ምልክት 303 የት ይገኛል?',
             'answers': [
                 {'text': 'ወደ ክብ-መሄጃ (ሮተሪ) ከመግባቱ በፊት', 'is_correct': True},
                 {'text': 'ክብ-መሄጃ ውስጥ', 'is_correct': False},
                 {'text': 'ከክብ-መሄጃ ወጪ ላይ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 303 ወደ ክብ-መሄጃ ከመገባቱ ቅድሚያ ሰጥቶ ማለፍ ያሳስባል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 303 ወደ ሮተሪ ከመገባቱ ቅድሚያ ሳይሰጥ መግባት ክልክል ነው።'},
            {'question_amharic': 'ምልክት 303 ካለ ክብ-መሄጃ ውስጥ ካለ ተሽከርካሪ ጋር ማን ቅድሚያ አለው?',
             'answers': [
                 {'text': 'ክብ-መሄጃ ውስጥ ያለው', 'is_correct': True},
                 {'text': 'ወደ ክብ-መሄጃ ሚገባው', 'is_correct': False},
                 {'text': 'ሁለቱም እኩል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ክብ-መሄጃ ውስጥ ያለው ተሽከርካሪ ቅድሚያ አለው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 303 ካለ ክብ-መሄጃ ውስጥ ያለው ቅድሚያ አለው።'},
        ],
        304: [
            {'question_amharic': 'ምልክት 304 ምን ያዛል?',
             'answers': [
                 {'text': 'ቆሞ ፈቃድ ጠብቅ', 'is_correct': True},
                 {'text': 'ቅድሚያ ሰጥቶ ቀጥል', 'is_correct': False},
                 {'text': 'ፍጥነት ቀንሶ ቀጥል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 304 ሙሉ ለሙሉ ቆሞ ወደፊት ለመቀጠል ፈቃድ እስኪሰጥ ጠብቅ ያዛል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 304 ሙሉ ቆምና ፈቃድ መጠበቅ ያስፈልጋል።'},
            {'question_amharic': 'ምልክት 304 ምልክት 302 (Stop) ከምን ይለያል?',
             'answers': [
                 {'text': 'ፈቃድ እስኪሰጥ ቆሞ መጠበቅ ያስፈልጋል', 'is_correct': True},
                 {'text': 'ምንም ልዩነት የለም', 'is_correct': False},
                 {'text': 'ቅርጹ ብቻ ይለያል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 304 ፈቃድ እስኪሰጥ ቆሞ መጠበቅ ያስፈልጋል — 302 ቆሞ ቅድሚያ ሰጥቶ ማለፍ ብቻ ነው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 304 ፈቃድ እስኪሰጥ ቆሞ ይጠበቃል።'},
            {'question_amharic': 'ምልክት 304 ያለበት ቦታ ፈቃድ ሳይሰጡ ካለፉ ምን ይሆናል?',
             'answers': [
                 {'text': 'ከባድ የህግ ጥሰት ነው', 'is_correct': True},
                 {'text': 'ቀላል ማስጠንቀቂያ ብቻ', 'is_correct': False},
                 {'text': 'ምንም አይደለም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 304 ያለ ፈቃድ ማለፍ ከባድ የህግ ጥሰት ነው።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 304 ያለ ፈቃድ ማለፍ ህጋዊ አይደለም።'},
        ],
        305: [
            {'question_amharic': 'ምልክት 305 ምን ዓይነት ምልክት ነው?',
             'answers': [
                 {'text': 'ተንቀሳቃሽ ምልክት', 'is_correct': True},
                 {'text': 'ቋሚ ምልክት', 'is_correct': False},
                 {'text': 'የፍጥነት ወሰን ምልክት', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 305 ተንቀሳቃሽ (mobile) ምልክት ሲሆን ለጊዜያዊ ሁኔታዎች ይጠቀምበታል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 305 ተንቀሳቃሽ ምልክት ነው።'},
            {'question_amharic': 'ምልክት 305 (ተንቀሳቃሽ) ምን ያዛል?',
             'answers': [
                 {'text': 'ቅድሚያ ሰጥቶ ማለፍ', 'is_correct': True},
                 {'text': 'ሙሉ ለሙሉ ቁም', 'is_correct': False},
                 {'text': 'ማለፍ ክልክል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 305 ተንቀሳቃሽ ቅድሚያ ምልክት ነው — ቅድሚያ ሰጥቶ ማለፍ ያዛል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 305 ቅድሚያ ሰጥቶ ማለፍ ያዛል።'},
            {'question_amharic': 'ምልክት 305 መቼ ጥቅም ላይ ይውላል?',
             'answers': [
                 {'text': 'በጊዜያዊ ሁኔታዎች (ለምሳሌ ግንባታ)', 'is_correct': True},
                 {'text': 'ሁሌ ቋሚ ቦታ ላይ', 'is_correct': False},
                 {'text': 'ሌሊት ብቻ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 305 ለጊዜያዊ ሁኔታዎች ጥቅም ላይ ይውላል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 305 ለጊዜያዊ ሁኔታዎች (ለምሳሌ ግንባታ) ጥቅም ላይ ይውላል።'},
        ],
        306: [
            {'question_amharic': 'ምልክት 306 ምን ያዛል?',
             'answers': [
                 {'text': 'ለእግረኞች ቅድሚያ ስጥ', 'is_correct': True},
                 {'text': 'እግረኞች አይሻገሩም', 'is_correct': False},
                 {'text': 'ፍጥነት ጨምር', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 306 ለእግረኞች ቅድሚያ ሰጥቶ ማለፍ ያዛል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 306 ለእግረኞች ቅድሚያ ሰጥቶ ማለፍ ያዛል።'},
            {'question_amharic': 'ምልክት 306 ያለበት ቦታ እግረኛ ሲሻገር ምን ያደርጋሉ?',
             'answers': [
                 {'text': 'ቆሞ እግረኛ እስኪያልፍ ጠብቅ', 'is_correct': True},
                 {'text': 'ፍጥነት ቀንሶ ቀጥል', 'is_correct': False},
                 {'text': 'ሆርን ደወሎ ቀጥል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 306 ሲኖር እግረኛ ሲሻገር ቆሞ መጠበቅ ያስፈልጋል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 306 ሲኖር እግረኛ ሲሻገር ቆሞ ጠብቅ።'},
            {'question_amharic': 'ምልክት 306 ምልክት 301 ከምን ይለያል?',
             'answers': [
                 {'text': 'ለእግረኞች ቅድሚያ ይሰጣል', 'is_correct': True},
                 {'text': 'ምንም ልዩነት የለም', 'is_correct': False},
                 {'text': 'ቀለሙ ብቻ ይለያል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 306 ለእግረኞች ቅድሚያ ሲሰጥ፣ 301 ለሁሉም ትራፊክ ቅድሚያ ይሰጣል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 306 ለእግረኞች ቅድሚያ ይሰጣል።'},
        ],
        307: [
            {'question_amharic': 'ምልክት 307 ምን ያዛል?',
             'answers': [
                 {'text': 'ለተቃራኒ ትራፊክ ቅድሚያ ስጥ', 'is_correct': True},
                 {'text': 'ቅድሚያ አለህ', 'is_correct': False},
                 {'text': 'ሙሉ ለሙሉ ቁም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 307 ለተቃራኒ ትራፊክ ቅድሚያ ሰጥቶ ማለፍ ያዛል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 307 ለተቃራኒ ትራፊክ ቅድሚያ ስጥ ያዛል — አይደለም ቅድሚያ አለህ።'},
            {'question_amharic': 'ምልክት 307 ምልክት 308 ከምን ይለያል?',
             'answers': [
                 {'text': '307 ቅድሚያ ሰጥቶ፣ 308 ቅድሚያ ይቀበላል', 'is_correct': True},
                 {'text': 'ምንም ልዩነት የለም', 'is_correct': False},
                 {'text': '308 ቅድሚያ ሰጥቶ፣ 307 ቅድሚያ ይቀበላል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! 307 ቅድሚያ ሰጥቶ ያልፋል፣ 308 ቅድሚያ ይቀበላል።',
             'explanation_wrong_amharic':   'ስህተት። 307 ቅድሚያ ሰጥቶ፣ 308 ቅድሚያ ይቀበላል።'},
            {'question_amharic': 'ምልክት 307 ያለበት ጠባ መንገድ ላይ ሁለት ተሽከርካሪ ሲገናኙ ማን ይጠብቃል?',
             'answers': [
                 {'text': 'ምልክት 307 ያለው', 'is_correct': True},
                 {'text': 'ምልክት 308 ያለው', 'is_correct': False},
                 {'text': 'ሁለቱም ይሄዳሉ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 307 ያለው ተሽከርካሪ ቅድሚያ ሰጥቶ ይጠብቃል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 307 ያለው ቅድሚያ ሰጥቶ ይጠብቃል።'},
        ],
        308: [
            {'question_amharic': 'ምልክት 308 ምን ይነግራል?',
             'answers': [
                 {'text': 'ቅድሚያ አለህ', 'is_correct': True},
                 {'text': 'ቅድሚያ ስጥ', 'is_correct': False},
                 {'text': 'ሙሉ ለሙሉ ቁም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 308 ቅድሚያ አለህ ይነግርሃል — ተቃራኒ ትራፊክ ለአንተ ቅድሚያ ይሰጣል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 308 ቅድሚያ አለህ ይነግርሃል — ቅድሚያ ስጥ ሳይሆን።'},
            {'question_amharic': 'ምልክት 308 ያለ ጠባ መንገድ ላይ ቅድሚያ የለው ማን ነው?',
             'answers': [
                 {'text': 'ተቃራኒ ትራፊክ', 'is_correct': True},
                 {'text': 'ምልክት 308 ያለው', 'is_correct': False},
                 {'text': 'ሁለቱም እኩል', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 308 ቅድሚያ ካለህ ተቃራኒ ትራፊክ ቅድሚያ ሰጥቶ ይጠብቃል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 308 ቅድሚያ ያለህ ስለሆነ ተቃራኒ ትራፊክ ይጠብቃሃል።'},
            {'question_amharic': 'ምልክት 308 ምልክት 307 ካለ ተሽከርካሪ ጋር ሲገናኙ ማን ይሄዳል?',
             'answers': [
                 {'text': 'ምልክት 308 ያለው — ቅድሚያ አለው', 'is_correct': True},
                 {'text': 'ምልክት 307 ያለው', 'is_correct': False},
                 {'text': 'ሁለቱም አቋርጠው ይሄዳሉ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 308 ቅድሚያ ስላለው 307 ያለው ይጠብቃል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 308 ቅድሚያ ያለው ስለሆነ 307 ያለው ይጠብቃል።'},
        ],
        309: [
            {'question_amharic': 'ምልክት 309 ምን ይነግራል?',
             'answers': [
                 {'text': 'እስከ ቀጣዩ ምንዛሬ ቅድሚያ አለህ', 'is_correct': True},
                 {'text': 'ቅድሚያ ስጥ', 'is_correct': False},
                 {'text': 'ቅድሚያ ተቋጨ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 309 ቀጣዩ ምንዛሬ ድረስ ቅድሚያ እንዳለህ ይነግርሃል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 309 ቅድሚያ አለህ — ቅድሚያ ስጥ ሳይሆን።'},
            {'question_amharic': 'ምልክት 309 ከምን ጋር ሲደረስ ቅድሚያ ያበቃል?',
             'answers': [
                 {'text': 'ቀጣዩ ምንዛሬ (ትስስር)', 'is_correct': True},
                 {'text': 'ምልክቱ ሲጠፋ', 'is_correct': False},
                 {'text': 'ምንጊዜም አያበቃም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 309 ቀጣዩ ምንዛሬ ሲደርስ ቅድሚያ ያበቃል።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 309 ቀጣዩ ምንዛሬ ሲደርስ ቅድሚያ ያበቃል።'},
            {'question_amharic': 'ምልክት 309 ካለ ቅድሚያ ካለህ ምን ያደርጋሉ?',
             'answers': [
                 {'text': 'ሌሎቹ ለአንተ ቅድሚያ ይሰጣሉ', 'is_correct': True},
                 {'text': 'አንተ ቅድሚያ ትሰጣለህ', 'is_correct': False},
                 {'text': 'ሙሉ ለሙሉ ቆም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 309 ካለ ሌሎቹ ለአንተ ቅድሚያ ይሰጣሉ።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 309 ቅድሚያ ካለህ ሌሎቹ ለአንተ ቅድሚያ ይሰጣሉ።'},
        ],
        310: [
            {'question_amharic': 'ምልክት 310 ምን ይነግራል?',
             'answers': [
                 {'text': 'ቅድሚያህ ተቋጨ', 'is_correct': True},
                 {'text': 'ቅድሚያ አሁን ጀምሯል', 'is_correct': False},
                 {'text': 'ቅድሚያ ስጥ', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 310 ቅድሚያ ተቋጨ ይነግርሃል — ከዚህ ቦታ ጀምሮ ቅድሚያ የለህም።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 310 ቅድሚያህ ተቋጨ ይነግርሃል።'},
            {'question_amharic': 'ምልክት 310 ካለ ምን ዓይነት ጥንቃቄ ያስፈልጋል?',
             'answers': [
                 {'text': 'ሌሎቹ ቅድሚያ ሊኖራቸው ይችላል', 'is_correct': True},
                 {'text': 'ምንም ጥንቃቄ አያስፈልግም', 'is_correct': False},
                 {'text': 'ፍጥነት ጨምር', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 310 ካለ ቅድሚያ ስለሌለህ ሌሎቹ ቅድሚያ ሊኖራቸው ይችላል — ጥንቃቄ አድርግ።',
             'explanation_wrong_amharic':   'ስህተት። ምልክት 310 ካለ ሌሎቹ ቅድሚያ ሊኖራቸው ይችላል።'},
            {'question_amharic': 'ምልክት 310 ምልክት 309 ሲቀድም ምን ይሆናል?',
             'answers': [
                 {'text': 'ቅድሚያ ጀምሮ (309) ተቋጭቷል (310)', 'is_correct': True},
                 {'text': 'ሁለቱም ቅድሚያ ይሰጣሉ', 'is_correct': False},
                 {'text': 'ምንም ልዩነት የለም', 'is_correct': False},
             ],
             'explanation_correct_amharic': 'ትክክል! ምልክት 309 ቅድሚያ ጀምሮ ምልክት 310 ሲደርሱ ቅድሚያ ያበቃል።',
             'explanation_wrong_amharic':   'ስህተት። 309 ቅድሚያ ጀምሮ 310 ሲደርሱ ቅድሚያ ያበቃል።'},
        ],
    }
    return [
        {
            'id':                            f'ROW_{num}_Q{i+1}',
            'question_amharic':              item['question_amharic'],
            'question_audio':                None,
            'answers':                       item['answers'],
            'explanation_correct_amharic':   item['explanation_correct_amharic'],
            'explanation_correct_audio':     None,
            'explanation_wrong_amharic':     item['explanation_wrong_amharic'],
            'explanation_wrong_audio':       None,
        }
        for i, item in enumerate(q.get(num, []))
    ]


def main():
    with open(SIGNS_JSON, encoding='utf-8-sig') as f:
        signs = json.load(f)

    # ── Remove all existing right_of_way signs ────────────────────────────────
    old_row = [s for s in signs if s.get('topic_id') == 'right_of_way']
    print(f'Removing {len(old_row)} existing right_of_way signs...')
    signs = [s for s in signs if s.get('topic_id') != 'right_of_way']

    # ── Add 10 new ROW signs (301–310) ────────────────────────────────────────
    print('Adding 10 new right_of_way signs (301–310)...')
    for i, num in enumerate(range(301, 311)):
        heb, amh, exp = ROW_SIGNS_DATA[num]
        sign = {
            'id':                    f'ROW_{num}',
            'topic_id':              'right_of_way',
            'order':                 i + 1,
            'image_filename':        f'{num}.png',
            'video_filename':        None,
            'audio_name_filename':   None,
            'audio_explanation_filename': None,
            'name_hebrew':           heb,
            'name_amharic':          amh,
            'explanation_amharic':   exp,
            'questions':             make_questions(num),
        }
        signs.append(sign)
        print(f'  + {num}.png — {heb}')

    # ── Write back ────────────────────────────────────────────────────────────
    with open(SIGNS_JSON, 'w', encoding='utf-8') as f:
        json.dump(signs, f, ensure_ascii=False, indent=2)

    total_row = len([s for s in signs if s.get('topic_id') == 'right_of_way'])
    print(f'\nDone. Total signs in JSON: {len(signs)}  (ROW signs: {total_row})')


if __name__ == '__main__':
    main()
