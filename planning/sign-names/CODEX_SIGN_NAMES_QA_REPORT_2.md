# Sign names QA — v6 re-check

**NOT APPROVED — OK: 266; FIX: 8; ASK-OWNER: 2. Total: 276.**

Reviewed 2026-10-23 against CODEX_RECHECK_NOTES.md and CODEX_SIGN_NAMES_QA_REPORT.md. All 58 changed names were re-reviewed; all 218 remaining records were compared field by field with the original v4 CSV and read again for terminology interactions. The complete v6 candidate still needs the eight fixes and two language decisions below.

## Evidence and changed criteria

The owner decisions in the re-check notes supersede the corresponding open questions in report 1. PARKING is the sole allowed Latin word. The short-time stopping concept is accepted as directed. The owner-approved T-junction, sharp-curve, kerb, shared-street, single/multiple-track, tilted-bar, portable-sign and descent wording is accepted without reopening the same taste questions. Non-urban wording may be dropped in 602–604. Numeric values may be omitted from the specifically authorized short headlines when retained in explanations; 627 must keep 2,200 kg. Report 1 is retained unchanged as the historical review.

Data comparison: 276 records and 276 unique IDs in each file; no additions or deletions. Exactly 58 proposed names differ and exactly those rows carry changed_since_v4=YES. For every row, topic, official Hebrew, previous Gemini translation, review notes and image path are identical to v4. No hidden unflagged name changes were found. This confirms no introduced data regression in the 218 unchanged records; it does not assert that inherited Hebrew source defects were repaired.

All 57 available images for the changed rows were reopened and visually checked in labelled contact sheets rendered only in memory. The supplied 303 image remains missing, as in the first review; 303 is judged from Hebrew under the original brief's explicit allowance. No new full legal-source verification or generated-audio listening test was performed. This report reviews the CSV names; it does not certify the deployed explanations, pronunciation of PARKING, or production readiness of the entire app.

## Remaining findings

The following table copies current Hebrew and Amharic from v6. Required corrections are explained in English; no replacement Amharic is authored.

| Sign | Verdict | Hebrew supplied | Current name | Problem / rule | Required meaning |
|---|---|---|---|---|---|
| 114 | ASK-OWNER | צומת הצטלבות | አራት መንገድ መስቀለኛ | Rules 3: The four-road/crossroads concept is restored. አራት መንገድ መስቀለኛ is compressed and needs native confirmation as a complete natural spoken name. This is a new wording, not one of the owner-approved unchanged expressions. | A four-arm crossroads / צומת הצטלבות. Confirm naturalness; do not revert to generic junction. |
| 218 | FIX | דרך לרכב מנועי שמסוגל ומורשה לנוע במהירות שאינה פחותה מזו שצויינה בתמרור בקמ"ש | ለሞተር ተሽከርካሪዎች መንገድ በምልክቱ ላይ በተጠቀሰው ፍጥነት | Rules 1,2: Removing 60 fixes the image-number mismatch, but the name still says a road for motor vehicles at the displayed speed. It does not retain capable AND permitted to travel at NOT LESS THAN that speed. The owner waived digits, not the minimum-threshold relation. | Motor vehicles capable and permitted to travel at least the speed displayed. No need to hard-code 55. |
| 501 | FIX | כביש או נתיב או שול לתחבורה ציבורית: הנסיעה בכביש או בנתיב, או בשול מותרת ל – סומנה צלמית רכבת מקומית (ס-43) – לרכבת מקומית; סומנה צלמית אוטובוס (ס-44) בצבע צהוב – לאוטובוס הנוסע בקו שירות; סומנה צלמית אוטובוס (ס-44) בצבע לבן – לכל אוטובוס; סומנה צלמית מונית (ס-45) – לכל מונית; סומנה צלמית אופנוע (ס-48) – לאופנוע; סומנה ספרה בצירוף הסימון "+" – לרכב – למעט רכב מסחרי שמשקלו הכולל המותר עולה על 3.5 טון – המסיע לפחות כמה נוסעים, לרבות הנהג, הנקוב בתמרור; (2) תמרור 502; צוינו אחד או יותר מסוגי הרכב בתמרור, יחולו הוראות התמרור על פי המצוין בו. עצירה או חנייה של כלי רכב בנתיב אסורה אלא אם צוין אחרת. | ለሕዝብ ማመላለሻ መንገድ መስመር ወይም የጎን መንገድ | Rules 1,7: የጎን መንገድ denotes a side road, not the shoulder of the carriageway. A required category has been replaced with a different road type. | Public-transport road, lane OR road shoulder. Numeric omission accepted under the new owner decision. |
| 507 | FIX | תחנת מוניות: אסורה עצירה וחניית כל רכב אחר, פרט להורדת נוסעים, צויינו מספרי זיהוי של מוניות או תווים שנקבעו בידי רשות תמרור מקומית בתמרור 439 מתחת לתמרור, תהיה החניה מותרת למוניות שצוינו בלבד | የታክሲ ማቆሚያ: ሌሎች ተሽከርካሪዎች ለአጭር ጊዜ መቆም እና PARKING የተከለከለ | Rules 1: The added clause bans other vehicles from stopping without preserving the explicit passenger-drop-off exception. This is a regression from the former neutral taxi-rank headline. | Taxi rank; if the restriction on other vehicles is stated, retain the passenger-drop-off exception. A neutral taxi-rank headline can leave the full rule to the explanation. |
| 512 | FIX | מקום עצירה לסוג מסויים של רכב במקום בו קיים מפרץ ואבני שפה: אסורה עצירה בתוך המפרץ או ליד קו הקטעים, למעט סוג הרכב שעצירתו הותרה ע"י תמרור, לשם העלאה והורדת נוסעים בלבד | ለተወሰኑ ተሽከርካሪዎች በመንገድ ዳር የእግረኛ መንገድ ድንጋዮች ለአጭር ጊዜ መቆም | Rules 1,2: The name identifies the roadside and kerbstones but never identifies a stopping BAY. It remains possible to confuse this with a kerbside stopping place without a bay. | Stopping place for the specified vehicle type IN A BAY WITH KERBS. Retain the owner-approved short-stop concept. |
| 513 | FIX | מקום עצירה לסוג מסויים של רכב במקום בו אין מפרץ ואבן השפה אינה מסומנת או אין אבן שפה: אסורה עצירה למעט סוג הרכב שעצירתו הותרה על ידי תמרור לשם העלאה והורדת נוסעים בלבד | ለተወሰኑ ተሽከርካሪዎች ያለ የእግረኛ መንገድ ድንጋዮች ለአጭር ጊዜ መቆም | Rules 1,2: The name says without kerbstones. The Hebrew allows an unmarked kerb OR no kerb, and specifically has NO BAY. Both the alternative and the distinguishing no-bay feature are lost. | Stopping place for the specified vehicle type WITHOUT A BAY, with an unmarked kerb or no kerb. |
| 514 | FIX | כיווני הנסיעה המותרים בנתיב – חצים על פני הדרך בצבע צהוב, עם או בלי חצים בצבע לבן או כתום: החץ הצהוב מורה לכלי הרכב המצוינים בתמרור 501 בלבד: היכנס לצומת ועבור בו רק בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; אם לא הוצב תמרור 501: החץ הצהוב מורה לרכב ציבורי בקווי שירות בלבד: היכנס לצומת ועבור בו בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; סומן גם חץ בצבע לבן או כתום, החץ מורה לכל כלי הרכב: היכנס לצומת ועבור בו רק בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; חצים בצבע כתום מורים על כיווני נסיעה אל או בתוך אתר עבודה | በመስመሩ ውስጥ የተፈቀዱ አቅጣጫዎች: ቢጫ ቀስቶች ለተወሰነ የሕዝብ ማመላለሻ ከሌሎች ቀለም ቀስቶች ጋር | Rules 1,2: The new ending says with arrows of other colours. The source expressly permits with OR WITHOUT white/orange arrows. Adding a mandatory companion-arrow condition is a regression. | Yellow arrows for the designated traffic; other-colour arrows may be present or absent. Keep lane identity and yellow colour. |
| 516 | ASK-OWNER | נתיב לתחבורה ציבורית, חציה אל ומהנתיב: קו קטעים ליד קו רציף משולב עם מעוינים בצבע צהוב; חציית הקווים מותרת רק אם חציית קו הקטעים קודמת לחציית הקו הרציף; הנסיעה בנתיב מותרת לרכב על פי המצוין בתמרור 230 או בתמרור 501 או רכב הפונה בצומת הקרוב, על פי סימון 514; עצירה או חניה של כלי רכב בנתיב אסורים, אלא אם כן צוין אחרת. | ለሕዝብ ማመላለሻ መስመር ከተቆራረጠ መስመር ጋር ከጠንካራ መስመር አጠገብ; መሻገር የሚፈቀደው ከተቆራረጠው መስመር በኩል ብቻ ነው | Rules 3,7: Crossing from the broken-line side is now correctly limited. However ጠንካራ literally uses hard/strong for solid, whereas the other marking names use the continuous-line term. At 16 words this is also the longest name. | Native-review whether this clearly means a continuous unbroken painted line, then standardize terminology and shorten without losing the broken-side crossing condition. |
| 627 | FIX | מותרת החניה על המדרכה לרכב שמשקלו הכולל המותר עד 2200 ק"ג, בהתאם למסומן ובלי לחסום את המעבר ברוחב סביר להולכי רגל ולכסא גלגלים לנכה, זולת – (1) בתחנת אוטובוסים ציבוריים או בתחנת רכבת מקומית שסומנו בתמרורים 505 או 506, בהתאמה; (2) אם נאסרה החניה על פי תמרור 507, 509, 510, 511, 512, 513, 818 או 820; | እስከ 2,200 ኪ.ግ ለሚመዝኑ ተሽከርካሪዎች በእግረኛ መንገድ ላይ PARKING ይፈቀዳል | Rules 1,2: The name now retains 2,200 kg but describes vehicles that WEIGH up to that amount. Hebrew specifies maximum PERMITTED GROSS WEIGHT. Actual current weight is not the same qualification. | Pavement parking for vehicles whose permitted gross weight is up to 2,200 kg. Keep PARKING and the number. |
| 636 | FIX | כביש חד-סטרי לרכב מנועי: לאופניים, כהגדרתם בסעיף 1 להודעה זו, מותרת הנסיעה גם בכיוון הנגדי. | ለሞተር ተሽከርካሪዎች አንድ አቅጣጫ መንገድ፤ ብስክሌቶች በተቃራኒ አቅጣጫም ያሽከርክሩ | Rules 1,2: The bicycle clause uses an imperative meaning drive in the opposite direction too. Hebrew grants permission; it does not command cyclists to travel against the motor traffic. | One-way for motor vehicles; bicycles MAY ALSO travel in the opposite direction. |

