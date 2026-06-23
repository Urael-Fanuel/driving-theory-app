# Google Play — Content Rating (IARC) Questionnaire Answers
# תשובות לשאלון דירוג תוכן IARC

---

## 📌 איפה ממלאים את זה?

ב-Google Play Console תחת:
**Policy → App content → Content rating**

לחץ **"Start questionnaire"** ובחר קטגוריה. ראה הוראות מפורטות למטה.

---

## STEP 1 — Choose Category

כשגוגל שואל "What is the primary category of your app?", בחר:

**✅ Education**

*(לא "Games", לא "Utilities" — Education הוא הנכון לאפליקציית לימוד)*

---

## STEP 2 — Answer All Questions

### 🔫 Violence (אלימות)
| שאלה | תשובה |
|------|-------|
| Does the app contain any violence? | **❌ NO** |
| Does the app contain cartoon/fantasy violence? | **❌ NO** |
| Does the app contain realistic violence? | **❌ NO** |
| Does the app contain graphic violence? | **❌ NO** |

---

### 🔞 Sexual Content (תוכן מיני)
| שאלה | תשובה |
|------|-------|
| Does the app contain any sexual content? | **❌ NO** |
| Does the app contain nudity? | **❌ NO** |
| Does the app contain suggestive content? | **❌ NO** |

---

### 💊 Controlled Substances (סמים/אלכוהול)
| שאלה | תשובה |
|------|-------|
| Does the app reference drugs, alcohol, or tobacco? | **❌ NO** |

*(למרות שהאפליקציה מכסה נהיגה בשכרות כנושא בטיחות — זה "road safety education", לא הפניה לשימוש)*

---

### 🎰 Gambling (הימורים)
| שאלה | תשובה |
|------|-------|
| Does the app contain gambling or simulated gambling? | **❌ NO** |
| Does the app contain casino games? | **❌ NO** |

---

### 💬 Language (שפה פוגענית)
| שאלה | תשובה |
|------|-------|
| Does the app contain profanity or crude humor? | **❌ NO** |

---

### 👤 User Interaction (אינטראקציה בין משתמשים)
| שאלה | תשובה |
|------|-------|
| Does the app allow users to interact with each other? | **❌ NO** |
| Does the app include user-generated content? | **❌ NO** |
| Does the app include social features? | **❌ NO** |
| Does the app include chat or messaging? | **❌ NO** |

*(האפליקציה היא standalone — אין קהילה, אין פורום, אין צ'אט)*

---

### 📍 Location Sharing
| שאלה | תשובה |
|------|-------|
| Does the app share the user's location with other users? | **❌ NO** |

---

### 💳 In-App Purchases
| שאלה | תשובה |
|------|-------|
| Does the app contain in-app purchases? | **❌ NO** |
| Does the app contain digital goods for purchase? | **❌ NO** |

*(האפליקציה חינמית לחלוטין — אין רכישות)*

---

### 📢 Advertising
| שאלה | תשובה |
|------|-------|
| Does the app show ads? | **✅ YES** |
| Are the ads from a third-party ad network? | **✅ YES** (Google AdMob) |

---

## STEP 3 — Expected Rating Result

לאחר מילוי השאלון, הדירוג הצפוי הוא:

| מערכת דירוג | דירוג צפוי | משמעות |
|-------------|-----------|--------|
| **IARC / Google Play** | **Everyone (E) / Everyone 10+** | מתאים לכולם (או 10+) |
| **PEGI (אירופה)** | **PEGI 3** | מתאים לגיל 3+ |
| **ESRB (ארה"ב)** | **Everyone (E)** | מתאים לכולם |
| **USK (גרמניה)** | **USK 0** | ללא הגבלת גיל |
| **ClassInd (ברזיל)** | **L (Livre)** | חופשי לכולם |

> **הערה:** גיל היעד שלנו הוא 16+ (גיל לימוד תיאוריה) — אבל מבחינת **תוכן**, האפליקציה מתאימה לכולם. הדירוג משקף את התוכן, לא את גיל הנהיגה.

---

## ⚠️ שאלה מיוחדת — האם האפליקציה מיועדת לילדים?

כשגוגל שואל **"Is this app designed for children?"**:

**✅ NO — This app is not designed for children.**

*פירוט שניתן להוסיף:*
```
This educational app is designed for users aged 16 and above
who are preparing for a driving theory examination.
It is not targeted at children under 13.
```

---

## 📝 סיכום — מה לכתוב בשדה "App Description for Rating"

```
Educational app for learning driving theory and traffic signs.
Content is based on international road sign standards (Vienna Convention).
No violence, sexual content, gambling, or user interaction features.
Contains third-party advertising (Google AdMob).
Target audience: adults preparing for driving license exams.
```

---

## 💡 טיפים נוספים

1. **לאחר מילוי השאלון** — גוגל מייצר את הדירוג אוטומטית. אין לשנות אותו ידנית.
2. **אם הדירוג יצא "Teen" במקום "Everyone"** — זה בסדר. זה עדיין מאשר את האפליקציה לפרסום.
3. **אם גוגל שואל על "Driving simulation"** — סמן NO. האפליקציה היא לימוד תיאוריה, לא סימולטור נהיגה.
4. **חדש לב לשאלה על AdMob** — חייב לסמן YES ל-ads, אחרת גוגל יסיר את האפליקציה בגלל הצהרה שגויה.
