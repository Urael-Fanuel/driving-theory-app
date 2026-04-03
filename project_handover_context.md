# Project Handover Context — Ethiopian Driving Theory App
> מסמך תיעוד מקיף לשימוש בשיחות עתידיות

**תאריך עדכון אחרון:** 3 באפריל 2026
**סטטוס פרויקט:** יציב, מוכן לייצור (4/6 נושאים הושלמו)

---

## 1. מהות האפליקציה

### תיאור כללי
אפליקציה ל-React Native (Expo) עבור עולים חדשים מאתיופיה בישראל ללמידת תיאוריה ישראלית לנהיגה. התוכן הוא **באמהרית** (שפת אתיופיה) עם מטה-דאטה בעברית. האפליקציה מכסה 60 תמרורי דרך ב-4 נושאים, עם 180 שאלות (3 לכל תמרור).

### שני מנועי למידה
- **Engine A — מנגנון לא-קוראים (קוליים):** ללא טקסט. הכל אודיו + תמונות. השאלות נקראות בקול, המשתמש בוחר תשובה על ידי אמירת מספר (1-4) בקול. מיועד לאנשים שאינם יודעים לקרוא.
- **Engine B — מנגנון קוראים (טקסט):** תוכן באמהרית מוצג כטקסט. המשתמש לוחץ על תשובה. מיועד לאנשים שיודעים לקרוא אמהרית.

### לוגיקה ייחודית חשובה
- כל תוכן הנלמד מגיע מ-`content/signs.json` — קובץ JSON מקומי המכיל את כל 60 התמרורים עם הסברים ושאלות
- שאלות המבחן מגיעות מ-Supabase (עם fallback ל-mock data אם אין חיבור)
- מנגנון ה-offline: האודיו נשמר ב-cache מקומי (expo-file-system), 35 קבצים מקסימום (FIFO eviction)
- כאשר האינטרנט מנותק ב-Engine A: הסיקוונס ממשיך עד שהאודיו שב-cache נגמר, ואז נעצר (לא מנסה להשמיע מהאינטרנט)
- כאשר האינטרנט חוזר: הסיקוונס מתחיל מחדש מהשאלה (לא מהאמצע)

---

## 2. ארכיטקטורה וטכנולוגיות

### Stack טכנולוגי

| רכיב | גרסה | הערות |
|------|-------|-------|
| React Native | 0.74+ | |
| Expo | ~51 | Router: ~3.5 |
| TypeScript | ^5.3.0 | |
| Supabase | ^2.x | PostgreSQL + Storage (CDN) |
| expo-av | ~14.x | אודיו ווידאו (לא react-native-video!) |
| expo-file-system | ~17.x | cache מקומי + persistence |
| expo-router | ~3.5 | file-based routing |
| react-native-video | ❌ | לא בשימוש — לא תואם Expo Go |

### מבנה קבצים מלא
```
app/
  index.tsx                    ← onboarding (בחירת מנוע)
  (engineA)/                   ← Non-reader engine
    home.tsx
    topic/[id].tsx
    sign/[id].tsx
    question/[id].tsx
    exam.tsx                   ← ⭐ הקובץ המורכב ביותר
    progress.tsx
  (engineB)/                   ← Reader engine
    home.tsx
    topic/[id].tsx
    sign/[id].tsx
    question/[id].tsx
    exam.tsx
    progress.tsx
  result/[sessionId].tsx       ← תוצאות מבחן (משותף לשני מנועים)

components/
  shared/                      ← VideoModal, שיתופי
  engineA/                     ← קומפוננטות ל-Engine A
  engineB/                     ← קומפוננטות ל-Engine B

hooks/
  useExam.ts                   ← מנוע המבחן (state machine)
  useAudio.ts                  ← ניהול אודיו (singleton)
  useNetworkStatus.ts          ← זיהוי חיבור אינטרנט (poll 300ms)
  useVoiceRecognition.ts       ← זיהוי קול (Google STT)
  useProgress.ts               ← מעקב התקדמות

contexts/
  EngineContext.tsx             ← state גלובלי (engineType, userId)

services/
  audioCache.ts                ← cache אודיו מקומי (FIFO, 35 קבצים)
  speechRecognition.ts         ← Google Cloud Speech-to-Text

backend/
  schema.sql                   ← DDL של מסד הנתונים
  api.ts                       ← כל ה-data access (+ mock fallback)
  supabaseClient.ts            ← אתחול Supabase
  mockData.ts                  ← נתוני fallback לפיתוח ללא Supabase

content/
  signs.json                   ← 60 תמרורים + 180 שאלות (הכל)
  topics.json                  ← 4 נושאים

scripts/                       ← סקריפטים לניהול תוכן (ראה סעיף 5)
assets/
  images/                      ← תמונות תמרורים לפי נושא
  audio/                       ← MP3 מקומי (fallback)

constants/
  colors.ts, typography.ts, strings.ts
```

