# מדריך EAS Build — בניית APK/AAB לגוגל פליי
# שלב-אחר-שלב למי שלא מכיר EAS

---

## 🤔 מה זה EAS ומה זה AAB?

**EAS (Expo Application Services)** = שירות של Expo שבונה את האפליקציה שלך בענן.
במקום לבנות על המחשב שלך (מה שדורש התקנות מורכבות של Android Studio, Java וכו'), EAS עושה את זה בשרתים שלהם — אתה שולח את הקוד, הם מחזירים קובץ מוכן.

**AAB (Android App Bundle)** = הפורמט החדש של גוגל לאפליקציות. כמו ZIP חכם שגוגל פותח ומתאים לכל מכשיר. **גוגל פליי דורש AAB (לא APK) מאז 2021.**

**APK** = הפורמט הישן. אפשר לשלוח לחברים ישירות, אבל **לא לגוגל פליי**.

---

## ✅ מה כבר מוכן בפרויקט שלך

| פריט | מצב |
|------|-----|
| `eas.json` עם profile "production" | ✅ קיים |
| `app.json` עם package name | ✅ `com.drivingtheory.ethiopian` |
| `app.json` עם version | ✅ `1.0.0` |
| `app.json` עם versionCode | ✅ `1` |
| EAS Project ID | ✅ `4d5606eb-766a-4aa6-9615-d6943d567037` |
| AdMob Plugin | ✅ מוגדר |

---

## 📋 תנאי מוקדם — לפני שמריצים EAS Build

### 1. חשבון Expo
אם אין לך חשבון Expo — צור אחד בחינם:
1. לך ל-expo.dev
2. לחץ "Sign Up"
3. אשר את האימייל

### 2. חשבון Google Play Console
נדרש לפרסום (לא לבנייה):
- עולה **25 דולר** חד-פעמי
- כתובת: play.google.com/console

---

## 🔧 הגדרת eas.json — מה שיש לך כבר

```json
{
  "cli": {
    "version": ">= 20.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

**הסבר:**
- `production` = הגדרות לגרסת גוגל פליי
- `autoIncrement: true` = EAS יגדיל את versionCode אוטומטית בכל build (1 → 2 → 3...)
- `appVersionSource: "remote"` = הגרסה מנוהלת ב-Expo Cloud

---

## 🚀 הוראות הרצה — שלב אחר שלב

### שלב 1: פתח טרמינל (Command Prompt)

לחץ על **Start** → הקלד **cmd** → לחץ Enter

---

### שלב 2: עבור לתיקיית הפרויקט

```
cd C:\Users\Yakov\Desktop\driving-theory-app
```
לחץ Enter

---

### שלב 3: התחבר לחשבון Expo שלך

```
npx eas-cli login
```
לחץ Enter

המחשב ישאל:
```
Email: [הקלד את האימייל שלך]
Password: [הקלד את הסיסמה שלך]
```
(הסיסמה לא תיראה בזמן הקלדה — זה תקין)

---

### שלב 4: בדוק שהחיבור עבד

```
npx eas-cli whoami
```
לחץ Enter

אמור לראות את שם המשתמש שלך. אם כן — המשך.

---

### שלב 5: הרץ את ה-Build

```
npx eas-cli build --platform android --profile production
```
לחץ Enter

**מה יקרה:**
- EAS ישאל כמה שאלות (ראה שלבי תשובות למטה)
- הוא יעלה את הקוד לשרתים שלו
- תקבל קישור לעקוב אחרי הבנייה
- הבנייה לוקחת **10–20 דקות**

---

### שאלות שיופיעו במהלך ה-Build וכיצד לענות:

**שאלה 1:**
```
? Would you like to automatically create an EAS project...? (Y/n)
```
→ הקלד **Y** ולחץ Enter

**שאלה 2:**
```
? Generate a new Android Keystore? (Y/n)
```
→ הקלד **Y** ולחץ Enter

> ⚠️ **חשוב מאוד:** EAS ייצור Keystore (מפתח חתימה) ויישמור אותו בענן שלהם.
> **אל תאבד גישה לחשבון Expo שלך** — בלי המפתח הזה לא תוכל לעדכן את האפליקציה בעתיד.

**שאלה 3 (אם תופיע):**
```
? Do you want to set Android build number? (Y/n)
```
→ הקלד **N** ולחץ Enter (autoIncrement מטפל בזה)

---

### שלב 6: עקוב אחרי הבנייה

לאחר ההרצה תקבל הודעה כזו:
```
✔ Build queued
Build details: https://expo.dev/accounts/[שם-משתמש]/projects/driving-theory-app/builds/[id]
```

- פתח את הקישור בדפדפן
- תראה את התקדמות הבנייה בזמן אמת
- כשיסיים — תוצג כפתור **"Download"**

---

### שלב 7: הורד את ה-AAB

- לחץ **"Download"** בדף הבנייה
- שמור את הקובץ (שם: משהו כמו `driving-theory-app-production.aab`)
- הקובץ הזה הוא מה שמעלים לגוגל פליי

---

## 📤 איך מעלים AAB לגוגל פליי

### שלב א: פתח Google Play Console
1. לך ל-play.google.com/console
2. היכנס עם חשבון Google שלך

### שלב ב: צור אפליקציה חדשה
1. לחץ **"Create app"**
2. App name: `መንጃ ፍቃድ በቀላል መንገድ`
3. Default language: **Amharic (am)** — או English אם אין Amharic
4. App or game: **App**
5. Free or paid: **Free**
6. אשר את ההצהרות ולחץ **"Create app"**

### שלב ג: העלה את ה-AAB
1. מצד שמאל לחץ: **Release → Production**
2. לחץ **"Create new release"**
3. לחץ **"Upload"** והעלה את קובץ ה-AAB
4. הוסף "Release notes" (מה חדש בגרסה זו):
   ```
   First release — initial version
   ```
5. לחץ **"Save"** ואחר כך **"Review release"**

### שלב ד: השלם את פרטי החנות
לפני שגוגל מאשר, תצטרך למלא:
- ✅ App description (מ-`docs/store-listing.md`)
- ✅ Screenshots (מ-`docs/screenshots-guide.md`)
- ✅ Content rating (מ-`docs/content-rating-answers.md`)
- ✅ Data safety (מ-`docs/data-safety-answers.md`)
- ✅ Privacy policy URL
- ✅ App category

---

## ⏱️ כמה זמן לוקח אישור גוגל?

- בפעם הראשונה: **3–7 ימי עסקים** (גוגל בודקת הכל)
- עדכונים עתידיים: **2–24 שעות**

---

## 🆘 שגיאות נפוצות ופתרונות

| שגיאה | פתרון |
|-------|-------|
| `Not logged in` | הרץ שוב `npx eas-cli login` |
| `Invalid project ID` | ודא שה-`projectId` ב-`app.json` נכון |
| `Build failed: Keystore` | לחץ "Retry" — לפעמים זה עובד בניסיון שני |
| `Package name already taken` | ה-package שלך ייחודי, לא אמור לקרות |
| `AdMob module not found` | ודא שהפלאגין ב-`app.json` תקין ✅ (כבר עשינו) |

---

## 💡 טיפ — Development Build לבדיקת AdMob

אם רוצה לבדוק שה-AdMob עובד **לפני** העלאה לגוגל פליי, הרץ:

```
npx eas-cli build --platform android --profile preview
```

זה יבנה APK (לא AAB) שאפשר להתקין ישירות על מכשיר אנדרואיד לבדיקה.
