# Google Play — Data Safety Form Answers
# מענה לטופס "Data Safety" של גוגל פליי

---

## 📌 הסבר כללי (קרא לפני מילוי הטופס)

טופס Data Safety נמצא ב-Google Play Console תחת:
**Policy → App content → Data safety**

מלא את השדות **בדיוק** לפי התשובות כאן. גוגל בודקת שהפרטים מדויקים.

---

## SECTION 1 — Data Collection and Security

### ❓ Does your app collect or share any of the required user data types?
**✅ YES**

*(האפליקציה משתמשת ב-AdMob שאוסף נתונים, ולכן חייבים לסמן "Yes")*

---

### ❓ Is all of the user data collected by your app encrypted in transit?
**✅ YES**

*כל התקשורת מבוצעת דרך HTTPS/TLS.*

---

### ❓ Do you provide a way for users to request that their data is deleted?
**✅ YES**

*פירוט שאפשר להכניס בשדה:*
```
Users can delete all locally stored data by uninstalling the app.
To request deletion of any server-side anonymous data, users can
email moti.marva@gmail.com.
```

---

## SECTION 2 — Data Types

### בטבלה — סמן את הסוגים הבאים:

---

### 📍 Location
| שדה | תשובה |
|-----|-------|
| Approximate location | **✅ YES** (נאסף על ידי AdMob בלבד) |
| Precise location | **❌ NO** |

**עבור Approximate location:**
- Collected: ✅ Yes
- Shared with third parties: ✅ Yes (Google AdMob)
- Purpose: **Advertising or marketing**
- Required (user can't opt out): ✅ Yes (חלק מ-AdMob)
- Encrypted in transit: ✅ Yes
- Deleted on request: ✅ Yes (via Ad ID reset)

---

### 🆔 Personal Info
| שדה | תשובה |
|-----|-------|
| Name | ❌ NO |
| Email address | ❌ NO |
| User IDs | ✅ YES (Anonymous ID בלבד) |
| Address | ❌ NO |
| Phone number | ❌ NO |
| Race and ethnicity | ❌ NO |
| Political or religious beliefs | ❌ NO |
| Sexual orientation | ❌ NO |
| Other personal info | ❌ NO |

**עבור User IDs:**
- Collected: ✅ Yes
- Shared with third parties: ❌ No
- Purpose: **App functionality** (שמירת התקדמות)
- Required: ✅ Yes
- Encrypted: ✅ Yes
- Deleted on request: ✅ Yes (uninstall or email)

---

### 💰 Financial Info
**❌ NO** — האפליקציה חינמית, ללא רכישות בתוך האפליקציה.

---

### 🏥 Health and Fitness
**❌ NO**

---

### 📩 Messages
**❌ NO**

---

### 🖼️ Photos and Videos
**❌ NO**

---

### 🎵 Audio Files
| שדה | תשובה |
|-----|-------|
| Voice or sound recordings | ✅ YES (כשמשתמש מקליט תשובה קולית) |
| Music files | ❌ NO |
| Other audio files | ❌ NO |

**עבור Voice recordings:**
- Collected: ✅ Yes (זמנית בלבד, לא נשמר)
- Shared with third parties: ✅ Yes (Google Cloud Speech-to-Text לזיהוי)
- Purpose: **App functionality** (זיהוי תשובה קולית)
- Required: ❌ No (המשתמש יכול לסרב לפרמיסיה)
- Encrypted: ✅ Yes
- Deleted on request: ✅ Yes (לא נשמר בכלל)

---

### 📱 App Activity
| שדה | תשובה |
|-----|-------|
| App interactions | ✅ YES |
| In-app search history | ❌ NO |
| Installed apps | ❌ NO |
| Other user-generated content | ❌ NO |
| Other actions | ❌ NO |

**עבור App interactions:**
- Collected: ✅ Yes (ניקוד פרטים, שאלות שנענו)
- Shared with third parties: ❌ No
- Purpose: **App functionality** (מעקב התקדמות)
- Required: ✅ Yes
- Encrypted: ✅ Yes
- Deleted on request: ✅ Yes

---

### 📊 App Info and Performance
| שדה | תשובה |
|-----|-------|
| Crash logs | ✅ YES |
| Diagnostics | ✅ YES |
| Other app performance data | ❌ NO |

**עבור Crash logs / Diagnostics:**
- Collected: ✅ Yes
- Shared with third parties: ✅ Yes (Expo/React Native crash reporting)
- Purpose: **Analytics, App functionality**
- Required: ✅ Yes
- Encrypted: ✅ Yes
- Deleted on request: ✅ Yes

---

### 🆔 Device or Other IDs
| שדה | תשובה |
|-----|-------|
| Device or other IDs | ✅ YES (Advertising ID — AdMob) |

**עבור Device or other IDs:**
- Collected: ✅ Yes
- Shared with third parties: ✅ Yes (Google AdMob)
- Purpose: **Advertising or marketing**
- Required: ✅ Yes (חלק מ-AdMob)
- Encrypted: ✅ Yes
- Deleted on request: ✅ Yes (via Ad ID reset in device settings)

---

## SECTION 3 — Sharing with Third Parties

### טבלת שיתוף עם צד שלישי:

| נתון | נשתף עם | מטרה |
|------|---------|------|
| Approximate location | Google AdMob | Advertising |
| Device/Ad ID | Google AdMob | Advertising |
| Voice recording | Google Cloud Speech-to-Text | App functionality |
| Crash logs | Expo (Sentry) | App functionality |

---

## SECTION 4 — Security Practices

| שאלה | תשובה |
|------|-------|
| Is data encrypted in transit? | ✅ YES |
| Do you follow the Families Policy? | ❌ NO (app not for children under 13) |
| Does the app use data for tracking? | ✅ YES (AdMob uses Ad ID for tracking) |

---

## 📝 טקסט מוכן לשדה "Safety section summary" (אופציונלי)

```
This app collects only an anonymous user ID to save learning progress.
No personal information (name, email, phone) is ever collected or required.
Advertisements are served by Google AdMob, which may use the device
Advertising ID for ad personalization. Microphone is used only for
optional voice-answer feature; audio is processed by Google Speech-to-Text
and never stored. All data is encrypted in transit.
```

---

## ⚠️ הערות חשובות

1. **AdMob** — גוגל תדע אוטומטית שאתה משתמש ב-AdMob (כי הם הבעלים). אם לא תצהיר עליו, הם יסמנו אותך. **חייב לסמן את שדות ה-AdMob.**

2. **Advertising ID** — זה ה-ID שאנדרואיד נותן לכל מכשיר לצרכי פרסום. AdMob משתמש בו. המשתמש יכול לאפס אותו בהגדרות המכשיר.

3. **Anonymous User ID** — ה-ID שאנחנו מייצרים (מחרוזת אקראית) — זה **לא** Advertising ID. הוא ל-App functionality בלבד.

4. **Voice Recording** — חשוב לציין שזה **לא נשמר** על ידינו. Google STT מקבל, מעבד, ומחזיר תוצאה — ללא שמירה.