### ניהול State (State Management)
- **אין Redux/Zustand** — State מקומי ב-hooks + Context
- `EngineContext` — engineType + userId (persisted via FileSystem)
- `useExam` — כל state של המבחן (state machine)
- `useProgress` — topicsProgress (נטען מ-Supabase + FileSystem)
- אין AsyncStorage — הכל דרך `expo-file-system` לpersistence

### סכמת מסד נתונים

```sql
-- נושאים
topics (id, name_amharic, name_hebrew, icon, color, audio_intro_url, description_amharic, display_order)

-- תמרורים
signs (id, topic_id, name_amharic, explanation_amharic, image_url, video_url,
       audio_name_url, audio_explanation_url, order)

-- שאלות (answers הוא JSONB עם 4 תשובות)
questions (id, sign_id, question_amharic, question_audio_url,
           answers JSONB,
           explanation_correct_amharic, explanation_wrong_amharic,
           explanation_correct_audio_url, explanation_wrong_audio_url)

-- משתמשים
users (id UUID, engine_type TEXT, created_at, last_seen)

-- התקדמות
user_progress (user_id, question_id, correct_count, attempt_count, last_attempted)

-- היסטוריית מבחנים
exam_sessions (id, user_id, score, total, duration_seconds, topic_breakdown JSONB, created_at)

-- צפיות בסרטונים (Engine A)
sign_views (user_id, sign_id, viewed_at)
```

**Stored Procedures:**
- `get_random_questions(p_limit)` — 30 שאלות אקראיות מאוזנות לפי נושא
- `upsert_user_progress` — עדכון כמות נכונות/ניסיונות
- `upsert_sign_view` — תיעוד צפייה בסרטון

---

## 3. לוגיקה עסקית מרכזית

### מנגנון האודיו (CRITICAL — אל תשנה!)

#### Singleton Pattern
```typescript
// hooks/useAudio.ts — module-level (לא בתוך component)
let _sound: Audio.Sound | null = null;
let _soundId = 0; // גדל בכל stop() — מנגנון ביטול
```

#### playAndAwaitAudio — הפונקציה הקריטית
```typescript
// ✅ השימוש הנכון לסיקוונס אודיו
await playAndAwaitAudio(question_url, () => cancelled);
await playAndAwaitAudio(number_1_url, () => cancelled);
await playAndAwaitAudio(answer_A_url, () => cancelled);

// ❌ אסור! resolves לפני הסוף אם אודיו אחר נכשל
await playAudio(url);
await waitForAudioEnd();
```

`playAndAwaitAudio` לוכדת את ה-`_soundId` הייחודי לאינסטנס הנוכחי ומחזירה Promise שמסתיים **רק** כשהאודיו הזה ספציפית מסתיים.