## Mechanical checks and terminology consistency

The checks were repeated across all 276 names, with PARKING removed as a whole token before checking for other Latin letters.

| Check | Result |
|---|---|
| Listed banned driving forms | 0 |
| Parentheses | 0 |
| Hebrew characters | 0 |
| Latin words other than capital PARKING | 0 |
| Empty names / duplicate IDs | 0 / 0 |
| PARKING occurrences | 11 rows: 432, 433, 435, 436, 437, 507, 626, 627, 628, 819, 820 |
| More than 9 whitespace-delimited words | 18 rows, listed below |
| Identical-name groups | 11, listed below |

The parking/stopping distinction is now explicit in 432/433. Parking permissions, prohibitions and end-of-zone names use PARKING. Rows 505, 509, 511–513, 637 and 935 use the short-time stopping concept, including grammatical place/verb inflections. Row 507 uses both required concepts but creates the separate drop-off exception error above. Taxi-rank labels 507/508 and transport-stop label 510 remain identifiable by their contexts. Stop-line names 810/925 retain the conventional stopping-root noun and do not use PARKING; the former ambiguity is closed because parking is now explicitly labelled separately. The owner-approved kerb wording in 816–818 remains unchanged and is used in 511–513.

The owner-defined duration distinction is treated as the requested naming convention. This report does not establish a new duration-based legal definition of parking.

Length alone is advisory: 430/431 need the return-to-opposite-direction phrase; 713–715 need signal identity. Meaning and readability take precedence over mechanically forcing nine words. The 16-word name for 516 additionally needs terminology/readability confirmation.

Fixed measurements 113, 130–132, 422 and 435/436 remain intact. 627 retains the numeric value, with comma formatting equivalent to 2200, but its permitted-gross-weight qualifier remains wrong. The old 218 number mismatch is gone; its unresolved problem is now the missing minimum/capability relationship. Authorized omissions in 216, 501, 613, 722 and 819 are closed as headline-number issues. Whether the final deployed explanations actually retain these conditions is outside this CSV re-check.

All prior unintended duplicate names are removed: 201 differs from 713; 202 differs from 714; 511 differs from 513. 107/108 now also have distinct correct left/right names. The remaining duplicate groups have the same assessment as report 1 and no newly introduced collision.

## Focus rows requested in the notes

| Sign | Re-check result |
|---|---|
| 114 | Four-arm junction meaning restored; ASK-OWNER for naturalness of the new phrase. |
| 303 | Roundabout concept standardized with 121, yield command and right-hand passage retained. OK as a short Hebrew-based headline; image unavailable. |
| 504 | Both directions and their different authorized users are now present. OK. |
| 512 | FIX: roadside kerbs do not identify a bay. |
| 513 | FIX: must preserve no bay and allow unmarked kerb as well as no kerb. |
| 516 | Crossing-side restriction fixed; ASK-OWNER for continuous-line terminology and spoken brevity. |

