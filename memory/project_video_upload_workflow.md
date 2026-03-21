# תהליך העלאת סרטון לתמרור — תיעוד מלא

## מה עשינו (תמרור 302)
- הוספנו כפתור ▶️ שפותח סרטון במסך מלא
- הסרטון עלה ל-Supabase Storage
- כפתור מופיע רק לתמרורים שיש להם `video_url` — שאר התמרורים לא מושפעים

---

## שלבי העבודה

### 1. הוספת עמודה ל-DB
בסופרבייס SQL Editor:
```sql
ALTER TABLE signs ADD COLUMN IF NOT EXISTS video_url TEXT;
```

### 2. העלאת הסרטון ל-Supabase Storage
```bash
node --env-file=.env scripts/uploadSignVideo.mjs --sign-id ROW_JUNCTION_YIELD --file "C:/Users/Yakov/Desktop/סרטון תמרור עצור ותן זכות קדימה.mp4" --storage-name sign_302_intro.mp4
```

### 3. קבצים שנוצרו/שונו
- `components/shared/VideoModal.tsx` — נגן וידאו במסך מלא (Modal)
- `components/engineB/SignTextDetail.tsx` — כפתור ▶️ + VideoModal
- `app/(engineA)/sign/[id].tsx` — כפתור ▶️ עגול + VideoModal

---

## שגיאות שצצו ופתרונות

### שגיאה 1: Cannot find module 'react-native-worklets/plugin'
**סיבה:** `react-native-reanimated` v4.1.1 הותקן אבל החבילה `react-native-worklets` לא הותקנה.
`babel.config.js` כלל את הפלאגין `react-native-reanimated/plugin` שהפעיל את הבעיה בעת re-bundle.
**פתרון:**
1. הסרת הפלאגין מ-`babel.config.js` (האפליקציה לא משתמשת ב-reanimated כלל)
2. הסרת החבילה:
```bash
npm uninstall react-native-reanimated react-native-worklets-core --legacy-peer-deps
```
> ⚠️ חובה להוסיף `--legacy-peer-deps` כי npm מתלונן על conflict בין peer dependencies

### שגיאה 2: View config not found for component `RCTVideo`
**סיבה:** `react-native-video` הוא Native Module — לא עובד ב-Expo Go ללא custom dev client build.
**פתרון:** החלפת `react-native-video` ב-`expo-av` שעובד ב-Expo Go ללא שינויים נוספים.

```tsx
// ❌ לא עובד ב-Expo Go:
import Video from 'react-native-video';

// ✅ עובד ב-Expo Go:
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
```

---

## babel.config.js הנכון (אחרי התיקון)
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```
> ⛔ אל תוסיף חזרה את `react-native-reanimated/plugin` — האפליקציה לא צריכה אותו

---

## הוספת סרטון לתמרור חדש בעתיד
1. הכנס את שם קובץ הסרטון + sign_id
2. הרץ:
```bash
node --env-file=.env scripts/uploadSignVideo.mjs --sign-id <SIGN_ID> --file "<נתיב לקובץ>" --storage-name sign_<מספר>_intro.mp4
```
3. הכפתור יופיע אוטומטית — אין צורך לשנות קוד נוסף