#### סיקוונס ב-Engine A (exam.tsx)
```
1. נגן שאלה (question_audio_url)
2. המתן 1 שניה
3. בדק isConnectedRef — אם לא מחובר: עצור כאן (CRITICAL FIX)
4. לולאה על 4 תשובות:
   a. נגן מספר (number_1.mp3 / number_2.mp3 / ...)
   b. נגן תוכן תשובה (answer_X_audio_url)
5. המתן לבחירת משתמש
6. נגן explanation (correct/wrong)
7. עבור לשאלה הבאה
```

#### ביטול סיקוונס
```typescript
// ביטול מיידי (synchronous) — לפני עצירת native audio
sequenceCancelledRef.current = true;
stopAudio(); // fire-and-forget — לא await!
setAudioRestartKey(k => k + 1); // מפעיל מחדש את הסיקוונס
```

**⚠️ אסור לעשות `await stopAudio()`** לפני `setAudioRestartKey` — גורם לעיכוב ומחזיר את כל הבאגים.

### מנגנון Offline ב-Engine A

#### זיהוי חיבור
- `useNetworkStatus` מבצע poll כל 300ms
- `isInternetReachable !== false` (לא `!!isInternetReachable`) — מתייחס ל-null כ"מחובר" לזיהוי מהיר יותר
- `isConnectedRef` — ref שמשקף את `isConnected` לגישה סינכרונית מתוך async runSequence

#### Overlay חוסם
מוצג **רק** כאשר: `!isConnected && !currentQuestionAudioReady && phase === 'question'`
- כלומר: מנותק + אודיו השאלה לא ב-cache + בשלב שאלה (לא feedback)

#### Reconnect Handler
```typescript
useEffect(() => {
  const wasConnected = prevConnectedRef.current;
  prevConnectedRef.current = isConnected;
  if (!wasConnected && isConnected && questions.length > 0) {
    sequenceCancelledRef.current = true;
    stopAudio();
    // prefetch אודיו לשאלה הנוכחית + 3 הבאות
    questions.slice(currentIndex, currentIndex + 4).forEach(q => prefetchQuestionAudio(q));
    // prefetch תמונות לשאלה הנוכחית (מנע blank image)
    const currentQ = questions[currentIndex];
    if (currentQ) {
      const sign = signs.find(s => s.id === currentQ.sign_id);
      if (sign?.image_url) Image.prefetch(sign.image_url).catch(() => {});
    }
    setAudioRestartKey(k => k + 1);
  }
}, [isConnected]);
```

#### תמונות ב-Reconnect
```tsx
// key={audioRestartKey} חובה! — מבצע remount של Image
// ללא זה React Native נשאר ב-"failed" state ולא מנסה שוב
<Image
  key={audioRestartKey}
  source={{ uri: currentSign.image_url }}
  style={styles.signImage}
  resizeMode="contain"
/>
```

### מנגנון המבחן (useExam.ts)

#### State Machine
```
LOADING → QUESTION → FEEDBACK_CORRECT/WRONG → QUESTION → ... → RESULT
```

#### כללי מבחן
- 30 שאלות, מאוזנות לפי נושאים
- סף מעבר: 24/30 (80%)
- טיימר נמדד ונשמר ל-Supabase
- רק שאלות עם בדיוק 4 תשובות (מסנן פורמט ישן של 3 תשובות)

#### Local Answer Queue
- תשובות נשמרות קודם ב-queue מקומי (FileSystem)
- מועלות ל-Supabase עם retry logic (3 ניסיונות, exponential backoff)
- ב-init: flush של queue מהסשן הקודם
- cache שאלות: LRU, מקסימום 100 entries

### מנגנון זיהוי קול (Engine A)
- **ספק:** Google Cloud Speech-to-Text
- **שפה:** אמהרית
- **זיהוי שקט:** עצירת הקלטה 600ms אחרי שמזוהה שקט (pragmatic, הרבה יותר מהיר מ-timeout קשוח)
- **מיפוי:** "አንድ"→0, "ሁለት"→1, "ሶስት"→2, "አራት"→3