## Inherited source issues

The comparison proves that the Hebrew fields and previous Gemini translations were not changed. Therefore report 1's source findings remain open or previously cleaned, with no new source regression detected:

| Row | Status |
|---|---|
| 127 | Validity-column fragment remains in raw parsed JSON; already removed in the CSV before both reviews. |
| 128 | Suspect 639 cross-reference remains unresolved. |
| 210 | Apparent signal-applicability column contamination remains. |
| 420 | Raw JSON contamination already removed in the CSV before both reviews. |
| 501 | Apparent termination-column insertion remains in supplied Hebrew. |
| 629 | Supplied Hebrew remains truncated; repaired short-name concept can still be assessed. |
| 705 | Hebrew אצור typo remains; short stop command unaffected. |
| 811 | Hebrew רכב/רחב defect remains; v6 correctly restores the conditional wide-crossing meaning. |

These are carried forward from the previous report, not presented as newly independently verified findings. Source correction and final explanation verification remain separate tasks.

## סיכום לבעל האפליקציה

נבדקו מחדש כל 58 השמות ששונו, וכל 218 השורות האחרות הושוו למקור ונקראו לבדיקת עקביות.
הסימון של השינויים מדויק; לא נמצאה נסיגה בנתוני השורות שלא שונו.
רוב הממצאים הקודמים נסגרו בעקבות התיקונים וההחלטות שלך, כולל PARKING והמונחים שאישרת.
נשארו 8 שורות לתיקון: 218, 501, 507, 512, 513, 514, 627 ו־636.
שתי שורות דורשות הכרעת ניסוח של דובר אמהרית: 114 ו־516.
יש לשמור ב־218 את משמעות הסף המזערי, ב־501 שול דרך, וב־627 משקל כולל מותר.
ב־507 וב־514 נוספו הכללות שאינן תואמות את הנוסח העברי; ב־512/513 עדיין חסר ההבדל של מפרץ.
הטבלה המלאה עדיין אינה מאושרת; נדרשת בדיקה חוזרת של התיקונים שנותרו.
הדוח מתייחס לשמות בלבד; תמונת 303 עדיין חסרה והשיבושים הקודמים במקור העברי לא תוקנו.

## Every changed row: individual re-check