**⚠️ תיקונים קריטיים ב-STT (אסור לשנות):**
```typescript
// ✅ import: expo-file-system/legacy (לא plain expo-file-system)
import * as FileSystem from 'expo-file-system/legacy';
// ✅ encoding: literal string (לא FileSystem.EncodingType.Base64 — undefined)
const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
// ✅ פורמט לפי פלטפורמה
// Android: AMR_WB → 'AMR_WB'
// iOS: LINEARPCM → 'LINEAR16'
```

---

## 4. הגדרות Google Play וסטטוס פיתוח

### מה הושלם
- ✅ כל ארכיטקטורת האפליקציה + routing
- ✅ UI של שני המנועים (A + B) — כל המסכים
- ✅ useExam hook (state machine מלא)
- ✅ useProgress hook (topicsProgress מיושם)
- ✅ useAudio hook (expo-av wrapper)
- ✅ Supabase backend — schema + api.ts
- ✅ content/signs.json + topics.json (תוכן מלא)
- ✅ Mock data system לפיתוח ללא Supabase
- ✅ 1,234 קובצי אודיו באמהרית — הועלו ל-Supabase Storage
- ✅ 60 סרטוני MP4 לתמרורים — הועלו
- ✅ 53/60 תמונות תמרורים — אמיתיות מ-PDF משרד התחבורה (2022)
- ✅ זיהוי קול (STT) עם silence detection (600ms)
- ✅ מצב offline מלא ל-Engine A
- ✅ 4 נושאים עם תוכן מלא (regulatory, warning, right_of_way, prohibitions)

### מה חסר / לא הושלם
1. `sign_telephone.png` — placeholder, לא קיים ב-PDF משרד התחבורה 2022
2. 7 תמרורי בטיחות — placeholder בצבע (לא תמרורי דרך רשמיים)
3. האפליקציה לא נבדקה end-to-end על device/simulator
4. Google Play Store — לא הוגשה עדיין

### Google Play — דרישות שהוכנו
- מגדיר target audience: Ethiopian immigrants in Israel
- שפת תוכן: Amharic
- קטגוריה: Education
- **סטטוס:** טרם הוגשה לחנות

---

## 5. היסטוריית תקלות והחלטות מרכזיות

### תקלות שנפתרו (לא לחזור עליהן)

#### 1. אודיו חופף / נשמע אחד על גבי השני
**בעיה:** שתי קריאות `playAudio()` רצו בו זמנית
**פתרון:** החלפה ל-singleton pattern + `playAndAwaitAudio()` שמחכה לסיום לפני ניגון הבא
**לקח:** **תמיד להשתמש ב-`playAndAwaitAudio()` לכל סיקוונס** — לעולם לא `playAudio() + waitForAudioEnd()`

#### 2. "አndk" (אנד) נשמע מיד עם חזרת אינטרנט
**בעיה:** הסיקוונס המשיך לרוץ גם כשמנותק. כשהאינטרנט חזר, היה כבר בשלב NUMBER_URLS[0] → "አndk" הושמע מיד
**פתרון:** `if (!isConnectedRef.current) return;` אחרי ה-1s pause, לפני לולאת התשובות
**לקח:** הסיקוונס לעולם לא צריך להגיע ל-NUMBER_URLS בזמן שה-device מנותק

#### 3. `await stopAudio()` לפני restart גרם לרגרסיה מלאה
**בעיה:** `stopAudio().then(() => setAudioRestartKey(...))` — גרם לעיכוב + כל הבאגים חזרו
**פתרון:** fire-and-forget: `stopAudio()` ואז מיד `setAudioRestartKey(k => k + 1)`
**לקח:** אסור לעשות await על stopAudio לפני restart

#### 4. תמונות ריקות ב-reconnect שני ואילך
**בעיה:** הסרת `key={audioRestartKey}` מ-Image גרמה ל-React Native לשמור ב-cache את ה-"failed" state
**פתרון:** החזרת `key={audioRestartKey}` + `Image.prefetch()` לפני ה-restart
**לקח:** React Native Image לא מנסה שוב URL שנכשל ללא remount

#### 5. עיכוב ארוך לפני תחילת אודיו אחרי reconnect
**בעיה:** poll interval של 5000ms → זמן זיהוי ממוצע 2.5 שניות
**פתרון:** שינוי ל-300ms + `isInternetReachable !== false` (null = מחובר)
**לקח:** תמיד להשתמש בinterval קצר לזיהוי network

#### 6. אודיו מפסיק בעת כניסה למצב טיסה
**בעיה:** הוספנו `if (!isConnected) { stopAudio(); }` — עצר אודיו שהיה ב-cache
**פתרון:** הוצאנו אותו מיד. הסיקוונס צריך להמשיך לרוץ עם cache
**לקח:** אסור לעצור סיקוונס בניתוק — רק ב-reconnect

#### 7. שאלות שגויות לתמרורים דומים (418-425)
**בעיה:** Gemini התבלבל בין תמרורי "סוף הגבלה" (עיגולים אפורים דומים)
**פתרון:** שימוש ב-`updateSignFromMoT.mjs` עם `--mot-image NONE.jpg` + ניקוי `name_amharic` + `explanation_amharic` לפני הרצה
**סטטוס:** 419, 424, 425 עדיין ממתינים לתיקון

#### 8. STT לא עבד
**בעיות:**
- `expo-file-system` במקום `expo-file-system/legacy` — כשל שקט
- `FileSystem.EncodingType.Base64` = undefined → שגיאת encoding
- פורמט הקלטה לא תואם לפלטפורמה
**פתרון:** שלושת התיקונים המתועדים בסעיף 3
**לקח:** אסור לשנות את קוד ה-STT

#### 9. קבצי NUMBER_URLS נמחקו בטעות
**בעיה:** כשנמחקו number_1.mp3...number_4.mp3 מ-Supabase, `playAndAwaitAudio` קיבל 404 ו-resolved מיידית → תשובות נשמעו ללא מספרים
**פתרון:** `node scripts/generateNumbers1to4.mjs` — מייצר ומעלה מחדש
**לקח:** הקבצים האלה **לא** חלק מ-generateAllAudio.ts — סקריפט נפרד

#### 10. Upsert לא מוחק שאלות ישנות
**בעיה:** upsert שומר שאלות ישנות לצד חדשות → כפל שאלות ב-DB
**פתרון:** תמיד `deleteOldQuestions.mjs` לפני `uploadNewAudio.mjs`
**לקח:** תמיד למחוק לפני upload, לעולם לא להסתמך על upsert בלבד

#### 11. שאלות שגויות בגלל match לפי מספר תמרור (לא תמונה)
**בעיה:** משרד התחבורה שינה מספרי תמרורים → match לפי מספר נתן תמרורים שגויים
**פתרון:** match **רק** לפי השוואת תמונות (Gemini vision)
**לקח:** אסור לעולם להשוות תמרורים לפי מספר — רק תמונות

#### 12. ריבוי קידומות בתרגומים
**בעיה:** ריצות חוזרות של סקריפטים הוסיפו קידומות כפולות ("ትክክለኛ ትክክለኛ...")
**פתרון:** ה-regex ב-addPrefixesAndShuffle.mjs מנקה 7 קידומות לפני הוספה חדשה
**לקח:** אסור לכתוב סקריפט ידני נפרד להוספת קידומות — רק דרך updateSignFromMoT.mjs

### החלטות ארכיטקטוניות מרכזיות