| Sign | Current name | Verdict | Re-check assessment |
|---|---|---|---|
| 107 | ሹል ግራ ኩርባ ላይ ማስጠንቀቂያ እና መመሪያ | OK | Guidance restored; added left/right matches arrows; sharp-curve term owner-approved. |
| 108 | ሹል ቀኝ ኩርባ ላይ ማስጠንቀቂያ እና መመሪያ | OK | Guidance restored; added left/right matches arrows; sharp-curve term owner-approved. |
| 114 | አራት መንገድ መስቀለኛ | ASK-OWNER | The four-road/crossroads concept is restored. አራት መንገድ መስቀለኛ is compressed and needs native confirmation as a complete natural spoken name. This is a new wording, not one of the owner-approved unchanged expressions. |
| 118 | ቲ-መገናኛ ላይ ማስጠንቀቂያ እና መመሪያ | OK | Warning and guidance restored; T-junction term owner-approved. |
| 139 | የ"አቁም" ምልክት ወደፊት | OK | Ahead restored; removing reference 302 is allowed. |
| 216 | ወደ ፈጣን መንገድ መግቢያ | OK | Motorway entrance restored; false blanket prohibition removed; number omitted under owner decision. |
| 218 | ለሞተር ተሽከርካሪዎች መንገድ በምልክቱ ላይ በተጠቀሰው ፍጥነት | FIX | Removing 60 fixes the image-number mismatch, but the name still says a road for motor vehicles at the displayed speed. It does not retain capable AND permitted to travel at NOT LESS THAN that speed. The owner waived digits, not the minimum-threshold relation. |
| 303 | ክብ ቅርጽ ያለው መገናኛ: ቅድሚያ ይስጡ እና በቀኝ በኩል ያሽከርክሩ | OK | Roundabout terminology matches 121; yield and right-hand movement retained. Image remains unavailable; Hebrew-only acceptance per brief. |
| 403 | ማገጃ: መንገድ ዝግ ነው | OK | Barrier identity restored. |
| 414 | በምልክቱ ላይ ለሚታዩት የመንገድ ተጠቃሚዎች መግባት የተከለከለ ነው | OK | No entry now scoped to the displayed road users. |
| 430 | በሚቀጥለው መታጠፊያ ወደ ቀኝ ወደ ተቃራኒ አቅጣጫ ለመመለስ የተከለከለ ነው | OK | Connector-based U-turn prohibition restored; correct right/left and next-turn scope. Ten words are justified by the required distinction. |
| 431 | በሚቀጥለው መታጠፊያ ወደ ግራ ወደ ተቃራኒ አቅጣጫ ለመመለስ የተከለከለ ነው | OK | Connector-based U-turn prohibition restored; correct right/left and next-turn scope. Ten words are justified by the required distinction. |
| 432 | ተሽከርካሪ PARKING የተከለከለ | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 433 | ለአጭር ጊዜ መቆም እና PARKING የተከለከለ | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 435 | ከ10,000 ኪ.ግ በላይ ክብደት ላለው ተሽከርካሪ PARKING የተከለከለ ዞን | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 436 | ከ10,000 ኪ.ግ በላይ ክብደት ላለው የንግድ ተሽከርካሪ PARKING የተከለከለበት ዞን መጨረሻ | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 437 | ለአካል ጉዳተኛ ተሽከርካሪ ብቻ PARKING | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 501 | ለሕዝብ ማመላለሻ መንገድ መስመር ወይም የጎን መንገድ | FIX | የጎን መንገድ denotes a side road, not the shoulder of the carriageway. A required category has been replaced with a different road type. |
| 503 | ለሕዝብ ማመላለሻ መስመር በድርብ የተቆራረጡ ቢጫ መስመሮች እና አልማዞች | OK | Double broken yellow lines and diamonds now identify the marking. |
| 504 | በነጭ ቀስት አቅጣጫ ለሁሉም ተሽከርካሪዎች; በተቃራኒው አቅጣጫ ለተፈቀደ የሕዝብ ማመላለሻ | OK | White-arrow direction applies to all vehicles; opposing direction is scoped to authorized public transport. Fragment form remains understandable as a headline. |
| 505 | የሕዝብ አውቶቡሶች እና የአገልግሎት መስመር ተሽከርካሪዎች ለአጭር ጊዜ መቆሚያ | OK | Short-time stopping concept present; service-vehicle/boarding-alighting identity retained. |
| 507 | የታክሲ ማቆሚያ: ሌሎች ተሽከርካሪዎች ለአጭር ጊዜ መቆም እና PARKING የተከለከለ | FIX | The added clause bans other vehicles from stopping without preserving the explicit passenger-drop-off exception. This is a regression from the former neutral taxi-rank headline. |
| 509 | ታክሲዎች ተሳፋሪዎችን ለማንሳት እና ለማውረድ ብቻ ለአጭር ጊዜ የሚቆሙበት ቦታ | OK | Short-time stopping concept present; service-vehicle/boarding-alighting identity retained. |
| 511 | ለተወሰኑ ተሽከርካሪዎች በቀይ-ቢጫ የእግረኛ መንገድ ድንጋዮች ለአጭር ጊዜ መቆም | OK | Red-yellow kerb distinguishes the sign; owner-approved kerb term and short-stop concept used. Passenger-handling detail remains in explanation. |
| 512 | ለተወሰኑ ተሽከርካሪዎች በመንገድ ዳር የእግረኛ መንገድ ድንጋዮች ለአጭር ጊዜ መቆም | FIX | The name identifies the roadside and kerbstones but never identifies a stopping BAY. It remains possible to confuse this with a kerbside stopping place without a bay. |
| 513 | ለተወሰኑ ተሽከርካሪዎች ያለ የእግረኛ መንገድ ድንጋዮች ለአጭር ጊዜ መቆም | FIX | The name says without kerbstones. The Hebrew allows an unmarked kerb OR no kerb, and specifically has NO BAY. Both the alternative and the distinguishing no-bay feature are lost. |
| 514 | በመስመሩ ውስጥ የተፈቀዱ አቅጣጫዎች: ቢጫ ቀስቶች ለተወሰነ የሕዝብ ማመላለሻ ከሌሎች ቀለም ቀስቶች ጋር | FIX | The new ending says with arrows of other colours. The source expressly permits with OR WITHOUT white/orange arrows. Adding a mandatory companion-arrow condition is a regression. |
| 516 | ለሕዝብ ማመላለሻ መስመር ከተቆራረጠ መስመር ጋር ከጠንካራ መስመር አጠገብ; መሻገር የሚፈቀደው ከተቆራረጠው መስመር በኩል ብቻ ነው | ASK-OWNER | Crossing from the broken-line side is now correctly limited. However ጠንካራ literally uses hard/strong for solid, whereas the other marking names use the continuous-line term. At 16 words this is also the longest name. |
| 602 | ከመለዋወጫ በፊት የመድረሻ አቅጣጫ | OK | Shortened under owner decision. Interchange versus junction retained; 604 additionally indicates advance guidance. |
| 603 | ከመስቀለኛ መንገድ በፊት የመድረሻ አቅጣጫ | OK | Shortened under owner decision. Interchange versus junction retained; 604 additionally indicates advance guidance. |
| 604 | ከመስቀለኛ መንገድ በፊት የቅድሚያ መድረሻ አቅጣጫ | OK | Shortened under owner decision. Interchange versus junction retained; 604 additionally indicates advance guidance. |
| 613 | በመስመሮች ውስጥ የተፈቀዱ እንቅስቃሴዎች አቅጣጫዎች | OK | Permitted lane movements/directions restored; threshold omission owner-authorized. |
| 619 | በቀኝ በኩል የመስመሮች ብዛት መጨመር | OK | LANES replaces roads; increase/decrease and correct side retained. |
| 620 | በግራ በኩል የመስመሮች ብዛት መጨመር | OK | LANES replaces roads; increase/decrease and correct side retained. |
| 621 | በቀኝ በኩል የመስመሮች ብዛት መቀነስ | OK | LANES replaces roads; increase/decrease and correct side retained. |
| 622 | በግራ በኩል የመስመሮች ብዛት መቀነስ | OK | LANES replaces roads; increase/decrease and correct side retained. |
| 626 | ለተሽከርካሪዎች PARKING ይፈቀዳል | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 627 | እስከ 2,200 ኪ.ግ ለሚመዝኑ ተሽከርካሪዎች በእግረኛ መንገድ ላይ PARKING ይፈቀዳል | FIX | The name now retains 2,200 kg but describes vehicles that WEIGH up to that amount. Hebrew specifies maximum PERMITTED GROSS WEIGHT. Actual current weight is not the same qualification. |
| 628 | በመንገድ ወይም በእግረኛ መንገድ ላይ PARKING የተፈቀደበት ቦታ መጨረሻ | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 629 | የተለየ ምልክት የሌለው የማስጠንቀቂያ ወይም የመረጃ መልእክት | OK | The message now has no dedicated sign; no longer describes a nonexistent message. Hebrew source remains truncated. |
| 631 | ከላይ ባለው ምልክት የተሸፈነው የቀጣዩ ክፍል ርዝመት በሜትሮች | OK | Length now belongs to the upcoming section covered by the sign above. |
| 632 | ከላይ ያለው ምልክት በቀስት አቅጣጫ ለሚታጠፉ ተሽከርካሪዎች ነው | OK | Applicability to turning traffic in arrow direction restored. |
| 636 | ለሞተር ተሽከርካሪዎች አንድ አቅጣጫ መንገድ፤ ብስክሌቶች በተቃራኒ አቅጣጫም ያሽከርክሩ | FIX | The bicycle clause uses an imperative meaning drive in the opposite direction too. Hebrew grants permission; it does not command cyclists to travel against the motor traffic. |
| 637 | ለድንገተኛ አደጋ ለአጭር ጊዜ መቆሚያ | OK | Emergency stopping-place headline uses short-stop concept; 935 additionally retains work-zone setting. Neither falsely describes an entrance or a sea bay. Full bay detail may remain in explanation. |
| 713 | ነጭ አራት ማዕዘን መብራት: ቀጥታ ወይም ወደ ቀኝ ያሽከርክሩ | OK | White rectangular signal identity restored; permitted straight/right/left combinations correct. |
| 714 | ነጭ አራት ማዕዘን መብራት: ቀጥታ ወይም ወደ ግራ ያሽከርክሩ | OK | White rectangular signal identity restored; permitted straight/right/left combinations correct. |
| 715 | ነጭ አራት ማዕዘን መብራቶች: ቀጥታ፣ ወደ ቀኝ ወይም ወደ ግራ ያሽከርክሩ | OK | White rectangular signal identity restored; permitted straight/right/left combinations correct. |
| 721 | አረንጓዴ የብስክሌት ምልክት: በጥንቃቄ መሻገር ይፈቀዳል | OK | Careful crossing permission restored. |
| 722 | ድርብ ብልጭ ድርግም የሚል ቀይ የባቡር ምልክት: ይቁሙ | OK | Double flashing red railway signal and stop command retained; conditional distance omission owner-authorized. |
| 811 | የእግረኛ ማቋረጫ: ሰፊ ማቋረጫ በሁለት ሲከፈል በቀኝ በኩል ይለፉ | OK | Wide crossing split-in-two condition restored before right-side instruction. |
| 815 | በመንገድ ላይ በነጭ ቀለም የተቀቡ የትራፊክ ደሴቶች | OK | Painted road-island identity and white/orange distinction restored. |
| 819 | በነጭ ምልክት የተደረገባቸው PARKING ቦታዎች | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 820 | በነጭ ምልክት የተደረገበት PARKING የተከለከለ ቦታ | OK | Uses the mandatory PARKING token for parking; restriction/permission/end and relevant vehicle/number qualifiers preserved at headline level. |
| 903 | በሹል ኩርባ ላይ ማስጠንቀቂያ እና መመሪያ | OK | Warning AND guidance restored; sharp-curve/T-junction terminology approved. |
| 904 | በቲ-መገናኛ ላይ ማስጠንቀቂያ እና መመሪያ | OK | Warning AND guidance restored; sharp-curve/T-junction terminology approved. |
| 915 | የተለየ ምልክት የሌለው የሥራ ቦታ ማስጠንቀቂያ፣ መመሪያ፣ እገዳ ወይም መረጃ | OK | Warning, instruction, prohibition and information functions restored. |
| 928 | በመንገድ ላይ በብርቱካናማ ቀለም የተቀቡ የትራፊክ ደሴቶች | OK | Painted road-island identity and white/orange distinction restored. |
| 935 | በሥራ ቦታ ለድንገተኛ አደጋ ለአጭር ጊዜ መቆሚያ | OK | Emergency stopping-place headline uses short-stop concept; 935 additionally retains work-zone setting. Neither falsely describes an entrance or a sea bay. Full bay detail may remain in explanation. |