| החלטה | הסיבה |
|-------|-------|
| expo-av ולא react-native-video | react-native-video לא תואם Expo Go — RCTVideo not found |
| expo-file-system ולא AsyncStorage | ביצועים טובים יותר לקבצים, cache מובנה |
| Singleton audio pattern | מניעת חפיפת אודיו — רק קול אחד בו זמנית |
| playAndAwaitAudio בלבד לסיקוונסים | waitForAudioEnd() resolves לפני הזמן אם אודיו אחר נכשל |
| isInternetReachable !== false | null מתייחס כ"מחובר" — זיהוי reconnect מהיר יותר |
| poll 300ms לnetwork | איזון בין מהירות זיהוי לצריכת battery |
| FIFO cache 35 קבצים | זיכרון מוגבל — עדיפות לשאלות הנוכחיות והבאות |
| signs.json מקומי | מהירות load + offline support ללא Supabase |
| mock data fallback בapi.ts | פיתוח מלא ללא backend מוגדר |

### כללי אצבע שנקבעו

1. **אסור לגעת בנושאים:** regulatory, warning, right_of_way — לעולם לא לשנות תמרורים/שאלות/אודיו שלהם
2. **⚠️ NO ASSUMPTIONS:** אסור להניח על תוכן — בדוק תחילה (קרא קבצים, שאל DB), ואז שאל אם לא ברור
3. **GitHub timing:** (1) upload → (2) user tests → (3) explicit approval → (4) git push — ללא דילוג
4. **Script scope:** לפני כל סקריפט שמשפיע על נתונים — ציין בדיוק על אילו תמרורים ועד לאישור
5. **Image match only:** השוואת תמרורים תמיד לפי תמונה (Gemini vision), לעולם לא לפי מספר
6. **Gemini 3-step:** identify → validate → translate (לא לתרגם בלי validation)
7. **Delete before upload:** תמיד deleteOldQuestions לפני uploadNewAudio
8. **Clear amharic before rerun:** ניקוי name_amharic + explanation_amharic ב-signs.json לפני ריצה חוזרת
9. **MoT Q&A only:** updateSignFromMoT לעולם לא נוגע ב-name_amharic או explanation_amharic
10. **Terminal instructions:** כל פקודה בצעד ממוספר נפרד, עם "לחץ Enter", ותמיד להתחיל עם `cd C:\Users\Yakov\Desktop\driving-theory-app`

---

## 6. סקריפטים לניהול תוכן

### תהליך מלא להוספת נושא חדש (Template)

```
STEP 0A: deleteOldTopics.mjs           — מחיקת נושאים ישנים מ-DB
STEP 0B: הסרת entries ישנים מ-signs.json
STEP 0C: הוספת נושא חדש ל-topics.json
STEP 0D: addSkeletonSigns.mjs          — skeleton entries ב-signs.json
STEP 0E: addProhibitionsTopic.mjs      — הוספת נושא ל-Supabase
STEP 0F: עדכון addPrefixesAndShuffle.mjs — TOPICS_TO_PROCESS

STEP 1: improveAmharicWithGemini.mjs   — תוכן אמהרית (batches of 10)
STEP 2: addPrefixesAndShuffle.mjs      — קידומות + shuffle תשובות
STEP 3: generateAllAudio.ts            — יצירת MP3
STEP 4: uploadNewAudio.mjs             — העלאה ל-Supabase
```

### תהליך החלפת Q&A עם MoT (לכל תמרור)

```
PRE: geminiMatchMoT.mjs                — זיהוי תמונת MoT תואמת
PRE: ניקוי name_amharic + explanation_amharic ב-signs.json (אם ריצה חוזרת)

1. updateSignFromMoT.mjs --sign-number NNN --mot-image TQ_PIC_XXXX.jpg
2. generateAllAudio.ts
3. deleteOldQuestions.mjs --from=NNN --to=NNN
4. uploadNewAudio.mjs --from=NNN --to=NNN
5. בדיקה ב-app + אישור מפורש + git push
```

### סקריפטים עיקריים