## Mechanical detail

More-than-nine-word rows: 209 (10), 210 (10), 303 (10), 408 (10), 430 (10), 431 (10), 436 (11), 504 (10), 507 (10), 509 (10), 512 (10), 514 (13), 516 (16), 627 (10), 709 (10), 715 (11), 805 (11), 915 (10).

Duplicate groups: 109/905, 110/906, 111/907, 112/908, 138/633, 145/909, 421/423, 701/727, 703/728, 705/729, 706/707.

## Unchanged rows: complete regression register

All fields compared match v4. The following 218 unchanged rows retain no newly introduced defect. Owner decisions close the old taste/terminology questions where applicable. This does not mean inherited Hebrew transcription defects were repaired.

| Sign | v6 name | Comparison result |
|---|---|---|
| 101 | ያልተስተካከለ መንገድ | Identical to v4; no regression found |
| 102 | ሹል ኩርባ ወደ ቀኝ | Identical to v4; no regression found |
| 103 | ሹል ኩርባ ወደ ግራ | Identical to v4; no regression found |
| 104 | ኩርባ ቀኝ ከዚያም ግራ | Identical to v4; no regression found |
| 105 | ኩርባ ግራ ከዚያም ቀኝ | Identical to v4; no regression found |
| 106 | ጠመዝማዛ መንገድ | Identical to v4; no regression found |
| 109 | መንገዱ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 110 | መንገዱ ከቀኝ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 111 | መንገዱ ከግራ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 112 | ጠባብ መተላለፊያ ወይም መሰናክል | Identical to v4; no regression found |
| 113 | ከፍታ መሰናክል: ከ 4.80 ሜትር በታች | Identical to v4; no regression found |
| 115 | ቲ-መገናኛ: ወደ ቀኝ | Identical to v4; no regression found |
| 116 | ቲ-መገናኛ: ወደ ግራ | Identical to v4; no regression found |
| 117 | ቲ-መገናኛ | Identical to v4; no regression found |
| 119 | ቲ-መገናኛዎች: ቀኝ ከዚያም ግራ | Identical to v4; no regression found |
| 120 | ቲ-መገናኛዎች: ግራ ከዚያም ቀኝ | Identical to v4; no regression found |
| 121 | ክብ ቅርጽ ያለው መገናኛ | Identical to v4; no regression found |
| 122 | የትራፊክ መብራት | Identical to v4; no regression found |
| 123 | የቅድሚያ መንገድ ከቀኝ የጎን መንገድ ጋር ይዋሃዳል | Identical to v4; no regression found |
| 124 | የቅድሚያ መንገድ ከግራ የጎን መንገድ ጋር ይዋሃዳል | Identical to v4; no regression found |
| 125 | ከቀኝ ቅድሚያ መንገድ ጋር መዋሃድ | Identical to v4; no regression found |
| 126 | ከግራ ቅድሚያ መንገድ ጋር መዋሃድ | Identical to v4; no regression found |
| 127 | የትራፊክ መጨናነቅ | Identical to v4; no regression found |
| 128 | የአካባቢ ባቡር መሻገሪያ | Identical to v4; no regression found |
| 129 | የባቡር ሀዲድ መሻገሪያ | Identical to v4; no regression found |
| 130 | የባቡር ሀዲድ መሻገሪያ በ300 ሜትር | Identical to v4; no regression found |
| 131 | የባቡር ሀዲድ መሻገሪያ በ200 ሜትር | Identical to v4; no regression found |
| 132 | የባቡር ሀዲድ መሻገሪያ በ100 ሜትር | Identical to v4; no regression found |
| 133 | አንድ የባቡር ሀዲድ መሻገሪያ | Identical to v4; no regression found |
| 134 | ከአንድ በላይ የባቡር ሀዲድ መሻገሪያ | Identical to v4; no regression found |
| 135 | በአቅራቢያ የእግረኛ ማቋረጫ አለ | Identical to v4; no regression found |
| 136 | በአቅራቢያ እግረኞች አሉ | Identical to v4; no regression found |
| 137 | የብስክሌት ትራፊክ | Identical to v4; no regression found |
| 138 | ዋሻ | Identical to v4; no regression found |
| 140 | ቁልቁለት | Identical to v4; no regression found |
| 141 | የመንሸራተት አደጋ | Identical to v4; no regression found |
| 142 | ድንጋዮች ከቀኝ ይንከባለላሉ | Identical to v4; no regression found |
| 143 | ድንጋዮች ከግራ ይንከባለላሉ | Identical to v4; no regression found |
| 144 | የፍጥነት መቀነሻ | Identical to v4; no regression found |
| 145 | ባለ ሁለት አቅጣጫ ትራፊክ | Identical to v4; no regression found |
| 146 | እንስሳት | Identical to v4; no regression found |
| 147 | የሚሻገር የሥራ ተሽከርካሪ ወይም ትራክተር | Identical to v4; no regression found |
| 148 | የማመላከቻ እና የማስጠንቀቂያ ምሰሶ | Identical to v4; no regression found |
| 149 | የማመላከቻ ወይም የመለያየት ምሰሶ | Identical to v4; no regression found |
| 150 | አደገኛ ቦታ | Identical to v4; no regression found |
| 151 | አደጋ | Identical to v4; no regression found |
| 152 | የጎን ንፋስ | Identical to v4; no regression found |
| 153 | ጥልቅ ውሃ | Identical to v4; no regression found |
| 201 | ቀጥታ ወይም ወደ ቀኝ ያሽከርክሩ | Identical to v4; no regression found |
| 202 | ቀጥታ ወይም ወደ ግራ ያሽከርክሩ | Identical to v4; no regression found |
| 203 | ቀጥታ ያሽከርክሩ | Identical to v4; no regression found |
| 204 | ወደ ቀኝ ያሽከርክሩ ከመንገድ ምልክቱ በፊት ይታጠፉ | Identical to v4; no regression found |
| 205 | ወደ ግራ ያሽከርክሩ ከመንገድ ምልክቱ በፊት ይታጠፉ | Identical to v4; no regression found |
| 206 | ወደ ቀኝ ያሽከርክሩ ከመንገድ ምልክቱ በኋላ ይታጠፉ | Identical to v4; no regression found |
| 207 | ወደ ግራ ያሽከርክሩ ከመንገድ ምልክቱ በኋላ ይታጠፉ | Identical to v4; no regression found |
| 208 | ወደ ቀኝ ወይም ወደ ግራ ያሽከርክሩ | Identical to v4; no regression found |
| 209 | ቀጥታ ያሽከርክሩ ወይም ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ቀኝ ያሽከርክሩ | Identical to v4; no regression found |
| 210 | ቀጥታ ያሽከርክሩ ወይም ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ግራ ያሽከርክሩ | Identical to v4; no regression found |
| 211 | ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ቀኝ ያሽከርክሩ | Identical to v4; no regression found |
| 212 | ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ግራ ያሽከርክሩ | Identical to v4; no regression found |
| 213 | የተሰየመውን ቦታ ከቀኝ ወይም ከግራ ይለፉ | Identical to v4; no regression found |
| 214 | የተሰየመውን ቦታ ከቀኝ በኩል ይለፉ | Identical to v4; no regression found |
| 215 | የተሰየመውን ቦታ ከግራ በኩል ይለፉ | Identical to v4; no regression found |
| 217 | የፈጣን መንገድ መጨረሻ | Identical to v4; no regression found |
| 219 | ለሞተር ተሽከርካሪዎች ብቻ የሚሆን መንገድ | Identical to v4; no regression found |
| 220 | የተቀናጀ መንገድ | Identical to v4; no regression found |
| 221 | የተቀናጀ መንገድ መጨረሻ | Identical to v4; no regression found |
| 222 | የትራፊክ ማረጋጊያ ዞን | Identical to v4; no regression found |
| 223 | የትራፊክ ማረጋጊያ ዞን መጨረሻ | Identical to v4; no regression found |
| 224 | ባለአንድ አቅጣጫ የብስክሌት መስመር | Identical to v4; no regression found |
| 225 | የብስክሌት መስመር መጨረሻ | Identical to v4; no regression found |
| 226 | የእግረኛ መንገድ ብቻ | Identical to v4; no regression found |
| 227 | የብስክሌት መንገድ | Identical to v4; no regression found |
| 228 | የጋራ የእግረኛ እና የብስክሌት መንገድ | Identical to v4; no regression found |
| 229 | የተለየ የእግረኛ እና የብስክሌት መንገድ | Identical to v4; no regression found |
| 230 | የክፍያ መንገድ ወይም መስመር | Identical to v4; no regression found |
| 231 | የክፍያ መንገድ ወይም መስመር መጨረሻ | Identical to v4; no regression found |
| 301 | ለመስቀለኛ መንገድ ትራፊክ ቅድሚያ ይስጡ | Identical to v4; no regression found |
| 302 | ቁም! ለመስቀለኛ መንገድ ትራፊክ ቅድሚያ ይስጡ | Identical to v4; no regression found |
| 304 | ቁም ተንቀሳቃሽ ምልክት | Identical to v4; no regression found |
| 305 | በጥንቃቄ ይቀጥሉ ተንቀሳቃሽ ምልክት | Identical to v4; no regression found |
| 306 | ለመንገድ አቋራጭ እግረኞች ቅድሚያ ይስጡ | Identical to v4; no regression found |
| 307 | በጠባብ መንገድ ለሚመጣው ትራፊክ ቅድሚያ ይስጡ | Identical to v4; no regression found |
| 308 | በጠባብ መንገድ ቅድሚያ አለዎት | Identical to v4; no regression found |
| 309 | በመንገድ ላይ ቅድሚያ አለዎት | Identical to v4; no regression found |
| 310 | የቅድሚያ መንገድ መጨረሻ | Identical to v4; no regression found |
| 401 | መንገድ ዝግ ነው – በሁለቱም አቅጣጫዎች | Identical to v4; no regression found |
| 402 | ለሁሉም ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 404 | የባቡር ማገጃ | Identical to v4; no regression found |
| 405 | ለሁሉም ሞተር ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 406 | ከተጠቀሰው ክብደት በላይ ለሆኑ የንግድ ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 407 | አደገኛ ቁሳቁስ ለሚያጓጉዙ ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 408 | ባለ ሁለት ጎማ ተሽከርካሪዎች ሳይጨምር ለሞተር ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 409 | ለሞተር ሳይክሎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 410 | ለስራ ተሽከርካሪዎች እና ለትራክተሮች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 411 | ለእንስሳት መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 412 | ለብስክሌቶች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 413 | እግረኞች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 415 | ከሚፈቀደው ክብደት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 416 | ከሚፈቀደው ቁመት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 417 | ከሚፈቀደው ስፋት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው | Identical to v4; no regression found |
| 418 | የመንጃ ትምህርት ክልከላ ዞን | Identical to v4; no regression found |
| 419 | የመንጃ ትምህርት ክልከላ ዞን መጨረሻ | Identical to v4; no regression found |
| 420 | ማለፍ የተከለከለ ነው | Identical to v4; no regression found |
| 421 | የማለፍ ክልከላ መጨረሻ | Identical to v4; no regression found |
| 422 | ከ 4 ቶን በላይ ለሆኑ ተሽከርካሪዎች ማለፍ የተከለከለ ነው | Identical to v4; no regression found |
| 423 | የማለፍ ክልከላ መጨረሻ | Identical to v4; no regression found |
| 424 | የከተማ መንገዶች ዞን | Identical to v4; no regression found |
| 425 | የከተማ መንገዶች ዞን መጨረሻ | Identical to v4; no regression found |
| 426 | ከተጠቀሰው ፍጥነት በላይ ማሽከርከር የተከለከለ ነው | Identical to v4; no regression found |
| 427 | የልዩ ፍጥነት ክፍል መጨረሻ | Identical to v4; no regression found |
| 428 | ወደ ቀኝ መታጠፍ የተከለከለ | Identical to v4; no regression found |
| 429 | ወደ ግራ መታጠፍ የተከለከለ | Identical to v4; no regression found |
| 434 | የምልክት 432, 433 መመሪያዎች መጨረሻ | Identical to v4; no regression found |
| 438 | አቁም! የጉምሩክ ፍተሻ | Identical to v4; no regression found |
| 439 | አስገዳጅ መልእክት ምልክት | Identical to v4; no regression found |
| 440 | ለብክለት ተሽከርካሪዎች መግባት የተከለከለበት ዞን | Identical to v4; no regression found |
| 441 | ለብክለት ተሽከርካሪዎች መግባት የተከለከለበት ዞን መጨረሻ | Identical to v4; no regression found |
| 502 | ለሕዝብ ማመላለሻ መንገድ ወይም መስመር መጨረሻ | Identical to v4; no regression found |
| 506 | የአካባቢ ባቡር ጣቢያ | Identical to v4; no regression found |
| 508 | የታክሲ ማቆሚያ ቦታ መጨረሻ | Identical to v4; no regression found |
| 510 | ወታደሮችን ለማንሳት እና ለማውረድ ብቻ የማመላለሻ ማቆሚያ | Identical to v4; no regression found |
| 515 | ለሕዝብ ማመላለሻ መስመር: ድርብ ቀጣይ መስመር | Identical to v4; no regression found |
| 601 | የመለዋወጫ ወይም የመስቀለኛ መንገድ ስም | Identical to v4; no regression found |
| 605 | ሁለት ተከታታይ እና ቅርብ መውጫዎች | Identical to v4; no regression found |
| 606 | ከመንገድ መውጫ አቅጣጫ | Identical to v4; no regression found |
| 607 | ለመውጫ ብቻ አቅጣጫ | Identical to v4; no regression found |
| 608 | ከመንገድ መውጫ ቦታ | Identical to v4; no regression found |
| 609 | የሚቀጥሉት መውጫዎች | Identical to v4; no regression found |
| 610 | ከከተማ ውጭ ባሉ መንገዶች ላይ መድረሻዎች | Identical to v4; no regression found |
| 611 | የመንገድ ቁጥር | Identical to v4; no regression found |
| 612 | በመንገድ ላይ ያለው የኪሎሜትር ቁጥር | Identical to v4; no regression found |
| 614 | በከተማ መንገዶች ላይ ወደ መድረሻዎች አቅጣጫ | Identical to v4; no regression found |
| 615 | በከተማ መንገድ ላይ ከመለዋወጫ በፊት አቅጣጫ | Identical to v4; no regression found |
| 616 | በከተማ መንገድ ላይ ከመስቀለኛ መንገድ በፊት አቅጣጫ | Identical to v4; no regression found |
| 617 | በመስቀለኛ መንገድ ወይም በመለዋወጫ መንገድ መሪ | Identical to v4; no regression found |
| 618 | አንድ አቅጣጫ መንገድ | Identical to v4; no regression found |
| 623 | የማይወጣ መንገድ | Identical to v4; no regression found |
| 624 | ከቀኝ በኩል የማይወጣ መንገድ | Identical to v4; no regression found |
| 625 | ከግራ በኩል የማይወጣ መንገድ | Identical to v4; no regression found |
| 630 | በተጠቀሰው ርቀት ላይ ተፈጻሚ ይሆናል | Identical to v4; no regression found |
| 633 | ዋሻ | Identical to v4; no regression found |
| 634 | የዋሻው መጨረሻ | Identical to v4; no regression found |
| 635 | የእሳት አደጋ | Identical to v4; no regression found |
| 638 | ተሳፋሪዎችን ለማውረድ እና ለማንሳት ቦታ | Identical to v4; no regression found |
| 639 | የትምህርት ተቋማት ዞን | Identical to v4; no regression found |
| 640 | የትምህርት ተቋማት ዞን መጨረሻ | Identical to v4; no regression found |
| 701 | ቀይ መብራት: ቁም | Identical to v4; no regression found |
| 702 | ቀይ እና ቢጫ መብራት አብረው: ቁም | Identical to v4; no regression found |
| 703 | አረንጓዴ መብራት: ቀጥል | Identical to v4; no regression found |
| 704 | ለተሽከርካሪዎች አረንጓዴ ቀስት: ቀጥል | Identical to v4; no regression found |
| 705 | ቢጫ መብራት: ቁም | Identical to v4; no regression found |
| 706 | ብልጭ ድርግም የሚል ቢጫ መብራት: በጥንቃቄ ቀጥል | Identical to v4; no regression found |
| 707 | ብልጭ ድርግም የሚል ቢጫ መብራት: በጥንቃቄ ቀጥል | Identical to v4; no regression found |
| 708 | አግድም አራት ማዕዘን ነጭ መብራት: ቁም | Identical to v4; no regression found |
| 709 | አግድም አራት ማዕዘን ነጭ እና ክብ ነጭ መብራት አብረው ቁም | Identical to v4; no regression found |
| 710 | ቀጥ ያለ አራት ማዕዘን ነጭ መብራት: ቀጥል | Identical to v4; no regression found |
| 711 | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ቀኝ ቀጥል | Identical to v4; no regression found |
| 712 | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ግራ ቀጥል | Identical to v4; no regression found |
| 716 | ክብ ነጭ መብራት: ቁም | Identical to v4; no regression found |
| 717 | ብልጭ ድርግም የሚል ነጭ መብራት: በጥንቃቄ ቀጥል | Identical to v4; no regression found |
| 718 | ቀይ የቆመ እግረኛ ምስል: አትሻገር | Identical to v4; no regression found |
| 719 | አረንጓዴ የእግረኛ ምስል: በጥንቃቄ ተሻገር | Identical to v4; no regression found |
| 720 | ቀይ የብስክሌት ቅርጽ: አትሻገር | Identical to v4; no regression found |
| 723 | የተዘጋ መስመር | Identical to v4; no regression found |
| 724 | ክፍት መስመር | Identical to v4; no regression found |
| 725 | ወደ አጎራባች መስመር መሻገር | Identical to v4; no regression found |
| 726 | መውጫ መስመር | Identical to v4; no regression found |
| 727 | ቀይ መብራት: ቁም | Identical to v4; no regression found |
| 728 | አረንጓዴ መብራት: ቀጥል | Identical to v4; no regression found |
| 729 | ቢጫ መብራት: ቁም | Identical to v4; no regression found |
| 801 | የመንገድ መስመር ወይም የመንገድ ዘንግ መስመር: ነጭ የተቆራረጠ መስመር | Identical to v4; no regression found |
| 802 | የሚቀያየር መንገድ ወይም መስመር: ነጭ ድርብ የተቆራረጠ መስመር | Identical to v4; no regression found |
| 803 | ነጭ ድርብ ቀጣይነት ያለው የመለያ መስመር | Identical to v4; no regression found |
| 804 | ለብስክሌቶች የተዘጋጀ መንገድ ወይም መስመር | Identical to v4; no regression found |
| 805 | ነጭ ጥቅጥቅ ያለ የተቆራረጠ መስመር: ድርብ ቀጣይነት ያለው የመለያ መስመር ማስጠንቀቂያ | Identical to v4; no regression found |
| 806 | ከቀጣይ መስመር አጠገብ ያለ የተቆራረጠ መስመር በነጭ | Identical to v4; no regression found |
| 807 | ቢጫ ቀጣይነት ያለው መስመር: የመንገድ ዳር መስመር | Identical to v4; no regression found |
| 808 | ነጭ አራት ማዕዘን መስመር | Identical to v4; no regression found |
| 809 | ነጭ የተቆራረጠ መስመር – በመገናኛ ላይ መታጠፍ | Identical to v4; no regression found |
| 810 | የማቆሚያ መስመር: በመስመሩ ስፋት ላይ ያለ ነጭ መስመር | Identical to v4; no regression found |
| 812 | ለብስክሌቶች መሻገሪያ | Identical to v4; no regression found |
| 813 | በመስመሩ ላይ የተፈቀዱ የማሽከርከር አቅጣጫዎች: ነጭ ቀስቶች | Identical to v4; no regression found |
| 814 | ሊያልቅ ያለ የማሽከርከር መስመር: ነጭ ሰያፍ ቀስቶች | Identical to v4; no regression found |
| 816 | ጥቁር-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Identical to v4; no regression found |
| 817 | በሰማያዊ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Identical to v4; no regression found |
| 818 | ቀይ-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Identical to v4; no regression found |
| 821 | የፍጥነት መቀነሻ ቦታ | Identical to v4; no regression found |
| 901 | በመንገድ ላይ የሥራ ቦታ | Identical to v4; no regression found |
| 902 | የሥራ ቦታ መጨረሻ | Identical to v4; no regression found |
| 905 | መንገዱ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 906 | መንገዱ ከቀኝ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 907 | መንገዱ ከግራ እየጠበበ ይሄዳል | Identical to v4; no regression found |
| 908 | ጠባብ መተላለፊያ ወይም መሰናክል | Identical to v4; no regression found |
| 909 | ባለ ሁለት አቅጣጫ ትራፊክ | Identical to v4; no regression found |
| 910 | የመስመሮች ብዛት ከቀኝ ይጨምራል | Identical to v4; no regression found |
| 911 | የመስመሮች ብዛት ከግራ ይጨምራል | Identical to v4; no regression found |
| 912 | የመስመሮች ብዛት ከቀኝ ይቀንሳል | Identical to v4; no regression found |
| 913 | የመስመሮች ብዛት ከግራ ይቀንሳል | Identical to v4; no regression found |
| 914 | የትራፊክ ማዞሪያ | Identical to v4; no regression found |
| 916 | በተጠቀሰው ርቀት ላይ | Identical to v4; no regression found |
| 917 | በተጠቀሰው ክፍል ርዝመት | Identical to v4; no regression found |
| 918 | ብርቱካናማ የተቆራረጠ መስመር | Identical to v4; no regression found |
| 919 | ብርቱካናማ ድርብ የተቆራረጠ መስመር | Identical to v4; no regression found |
| 920 | ብርቱካናማ ድርብ ቀጣይነት ያለው የመለያ መስመር | Identical to v4; no regression found |
| 921 | ብርቱካናማ ጥቅጥቅ ያለ የተቆራረጠ መስመር | Identical to v4; no regression found |
| 922 | ብርቱካናማ የተቆራረጠ መስመር ከቀጣይ መስመር አጠገብ | Identical to v4; no regression found |
| 923 | ብርቱካናማ አራት ማዕዘን ቅርጽ ያለው መስመር | Identical to v4; no regression found |
| 924 | ብርቱካናማ የተቆራረጠ መስመር - በመገናኛ ላይ መታጠፍ | Identical to v4; no regression found |
| 925 | ብርቱካናማ የማቆሚያ መስመር | Identical to v4; no regression found |
| 926 | በመስመሩ ውስጥ የተፈቀዱ የማሽከርከር አቅጣጫዎች: ብርቱካናማ ቀስቶች | Identical to v4; no regression found |
| 927 | ሊያልቅ ያለ የማሽከርከር መስመር: ብርቱካናማ ሰያፍ ቀስቶች | Identical to v4; no regression found |
| 929 | ማገጃ: መንገዱ ተዘግቷል | Identical to v4; no regression found |
| 930 | የአቅጣጫ ምሰሶዎች | Identical to v4; no regression found |
| 931 | አቅጣጫ ማስያዣ ወይም መሰናክል ኮን | Identical to v4; no regression found |
| 932 | ብርቱካናማ ብልጭ ድርግም የሚል መብራት | Identical to v4; no regression found |
| 933 | የሚንቀሳቀስ ብልጭ ድርግም የሚል ሰሌዳ | Identical to v4; no regression found |
| 934 | የሚንቀሳቀስ ብልጭ ድርግም የሚል ሰሌዳ: መንገዱ ዝግ ነው | Identical to v4; no regression found |

## Input fingerprints and boundaries

SHA-256:

- CODEX_RECHECK_NOTES.md: 91c2202eb5ee80a38311c0816a874faab6c5fcc76fb0c817fffbdaab717a5625
- CODEX_SIGN_NAMES_QA_REPORT.md: 3e400b960e0c3e56055fd64c8689ac88876758ef2fc033529705db9dee5a44a4
- sign_names_for_codex_qa.csv: 3b75f6b00b864ff5a813d964109f57da7aa3168a9bbcb7f0c9a5352a9ee0c1a9
- sign_names_for_codex_qa_v6.csv: b303de807d83c3001122d2d0cb3400b05ea5689e66508b85bab73c3f16fcee91
- official_wording_parsed.json: a65e558e347b168f00ce673b5cfd7fd1166f574f464c1add206c97af6f301fdd

Only CODEX_SIGN_NAMES_QA_REPORT_2.md is created by this re-check. No data, earlier report, script, image, audio or server content is edited. No generation, upload, build or deployment is run. No suggested replacement Amharic is supplied.