| סקריפט | מה עושה | שימוש |
|---------|---------|-------|
| `improveAmharicWithGemini.mjs` | יוצר תוכן אמהרית מתמונה | `node --env-file=.env scripts/improveAmharicWithGemini.mjs --sign-number 401 --limit 10` |
| `addPrefixesAndShuffle.mjs` | קידומות + shuffle תשובות | `node scripts/addPrefixesAndShuffle.mjs` |
| `generateAllAudio.ts` | MP3 מטקסט (idempotent) | `npx tsx scripts/generateAllAudio.ts` |
| `updateSignFromMoT.mjs` | החלפת Q&A עם שאלות MoT | `node --env-file=.env scripts/updateSignFromMoT.mjs --sign-number 301 --mot-image TQ_PIC_XXXX.jpg` |
| `uploadNewAudio.mjs` | העלאה ל-Supabase + DB update | `node --env-file=.env scripts/uploadNewAudio.mjs --from=401 --to=441` |
| `deleteOldQuestions.mjs` | מחיקת שאלות ישנות מ-DB | `node --env-file=.env scripts/deleteOldQuestions.mjs --from=401 --to=441` |
| `generateNumbers1to4.mjs` | MP3 של מספרים 1-4 (אמהרית) | `node scripts/generateNumbers1to4.mjs` |
| `geminiMatchMoT.mjs` | זיהוי תמונות MoT תואמות | `node --env-file=.env scripts/geminiMatchMoT.mjs` |

### קובצי output
- `scripts/output/gemini_identifications.json` — תוצאות זיהוי תמונות Gemini
- `scripts/output/mot_questions.json` — שאלות מ-MoT

---

## 7. משימות פתוחות

### 🔴 דחוף — תמרורים עם שאלות שגויות
| תמרור | בעיה | פתרון |
|--------|-------|--------|
| 419 | Q&A שגוי (מתבלבל עם "סוף הגבלה") | `updateSignFromMoT.mjs --sign-number 419 --mot-image NONE.jpg` (ניקוי amharic קודם) |
| 424 | Q&A שגוי | אותו תהליך |
| 425 | Q&A שגוי | אותו תהליך |

**הערה:** 418 הוא הנכון — השתמש בו כדוגמה להשוואה

### 🟡 בינוני — תוכן חסר
- `sign_telephone.png` — placeholder, לא קיים ב-PDF רשמי (להשאיר כך)
- 7 תמרורי בטיחות — placeholders בצבע (מכוון — לא תמרורי דרך רשמיים)

### 🟢 עתידי — פיתוח נוסף
- בדיקה end-to-end מלאה על device/simulator
- הגשה ל-Google Play Store
- נושאים נוספים (אם יוחלט להוסיף מעבר ל-4 הקיימים)
- אופטימיזציה של audio prefetching וזמני טעינה

---

## 8. מידע סביבה

### משתני סביבה (.env)
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_TTS_API_KEY=...
GOOGLE_SPEECH_API_KEY=...
GOOGLE_VISION_API_KEY=...  (Gemini)
```

### מיקומי Storage (Supabase)
- תמונות: `images/v4/<filename>.png`
- אודיו: `audio/<filename>.mp3`
- וידאו: `videos/<filename>.mp4`
- cache מקומי: `expo-file-system DocumentDirectory/audio/` (מקסימום 35 קבצים)

### Desktop
- `C:\Users\Yakov\Desktop\pdf-debug-pages\` — 62 קבצי debug של PDF (scan_p08.png...scan_p54.png)
- `C:\Users\Yakov\Desktop\חלק1-תמרורי אזהרה\` — תיקיית crops ידניים של תמרורים

---

## 9. נושאים פעילים — מצב עכשווי

| נושא | מספרי תמרורים | סטטוס |
|-------|--------------|-------|
| regulatory (תמרורי חובה) | 31 תמרורים | ✅ הושלם — ⛔ אסור לגעת |
| warning (תמרורי אזהרה) | 53 תמרורים | ✅ הושלם — ⛔ אסור לגעת |
| right_of_way (זכות קדימה) | 10 תמרורים | ✅ הושלם — ⛔ אסור לגעת |
| prohibitions (איסורים והגבלות) | 401-441 (41 תמרורים) | ✅ הושלם (419, 424, 425 Q&A שגוי) |
