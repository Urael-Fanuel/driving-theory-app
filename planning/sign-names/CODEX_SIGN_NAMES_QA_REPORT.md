# Sign names QA report

**NOT APPROVED — OK: 202; FIX: 44; ASK-OWNER: 30. Total: 276.**

Reviewed 2026-10-23 under CODEX_SIGN_NAMES_QA_BRIEF.md. The complete candidate is not approved for import. Correct FIX rows, resolve ASK-OWNER rows, and re-check the resulting names. Sign 101 remains owner-approved.

## Scope and confidence

Every one of the 276 CSV records was reviewed individually against its Hebrew wording and proposed name, with the previous Gemini translation as a secondary reading. All 275 available sign images were visually inspected in labelled contact sheets rendered in memory. Sign 303's image was missing at its supplied path; recursive inspection of scripts/downloaded-signs also found no 303 image. Its assessment uses Hebrew only and image fit remains unverified.

The supplied parsed JSON was checked for suspect Hebrew rows. It shares extraction defects with the CSV and is not an independent authority. Nevo and direct government PDF opens returned HTTP 403. Search-indexed government passages corroborated specific defects below; the entire current legal table was not independently verified online.

This is a language/content review, not native-speaker certification or an audio-listening test. OK means no issue found at this review's confidence level. Uncertain spoken idiom and comprehension are ASK-OWNER. All Amharic quoted here is existing candidate text; no replacement Amharic is authored.

The report applies the short-headline allowance: full explanations may retain exceptions and action details. However, the brief specifically requires measurements and distinguishing features to survive. Six omitted measurement values are therefore flagged, including conditional values in 501, 613, 722 and 819. Adding a bare number would be wrong: retain its condition, or explicitly revise that requirement before re-review.

## Mechanical checks over all rows

| Check in proposed-name column | Result |
|---|---|
| Literal substring scan: ይንዱ / ንዱ / ነዱ / መንዳት | 0 rows |
| Parentheses | 0 rows |
| Hebrew or Latin letters | 0 rows |
| Empty names / duplicate sign IDs | 0 / 0 |
| More than 9 whitespace-delimited words | 12 rows, listed below |
| Right/left in Hebrew lacking corresponding Amharic substring | 19 candidate rows, classified below |
| Identical-name groups | 15 groups / 30 rows; 6 groups have different Hebrew strings |
| Missing numeric tokens before semantic classification | 64 rows |
| Missing measurement/limit values | 6 rows: 216, 501, 613, 627, 722, 819 |
| Wrong inserted numeric value | 218: name says 60; image shows 55; Hebrew refers to displayed value |

The forbidden-form scan is not proof against every conceivable inflection; manual reading found no additional banned driving form in the proposed names. Some banned forms remain in the previous-long-translation column, outside this review's target field. No Hebrew sound-alike such as the old የካማት was found in proposed names. Ethiopic ቲ and ዩ-ተርን do not trigger the Latin-letter scan; their suitability is addressed individually.

### Length

209: 10; 210: 10; 408: 10; 414: 10; 436: 11; 602: 10; 603: 11; 604: 12; 628: 10; 709: 10; 722: 10; 805: 11 words.

This is an advisory threshold. Extra words in 209/210 preserve the straight-or-U-turn distinction; 408 preserves its vehicle exception; 709 identifies simultaneous light shapes; 805 identifies an advance marking warning. Those lengths alone do not warrant rejection. Other flagged rows have their own findings below.

### Missing direction candidates

| Signs | Missing side | Assessment |
|---|---|---|
| 125 / 126 | Left / right | Opposite side appears in the detailed ban on turning; merge side itself is correctly retained. |
| 148 | Both | Reflector-side detail omitted from guidance-post headline; no reversal. |
| 209 / 210 | Left / right | Omitted opposite prohibited U-turn; permitted side and straight movement are correctly retained. |
| 303 | Right | FIX: retain roundabout right-hand passage. |
| 703, 728 | Both | Green-light headline; movement list remains in explanation. |
| 801, 803, 805, 918, 920, 921 | Right | Action details omitted from descriptive marking headline. |
| 806, 922 | Right | Broken-beside-solid description; crossing condition stays in explanation. |
| 807 | Both | Yellow edge-line headline; action/exception details remain in explanation. |
| 808, 923 | Both | Possible lane uses, not a fixed right-only/left-only pair. |

Visually checked mirror pairs: 102/103, 104/105, 110/111, 115/116, 119/120, 123/124, 125/126, 142/143, 201/202, 204/205, 206/207, 209/210, 211/212, 214/215, 428/429, 430/431, 619/620, 621/622, 624/625, 711/712, 713/714, 906/907, 910/911, 912/913. No proposed-name right/left reversal was found. Before/after is correctly preserved for 204–207. Other findings still apply.

### Numeric omissions

| Sign | Omitted measurement | Scope that must accompany it |
|---|---|---|
| 216 | 60 km/h | Vehicle capability/permission threshold for motorway entry, subject to posted alternative. |
| 501 | 3.5 tonnes | Commercial-vehicle exclusion specifically from occupancy-based permission. |
| 613 | 10,000 kg | Conditional commercial/work-vehicle provision where the relevant symbol is shown. |
| 627 | 2,200 kg | Maximum permitted gross weight for pavement-parking permission. |
| 722 | 4 metres | Minimum distance from nearest rail only when no stop line or barrier exists. |
| 819 | 2,200 kg | Conditional pavement-parking provision, not ordinary marked parking generally. |

Correctly retained: 113 = 4.80 m; 130–132 = 300/200/100 m; 422 = 4 tonnes; 435/436 = 10,000 kg. The full source describes 130–132 as approximate/default distances; headline shortening is acceptable with the explanation retained.

For variable-value signs 406, 415–417 and 426, referring to the displayed/allowed threshold is acceptable without hard-coding an illustrative image value. In contrast, 218 inserts a conflicting number. The other 58 numeric-candidate rows omit only references, section/enumeration numbers, symbol IDs or a legal year rather than actual measurements.

### Every identical-name group

| Signs | Assessment |
|---|---|
| 107/108 | Shared generic name is expressly intended; both need guidance restored. Images point left/right respectively. |
| 109/905 | Same narrowing headline; accepted permanent/work-zone variants. |
| 110/906 | Same right-side narrowing headline; accepted. |
| 111/907 | Same left-side narrowing headline; accepted. |
| 112/908 | Same narrow-passage/obstacle headline; accepted. |
| 138/633 | Tunnel warning/information variants; accepted per brief. |
| 145/909 | Same two-way traffic headline; accepted. |
| 201/713 | FIX 713: white-light identity lost. |
| 202/714 | FIX 714: white-light identity lost. |
| 421/423 | Identical supplied Hebrew; intended generic end-of-overtaking-ban name accepted per brief despite different vehicle pictures. |
| 511/513 | FIX both: red-yellow kerb versus no bay/unmarked or absent kerb is lost. |
| 701/727 | Intended red-light command; bicycle pictogram in 727 does not invalidate the explicitly permitted shared headline. |
| 703/728 | Same green-light meaning; ordinary/bicycle variants accepted consistently with 701/727. |
| 705/729 | Same yellow-light meaning; ordinary/bicycle variants accepted. |
| 706/707 | Identical supplied meaning and intended shared flashing-yellow headline; accepted. |

Groups with differing Hebrew strings: 201/713, 202/714, 511/513, 701/727, 703/728, 705/729. String differences alone do not prove a defect.

## Every FIX and ASK-OWNER row

Hebrew and Amharic cells are copied verbatim from the CSV, including source defects. English correction requirements describe the intended meaning; they are not final replacement translations.

| Sign | Verdict | Official Hebrew supplied | Proposed Amharic | Problem / rule | Required meaning or owner decision |
|---|---|---|---|---|---|
| 102 | ASK-OWNER | עקומה חדה ימינה | ሹል ኩርባ ወደ ቀኝ | Rules 8: The direction and sharpness are correct, but natural spoken use of ሹል for a road curve needs native confirmation. | Sharp curve right / left respectively; retain both sharpness and side. |
| 103 | ASK-OWNER | עקומה חדה שמאלה | ሹል ኩርባ ወደ ግራ | Rules 8: The direction and sharpness are correct, but natural spoken use of ሹል for a road curve needs native confirmation. | Sharp curve right / left respectively; retain both sharpness and side. |
| 107 | FIX | אזהרה והדרכה בעקומה חדה: המשך הדרך בכוון המסומן בחצים שעל התמרור, עבור לפני התמרור | ሹል ኩርባ ማስጠንቀቂያ | Rules 1,2: The name retains warning but drops guidance, which the brief explicitly says the owner wanted. The image arrows are left for 107 and right for 108. | Warning AND guidance at a sharp curve; follow the arrows and pass before the board. Shared generic wording is explicitly allowed by the brief; if direction is named, use left for 107 and right for 108. Also confirm the naturalness of ሹል. |
| 108 | FIX | אזהרה והדרכה בעקומה חדה: המשך הדרך בכוון המסומן בחצים שעל התמרור, עבור לפני התמרור | ሹል ኩርባ ማስጠንቀቂያ | Rules 1,2: The name retains warning but drops guidance, which the brief explicitly says the owner wanted. The image arrows are left for 107 and right for 108. | Warning AND guidance at a sharp curve; follow the arrows and pass before the board. Shared generic wording is explicitly allowed by the brief; if direction is named, use left for 107 and right for 108. Also confirm the naturalness of ሹል. |
| 114 | FIX | צומת הצטלבות | የመንገድ መገናኛ | Rules 1,2,3: The name says road junction generically; it loses the crossing/four-arm junction that distinguishes the pictured sign from a T-junction. | Crossroads / crossing junction (צומת הצטלבות). |
| 115 | ASK-OWNER | צומת קמץ: ימינה | ቲ-መገናኛ: ወደ ቀኝ | Rules 3,6: ቲ names the letter T in Ethiopic script; it is not Hebrew transliteration or a forbidden Latin character. It may still be opaque to the intended low-literacy audience. | Confirm a readily understood T-junction / side-road junction term. Keep right for 115, left for 116, terminal T for 117, right-then-left for 119 and left-then-right for 120. |
| 116 | ASK-OWNER | צומת קמץ: שמאלה | ቲ-መገናኛ: ወደ ግራ | Rules 3,6: ቲ names the letter T in Ethiopic script; it is not Hebrew transliteration or a forbidden Latin character. It may still be opaque to the intended low-literacy audience. | Confirm a readily understood T-junction / side-road junction term. Keep right for 115, left for 116, terminal T for 117, right-then-left for 119 and left-then-right for 120. |
| 117 | ASK-OWNER | צומת קמץ | ቲ-መገናኛ | Rules 3,6: ቲ names the letter T in Ethiopic script; it is not Hebrew transliteration or a forbidden Latin character. It may still be opaque to the intended low-literacy audience. | Confirm a readily understood T-junction / side-road junction term. Keep right for 115, left for 116, terminal T for 117, right-then-left for 119 and left-then-right for 120. |
| 118 | FIX | אזהרה והדרכה בצומת קמץ: המשך הדרך בכוונים המסומנים בחצים שעל התמרור, עבור לפני התמרור | ቲ-መገናኛ ማስጠንቀቂያ | Rules 1,2: Guidance is omitted from warning-and-guidance. T-junction terminology also needs the same owner decision as 115–120. | Warning and guidance at a T-junction; continue in the indicated directions before the board. |
| 119 | ASK-OWNER | צמתי קמץ: ימינה ולאחר מכן שמאלה | ቲ-መገናኛዎች: ቀኝ ከዚያም ግራ | Rules 3,6: ቲ names the letter T in Ethiopic script; it is not Hebrew transliteration or a forbidden Latin character. It may still be opaque to the intended low-literacy audience. | Confirm a readily understood T-junction / side-road junction term. Keep right for 115, left for 116, terminal T for 117, right-then-left for 119 and left-then-right for 120. |
| 120 | ASK-OWNER | צמתי קמץ: שמאלה ולאחר מכן ימינה | ቲ-መገናኛዎች: ግራ ከዚያም ቀኝ | Rules 3,6: ቲ names the letter T in Ethiopic script; it is not Hebrew transliteration or a forbidden Latin character. It may still be opaque to the intended low-literacy audience. | Confirm a readily understood T-junction / side-road junction term. Keep right for 115, left for 116, terminal T for 117, right-then-left for 119 and left-then-right for 120. |
| 133 | ASK-OWNER | מקום מפגש מסילת ברזל – מסילה אחת | አንድ የባቡር ሀዲድ መሻገሪያ | Rules 1,2: The short word order can attach the count to crossings rather than tracks. The pictures distinguish one track from more than one track. | One-track railway crossing / railway crossing with more than one track. Ask a native speaker whether the present names unambiguously count tracks. |
| 134 | ASK-OWNER | מקום מפגש מסילת ברזל – יותר ממסילה אחת | ከአንድ በላይ የባቡር ሀዲድ መሻገሪያ | Rules 1,2: The short word order can attach the count to crossings rather than tracks. The pictures distinguish one track from more than one track. | One-track railway crossing / railway crossing with more than one track. Ask a native speaker whether the present names unambiguously count tracks. |
| 139 | FIX | תמרור "עצור" 302 בהמשך הדרך | የ"አቁም" ምልክት 302 | Rules 1,2: The name identifies stop sign 302 but omits ahead, losing the advance-warning distinction. | Stop sign ahead (תמרור עצור בהמשך הדרך), not a command to stop here. |
| 140 | FIX | ירידה תלולה | ቁልቁለት | Rules 1,2: ቁልቁለት identifies a descent/slope without retaining steep. | Steep descent (ירידה תלולה). |
| 216 | FIX | כניסה לדרך מהירה: אסורה הכניסה להולכי רגל, לאופניים – כהגדרתם בסעיף 1 להודעה זו, לעגלות יד, לבעלי חיים או לכל רכב אשר אינו מסוגל או מורשה לנוע במהירות 60 קמ"ש לפחות, או במהירות שצויינה בתמרור 218 המוצב לפני הכניסה לדרך המהירה | ወደ ፈጣን መንገድ መግባት የተከለከለ ነው | Rules 1,2: Meaning reversal: the proposed name says entering the motorway is prohibited. The sign marks entry to a motorway, with restrictions for specified road users. The Hebrew also contains 60 km/h, absent from the name. | Motorway entrance. If summarizing the restriction, scope it to the excluded users and vehicles not capable/permitted to travel at least 60 km/h or the posted alternative; never prohibit entry for everyone. |
| 218 | FIX | דרך לרכב מנועי שמסוגל ומורשה לנוע במהירות שאינה פחותה מזו שצויינה בתמרור בקמ"ש | ለሞተር ተሽከርካሪዎች መንገድ በሰዓት 60 ኪ.ሜ | Rules 1,2: The name gives 60 km/h, although the local image displays 55. It also loses the capable-and-permitted / not-less-than qualification. This is not an instruction to drive at exactly 60. | Road for motor vehicles capable and permitted to travel at least the speed shown; if naming the illustrated value, use 55 km/h. |
| 220 | ASK-OWNER | רחוב משולב | የተቀናጀ መንገድ | Rules 1,3: Literal integrated road may not communicate a shared residential street to the target audience. | Shared street (רחוב משולב) / end of shared street; confirm the spoken concept with the owner. |
| 221 | ASK-OWNER | קצה רחוב משולב | የተቀናጀ መንገድ መጨረሻ | Rules 1,3: Literal integrated road may not communicate a shared residential street to the target audience. | Shared street (רחוב משולב) / end of shared street; confirm the spoken concept with the owner. |
| 303 | FIX | מעגל תנועה: תן זכות קדימה לתנועה החוצה את דרכך במעגל התנועה או במסילה. עבור את מעגל התנועה מצידו הימני | ክብ ማዞሪያ: ቅድሚያ ይስጡ | Rules 1,2,7: Yield is retained, but whom to yield to and the mandatory right-hand passage are lost. The roundabout term also differs from 121. No local image was available. | Roundabout: yield to traffic crossing your path in the roundabout or on the rail track; pass the roundabout on its right. Use the same approved roundabout concept as 121. |
| 304 | ASK-OWNER | עצור! (תמרור נייד) | ቁም ተንቀሳቃሽ ምልክት | Rules 3: The words for portable sign are present, but the unpunctuated command plus noun phrase should be checked when spoken. Parentheses have correctly been removed. | Stop — portable sign / proceed carefully — portable sign. Confirm a natural spoken separation without parentheses. |
| 305 | ASK-OWNER | התקדם בזהירות (תמרור נייד) | በጥንቃቄ ይቀጥሉ ተንቀሳቃሽ ምልክት | Rules 3: The words for portable sign are present, but the unpunctuated command plus noun phrase should be checked when spoken. Parentheses have correctly been removed. | Stop — portable sign / proceed carefully — portable sign. Confirm a natural spoken separation without parentheses. |
| 403 | FIX | מחסום: הדרך חסומה. הוצב תמרור המורה על כוון, מותר להתקדם רק בכוון המצוין בתמרור | መንገድ ዝግ ነው | Rules 1,2: Road closed omits the barrier that identifies this sign, unlike the proposed name for 929. | Barrier: road blocked (מחסום: הדרך חסומה). |
| 414 | FIX | אסורה הכניסה להולכי רגל, לרכב עבודה, לטרקטור, לבעלי חיים, או לאופניים; הוראות התמרור יחולו על המשתמשים כמצוין בו ומספר לא יעלה על שלושה; לעניין זה, "אופניים" – כהגדרתם בסעיף 1 להודעה זו | ለእግረኞች ለስራ ተሽከርካሪዎች ለትራክተሮች ለእንስሳት ወይም ለብስክሌቶች መግባት የተከለከለ ነው | Rules 1,2: The name lists all five road-user types as prohibited. The Hebrew says the restriction applies only to the displayed types, at most three; the image contains alternative combinations. | No entry for the road-user types shown on the sign. Do not prohibit every listed type regardless of the displayed symbols. |
| 430 | FIX | אסורה פנית פרסה לימין, בפנייה הקרובה | ወደ ቀኝ ዩ-ተርን የተከለከለ | Rules 5,7: These retain the loan expression ዩ-ተርን, unlike the connector-based return-to-opposite-direction wording required by rule 5 and already used for 209–212. | No U-turn to the right / left respectively, expressed as returning to the opposite direction, preserving the prohibition. |
| 431 | FIX | אסורה פנית פרסה לשמאל, בפנייה הקרובה | ወደ ግራ ዩ-ተርን የተከለከለ | Rules 5,7: These retain the loan expression ዩ-ተርን, unlike the connector-based return-to-opposite-direction wording required by rule 5 and already used for 209–212. | No U-turn to the right / left respectively, expressed as returning to the opposite direction, preserving the prohibition. |
| 432 | ASK-OWNER | אסורה חניית רכב בדרך בצד שבו הוצב התמרור | ተሽከርካሪ ማቆም የተከለከለ | Rules 1,7: 432 uses ማቆም for parking. 433 pairs ማቆም and መቆም, but a causative/intransitive distinction does not by itself establish the required parking-versus-stopping distinction. This is safety-relevant and is not approved on spelling difference alone. | 432: no parking, on the side with the sign. 433: no stopping AND no parking, on that side. Have the owner/native reviewer confirm two unambiguous concepts and then apply them consistently. |
| 433 | ASK-OWNER | אסורה כל עצירה וחניה של רכב בדרך בצד שבו הוצב התמרור, אלא אם דרוש הדבר למילוי הוראות כל דין | ማንኛውንም ተሽከርካሪ ማቆም እና መቆም የተከለከለ | Rules 1,7: 432 uses ማቆም for parking. 433 pairs ማቆም and መቆም, but a causative/intransitive distinction does not by itself establish the required parking-versus-stopping distinction. This is safety-relevant and is not approved on spelling difference alone. | 432: no parking, on the side with the sign. 433: no stopping AND no parking, on that side. Have the owner/native reviewer confirm two unambiguous concepts and then apply them consistently. |
| 435 | ASK-OWNER | אזור אסור לחנית רכב שמשקלו הכולל המותר עולה על 10,000 ק"ג | ከ10,000 ኪ.ግ በላይ ክብደት ላለው ተሽከርካሪ ማቆም የተከለከለ | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 436 | ASK-OWNER | קצה האזור האסור לחניית רכב מסחרי שמשקלו הכולל המותר עולה על 10,000 ק"ג | ከ10,000 ኪ.ግ በላይ ክብደት ላለው የንግድ ተሽከርካሪ ማቆም የተከለከለበት ዞን መጨረሻ | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 501 | FIX | כביש או נתיב או שול לתחבורה ציבורית: הנסיעה בכביש או בנתיב, או בשול מותרת ל – סומנה צלמית רכבת מקומית (ס-43) – לרכבת מקומית; סומנה צלמית אוטובוס (ס-44) בצבע צהוב – לאוטובוס הנוסע בקו שירות; סומנה צלמית אוטובוס (ס-44) בצבע לבן – לכל אוטובוס; סומנה צלמית מונית (ס-45) – לכל מונית; סומנה צלמית אופנוע (ס-48) – לאופנוע; סומנה ספרה בצירוף הסימון "+" – לרכב – למעט רכב מסחרי שמשקלו הכולל המותר עולה על 3.5 טון – המסיע לפחות כמה נוסעים, לרבות הנהג, הנקוב בתמרור; (2) תמרור 502; צוינו אחד או יותר מסוגי הרכב בתמרור, יחולו הוראות התמרור על פי המצוין בו. עצירה או חנייה של כלי רכב בנתיב אסורה אלא אם צוין אחרת. | ለሕዝብ ማመላለሻ መንገድ ወይም መስመር | Rules 1,2: The short name omits the shoulder from road/lane/shoulder. The 3.5-ton commercial-vehicle exclusion from the occupancy-based permission is also missing under the brief’s strict numeric rule. | Public-transport road, lane or shoulder. If including the numeric qualification, attach above 3.5 tonnes specifically to the commercial-vehicle exclusion from the occupancy-based permission, not to all permitted public transport. |
| 503 | FIX | נתיב לתחבורה ציבורית: קו קטעים כפול משולב עם מעוינים בצבע צהוב. הנסיעה בנתיב מותרת לרכב על פי המצוין בתמרור 230 או בתמרור 501 או רכב הפונה בצומת הקרוב, על פי סימון 514. עצירה או חניית כלי רכב בנתיב אסורים, אלא אם צוין אחרת | ለሕዝብ ማመላለሻ መስመር | Rules 2: Public-transport lane alone omits the double broken yellow line/diamonds that distinguish this marking from 515 and 516. | Public-transport lane marked by double broken yellow lines with diamonds. |
| 504 | FIX | התנועה בכוון המסומן בחץ הלבן מותרת לכל כלי הרכב. לרכב שנסיעתו הותרה לפי תמרור 501 מותרת גם הנסיעה בכוון הנגדי | በነጭ ቀስት አቅጣጫ መጓዝ ይፈቀዳል | Rules 1,2: Only permission in the white-arrow direction is retained; the opposing direction for authorized public transport is the defining feature. | White-arrow direction for all vehicles; opposite direction also allowed for vehicles authorized by sign 501. |
| 511 | FIX | מקום עצירה לסוג מסויים של רכב ליד אבני שפה צבועות אדום-צהוב: אסורה עצירה, למעט סוג הרכב שעצירתו הותרה על ידי תמרור לשם העלאה והורדת נוסעים בלבד | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ | Rules 2,7: Identical to 513; red-yellow kerb and passenger boarding/alighting scope are missing. | Stopping place for the specified vehicle type at a red-yellow kerb, for boarding/alighting only. |
| 512 | FIX | מקום עצירה לסוג מסויים של רכב במקום בו קיים מפרץ ואבני שפה: אסורה עצירה בתוך המפרץ או ליד קו הקטעים, למעט סוג הרכב שעצירתו הותרה ע"י תמרור, לשם העלאה והורדת נוסעים בלבד | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ በመጠባበቂያ ቦታ | Rules 1,2,7: The shortened wording describes a waiting place rather than clearly identifying the road bay with kerbs, and omits boarding/alighting only. | Stopping bay with kerbs for the specified vehicle type, for boarding/alighting only. |
| 513 | FIX | מקום עצירה לסוג מסויים של רכב במקום בו אין מפרץ ואבן השפה אינה מסומנת או אין אבן שפה: אסורה עצירה למעט סוג הרכב שעצירתו הותרה על ידי תמרור לשם העלאה והורדת נוסעים בלבד | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ | Rules 2,7: Identical to 511; the no-bay and unmarked/no-kerb setting is lost. | Stopping place for the specified vehicle type without a bay, with an unmarked kerb or no kerb, for boarding/alighting only. |
| 514 | FIX | כיווני הנסיעה המותרים בנתיב – חצים על פני הדרך בצבע צהוב, עם או בלי חצים בצבע לבן או כתום: החץ הצהוב מורה לכלי הרכב המצוינים בתמרור 501 בלבד: היכנס לצומת ועבור בו רק בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; אם לא הוצב תמרור 501: החץ הצהוב מורה לרכב ציבורי בקווי שירות בלבד: היכנס לצומת ועבור בו בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; סומן גם חץ בצבע לבן או כתום, החץ מורה לכל כלי הרכב: היכנס לצומת ועבור בו רק בכיוון החץ שסומן בנתיב שממנו נכנסת לצומת; חצים בצבע כתום מורים על כיווני נסיעה אל או בתוך אתר עבודה | በመንገዱ ላይ የተፈቀዱ የማሽከርከር አቅጣጫዎች | Rules 1,2,7: The name says directions on the road, dropping the lane and the yellow arrows/public-transport distinction from 813/926. | Permitted directions in the lane: yellow arrows for the designated public transport, with other-colour arrows where shown. |
| 516 | FIX | נתיב לתחבורה ציבורית, חציה אל ומהנתיב: קו קטעים ליד קו רציף משולב עם מעוינים בצבע צהוב; חציית הקווים מותרת רק אם חציית קו הקטעים קודמת לחציית הקו הרציף; הנסיעה בנתיב מותרת לרכב על פי המצוין בתמרור 230 או בתמרור 501 או רכב הפונה בצומת הקרוב, על פי סימון 514; עצירה או חניה של כלי רכב בנתיב אסורים, אלא אם כן צוין אחרת. | ለሕዝብ ማመላለሻ መስመር, ወደ እና ከመስመሩ ማቋረጥ | Rules 1,2: Crossing into and out of the lane omits the broken/solid line arrangement and can sound unrestricted. | Public-transport lane with a broken line beside a solid line; crossing only from the broken-line side. |
| 602 | ASK-OWNER | הכוונה ליעדים או ליעדי ביניים מעל הנתיבים לפני מחלף בדרך שאינה עירונית. בדרך מהירה – באותיות לבנות על רקע כחול, בדרכים אחרות – באותיות לבנות על רקע ירוק | ከከተማ ውጭ ባለው መንገድ ላይ ከመለዋወጫ በፊት ወደ መድረሻዎች አቅጣጫ | Rules 3: These names have 10, 11 and 12 whitespace-delimited words respectively and read as long literal descriptions. Meaning is substantially retained, but spoken brevity needs owner review. | 602: overhead destination guidance before a non-urban interchange. 603: overhead destination guidance before a non-urban junction. 604: advance destination guidance before a non-urban junction. Retain these distinctions when shortening. |
| 603 | ASK-OWNER | הכוונה ליעדים או ליעדי ביניים מעל הנתיבים לפני צומת בדרך שאינה עירונית. הכוונה לאתרי תיירות – באותיות לבנות על רקע חום | ከከተማ ውጭ ባለው መንገድ ላይ ከመስቀለኛ መንገድ በፊት ወደ መድረሻዎች አቅጣጫ | Rules 3: These names have 10, 11 and 12 whitespace-delimited words respectively and read as long literal descriptions. Meaning is substantially retained, but spoken brevity needs owner review. | 602: overhead destination guidance before a non-urban interchange. 603: overhead destination guidance before a non-urban junction. 604: advance destination guidance before a non-urban junction. Retain these distinctions when shortening. |
| 604 | ASK-OWNER | הכוונה מוקדמת ליעדים או ליעדי ביניים לפני צומת בדרך שאינה עירונית. הכוונה לאתרי תיירות – באותיות לבנות על רקע חום | ከከተማ ውጭ ባለው መንገድ ላይ ከመስቀለኛ መንገድ በፊት ወደ መድረሻዎች ቀደምት አቅጣጫ | Rules 3: These names have 10, 11 and 12 whitespace-delimited words respectively and read as long literal descriptions. Meaning is substantially retained, but spoken brevity needs owner review. | 602: overhead destination guidance before a non-urban interchange. 603: overhead destination guidance before a non-urban junction. 604: advance destination guidance before a non-urban junction. Retain these distinctions when shortening. |
| 613 | FIX | הגדרת תנועות בנתיבים: בדרך מהירה – בחצים לבנים על רקע כחול, בדרכים אחרות – בחצים לבנים על רקע ירוק. חץ בצבע צהוב – נתיב לתחבורה ציבורית כמפורט בתמרור 501 צוין בנתיב סמל ס-47, מותר לרכב מסחרי או לרכב עבודה שמשקלו הכולל המותר עולה על 10,000 ק"ג לחצות את הצומת גם מאותו נתיב, על פי החץ המסומן בו | በመስመሮች ውስጥ ያሉ እንቅስቃሴዎች ፍቺ | Rules 1,2,3: Literal definition of movements in lanes does not clearly name permitted lane directions. The 10,000-kg conditional threshold is also missing under rule 2. | Permitted movements/directions by lane. If retaining the weight clause, it applies to commercial/work vehicles above 10,000 kg where symbol S-47 is shown; do not turn it into a general lane-weight restriction. |
| 619 | FIX | שינוי במספר הנתיבים: מספר הנתיבים בכביש הולך וגדל מימין; חץ בצבע צהוב מציין נתיב לתחבורה ציבורית בלבד | በቀኝ በኩል የመንገዶች ብዛት መጨመር | Rules 1,2,7: መንገዶች means roads here, while the source and picture concern lanes. The work-zone counterparts 910–913 already use መስመሮች. | Number of LANES increases on the right (619), increases on the left (620), decreases on the right (621), decreases on the left (622). |
| 620 | FIX | שינוי במספר הנתיבים: מספר הנתיבים בכביש הולך וגדל משמאל; חץ בצבע צהוב מציין נתיב לתחבורה ציבורית בלבד | በግራ በኩል የመንገዶች ብዛት መጨመር | Rules 1,2,7: መንገዶች means roads here, while the source and picture concern lanes. The work-zone counterparts 910–913 already use መስመሮች. | Number of LANES increases on the right (619), increases on the left (620), decreases on the right (621), decreases on the left (622). |
| 621 | FIX | שינוי במספר הנתיבים: מספר הנתיבים בכביש הולך וקטן מימין; חץ בצבע צהוב מציין נתיב לתחבורה ציבורית בלבד | በቀኝ በኩል የመንገዶች ብዛት መቀነስ | Rules 1,2,7: መንገዶች means roads here, while the source and picture concern lanes. The work-zone counterparts 910–913 already use መስመሮች. | Number of LANES increases on the right (619), increases on the left (620), decreases on the right (621), decreases on the left (622). |
| 622 | FIX | שינוי במספר הנתיבים: מספר הנתיבים בכביש הולך וקטן משמאל; חץ בצבע צהוב מציין נתיב לתחבורה ציבורית בלבד | በግራ በኩል የመንገዶች ብዛት መቀነስ | Rules 1,2,7: መንገዶች means roads here, while the source and picture concern lanes. The work-zone counterparts 910–913 already use መስመሮች. | Number of LANES increases on the right (619), increases on the left (620), decreases on the right (621), decreases on the left (622). |
| 626 | ASK-OWNER | חניה לכלי רכב, זולת – (1) בתחנת אוטובוסים ציבוריים או בתחנת רכבת מקומית שסומנו בתמרורים 505 או 506, בהתאמה; (2) אם נאסרה החניה על פי תמרור 507, 509, 510, 511, 512, 513, 818 או 820; צוין סוג כלי רכב מתחת לתמרור – חניה לכלי רכב מהסוג המצויין בלבד | ለተሽከርካሪዎች ማቆሚያ | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 627 | FIX | מותרת החניה על המדרכה לרכב שמשקלו הכולל המותר עד 2200 ק"ג, בהתאם למסומן ובלי לחסום את המעבר ברוחב סביר להולכי רגל ולכסא גלגלים לנכה, זולת – (1) בתחנת אוטובוסים ציבוריים או בתחנת רכבת מקומית שסומנו בתמרורים 505 או 506, בהתאמה; (2) אם נאסרה החניה על פי תמרור 507, 509, 510, 511, 512, 513, 818 או 820; | በእግረኛ መንገድ ላይ ማቆም ይፈቀዳል | Rules 1,2,7: The permission to park on the pavement loses the 2,200-kg maximum permitted gross weight and needs the resolved parking term. | Pavement parking for vehicles with permitted gross weight up to 2,200 kg, as marked and with pedestrian/wheelchair passage left clear. |
| 628 | ASK-OWNER | קצה המקום או הקטע המותר לחניה על הכביש, או על המדרכה, על פי תמרור 626 או 627 | በመንገድ ላይ ወይም በእግረኛ መንገድ ላይ ለማቆም የተፈቀደው ቦታ መጨረሻ | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 629 | FIX | תמרור לאזהרה או להודעה רק למסר שלגביו אין תמרור בלוח התמרורים ובצמוד לו. | ለሌለ መልእክት ማስጠንቀቂያ ወይም ማስታወቂያ | Rules 1,3: ለሌለ መልእክት makes the message itself absent, instead of saying no dedicated sign exists for that message. The Hebrew is also truncated; see source errors. | Warning or information message for which there is no dedicated sign. |
| 631 | FIX | לאורך הקטע שלפניך במטרים, יחול האמור בתמרור שמעליו | የምልክቱ ርዝመት በሜትሮች | Rules 1: The name says the length of the sign in metres, not the length of the road section to which it applies. | Length in metres of the section ahead covered by the sign above. |
| 632 | FIX | המסר בתמרור שמעליו מיועד לפונה בכוון החץ | የምልክቱ መልእክት በቀስት አቅጣጫ | Rules 1,2: Message in the arrow direction loses the restriction to drivers turning in that direction. | The sign above applies to traffic turning in the arrow’s direction. |
| 636 | FIX | כביש חד-סטרי לרכב מנועי: לאופניים, כהגדרתם בסעיף 1 להודעה זו, מותרת הנסיעה גם בכיוון הנגדי. | ለሞተር ተሽከርካሪዎች አንድ አቅጣጫ መንገድ | Rules 1,2: The bicycle permission in the opposing direction is omitted; this is what distinguishes the sign from an ordinary one-way road. | One-way for motor vehicles; bicycles may also travel in the opposite direction. |
| 711 | ASK-OWNER | אור לבן מלבני מוטה: התקדם. סע ימינה, לכיוון הנטיה של קצהו העליון של האור הלבן המלבני. פנית פרסה מותרת בכוון הנטיה אלא אם הדבר נאסר על ידי תמרור אחר. אם האור מהבהב – האות מסתיים ועומד להופיע האות 716 | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ቀኝ ቀጥል | Rules 1,3: የተዘበራረቀ can suggest disordered/crooked rather than a clean tilted bar. Direction is correct; the geometric adjective needs native confirmation. | A tilted rectangular white signal: proceed right / left respectively, in the direction of the upper end of the bar. |
| 712 | ASK-OWNER | אור לבן מלבני מוטה: התקדם. סע שמאלה, לכיוון הנטיה של קצהו העליון של האור הלבן המלבני. פנית פרסה מותרת בכוון הנטיה אלא אם הדבר נאסר על ידי תמרור אחר. אם האור מהבהב – האות מסתיים ועומד להופיע האות 716 | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ግራ ቀጥል | Rules 1,3: የተዘበራረቀ can suggest disordered/crooked rather than a clean tilted bar. Direction is correct; the geometric adjective needs native confirmation. | A tilted rectangular white signal: proceed right / left respectively, in the direction of the upper end of the bar. |
| 713 | FIX | אור לבן מלבני אנכי ואור לבן מלבני מוטה: התקדם. סע ישר או ימינה, לכוון הנטיה של קצהו העליון של האור הלבן המלבני המוטה. פנית פרסה מותרת בכוון הנטיה אלא אם הדבר נאסר ע"י תמרור אחר. אם האור מהבהב – האות מסתיים ועומד להופיע האות 716 | ቀጥታ ወይም ወደ ቀኝ ያሽከርክሩ | Rules 1,2: The names retain directions but drop the white rectangular-light identity. 713/714 become exact duplicates of blue mandatory-arrow signs 201/202. | White rectangular signal bars: straight or right (713), straight or left (714), straight/right/left (715). Keep the signal identity and permitted directions. |
| 714 | FIX | אור לבן מלבני אנכי ואור לבן מלבני מוטה: התקדם. סע ישר או שמאלה, לכוון הנטיה של קצהו העליון של האור הלבן המלבני המוטה. פנית פרסה מותרת בכוון הנטיה אלא אם הדבר נאסר ע"י תמרור אחר. אם האור מהבהב – האות מסתיים ועומד להופיע האות 716 | ቀጥታ ወይም ወደ ግራ ያሽከርክሩ | Rules 1,2: The names retain directions but drop the white rectangular-light identity. 713/714 become exact duplicates of blue mandatory-arrow signs 201/202. | White rectangular signal bars: straight or right (713), straight or left (714), straight/right/left (715). Keep the signal identity and permitted directions. |
| 715 | FIX | אור לבן מלבני אנכי ואורות לבנים מלבניים מוטים: התקדם. סע ישר, ימינה או שמאלה, פנית פרסה מותרת אלא אם הדבר נאסר בתמרור אחר. אם האור מהבהב – האות מסתיים ועומד להופיע האות 716 | ቀጥታ፣ ወደ ቀኝ ወይም ወደ ግራ ያሽከርክሩ | Rules 1,2: The names retain directions but drop the white rectangular-light identity. 713/714 become exact duplicates of blue mandatory-arrow signs 201/202. | White rectangular signal bars: straight or right (713), straight or left (714), straight/right/left (715). Keep the signal identity and permitted directions. |
| 721 | FIX | צורת אופניים בצבע ירוק: מותר לחצות את הכביש בזהירות | አረንጓዴ የብስክሌት ምልክት | Rules 1,2: Green bicycle symbol alone drops the fact that this is a signal permitting careful crossing, unlike the explicit stop/cross wording of 718–720. | Green bicycle signal: crossing is permitted with care. |
| 722 | FIX | אור אדום מהבהב כפול לפני מפגש מסילת ברזל: עצור לפני קו העצירה, באין קו עצירה, עצור לפני המחסום הקרוב (תמרור 404) ובאין מחסום, במרחק 4 מ' לפחות מפס המסילה הקרוב. אסור לחצות את המסילה עד להפסקת האור האדום המהבהב הכפול ועלית המחסום. אם אינך יכול לעצור בבטחה לפני המפגש כמפורט לעיל או נכנסת אליו, השלם את מעבר המפגש ופנהו מיד | ከባቡር መስመር በፊት ድርብ ብልጭ ድርግም የሚል ቀይ መብራት: ይቁሙ | Rules 2,3: The 4-metre minimum stopping distance, where no stop line or barrier exists, is omitted. The name is already 10 words. | Double flashing red railway signal: stop. Under the brief’s strict measurement rule retain at least 4 m from the nearest rail ONLY if there is no stop line or barrier; do not make 4 m the universal stopping point. |
| 810 | ASK-OWNER | קו עצירה – קו לבן לרוחב הנתיב: מקום עצירת הרכב או בעל החיים, לפני הקו וסמוך לו, כאשר יש חובת עצירה | የማቆሚያ መስመር: በመስመሩ ስፋት ላይ ያለ ነጭ መስመር | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 811 | FIX | מעבר חציה להולכי רגל: חולק מעבר חציה רכב לשניים, חצה בחצי הימני של מעבר החציה | የእግረኛ ማቋረጫ: በእግረኛ ማቋረጫው ቀኝ በኩል ይለፉ | Rules 1: The conditional instruction for a wide crossing split into two becomes an unconditional instruction to use the right side. Hebrew source also says רכב instead of רחב. | Pedestrian crossing. If retaining the right-half instruction, state that it applies when a wide crossing is divided into two. |
| 815 | FIX | איי תנועה (בצורות שונות), מסומנים על הכביש בצבע לבן: אסור לעבור, לעצור או לחנות עליהם | በመንገድ ላይ ምልክት የተደረገባቸው የትራፊክ ደሴቶች | Rules 2: The white/orange distinction is omitted; 928 also drops that these are painted road markings. | Traffic islands painted on the roadway in white (815) / orange (928). Preserve the marking identity and colour. |
| 816 | ASK-OWNER | אבני שפה צבועות שחור-לבן: להבלטה והדגשה של מדרכות, מפרדות ואיי תנועה בנויים | ጥቁር-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Rules 1,7: የእግረኛ መንገድ ድንጋዮች literally describes pedestrian-path stones and may be heard as paving stones rather than kerbstones. Colour is retained correctly. | Kerbstones: black-white (816), alternating blue paid-parking marking (817), red-white no stopping or parking (818). Confirm a clear kerb term. Colour-based names are acceptable headlines; the detailed parking rules remain in the explanation. |
| 817 | ASK-OWNER | אבני שפה צבועות לסירוגין בצבע כחול: החנייה מותרת בתשלום על הכביש שליד אבני השפה או על המדרכה על פי הוראות תמרור 439 בצמוד ומתחת לתמרורים 626 או 627 | በሰማያዊ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Rules 1,7: የእግረኛ መንገድ ድንጋዮች literally describes pedestrian-path stones and may be heard as paving stones rather than kerbstones. Colour is retained correctly. | Kerbstones: black-white (816), alternating blue paid-parking marking (817), red-white no stopping or parking (818). Confirm a clear kerb term. Colour-based names are acceptable headlines; the detailed parking rules remain in the explanation. |
| 818 | ASK-OWNER | אבני שפה צבועות אדום-לבן: אסורה כל עצירה או חניה של רכב בכביש שליד אבני השפה, אלא אם הדבר דרוש למילוי הוראות כל דין | ቀይ-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች | Rules 1,7: የእግረኛ መንገድ ድንጋዮች literally describes pedestrian-path stones and may be heard as paving stones rather than kerbstones. Colour is retained correctly. | Kerbstones: black-white (816), alternating blue paid-parking marking (817), red-white no stopping or parking (818). Confirm a clear kerb term. Colour-based names are acceptable headlines; the detailed parking rules remain in the explanation. |
| 819 | FIX | מקומות חניה לכלי רכב מסומנים בצבע לבן: החניה במקום תהיה רק בתחומי השטח המסומן על פני הדרך. הוצב תמרור 627 וסומן שטח על המדרכה, מותר לרכב פרטי, פרטי דו-שימושי ומסחרי שמשקלו הכולל המותר הוא עד 2200 ק"ג, לחנות על המדרכה בתחום השטח המסומן על פניה, מבלי לחסום את המעבר להולכי רגל ולכסא גלגלים לנכים | በነጭ ምልክት የተደረገባቸው የተሽከርካሪ ማቆሚያ ቦታዎች | Rules 2,7: The 2,200-kg qualification for the conditional pavement-parking case is omitted under the brief’s measurement rule. | White-marked parking spaces. If including pavement parking under sign 627, retain the up-to-2,200-kg permitted gross-weight condition; it does not apply to every ordinary marked parking space. |
| 820 | ASK-OWNER | מקום אסור לחניה מסומן בצבע לבן: אסורה חניה בתוך השטח המסומן | በነጭ ምልክት የተደረገበት ማቆም የተከለከለ ቦታ | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 903 | FIX | אזהרה והדרכה בעקומה חדה: האט והמשך רק בכוון המסומן בחצים שעל התמרור, עבור לפני התמרור | በሹል ኩርባ ላይ ማስጠንቀቂያ | Rules 1,2: Warning is retained but guidance is omitted, as in 107/108. | Warning and guidance at a sharp curve in a work zone; follow the indicated direction before the board. Confirm ሹል with the owner. |
| 904 | FIX | אזהרה והדרכה בצומת קמץ: האט והמשך רק בכוונים המסומנים בחצים שעל התמרור, עבור לפני התמרור | በቲ-መገናኛ ላይ ማስጠንቀቂያ | Rules 1,2: Warning is retained but guidance is omitted, as in 118. | Warning and guidance at a T-junction in a work zone. Apply the owner’s approved T-junction terminology. |
| 915 | FIX | תמרור לאזהרה, להוריה, לאיסור או להודעה רק למסר שלגביו אין תמרור בלוח התמרורים. הוצב התמרור מתחת ובצמוד לתמרור אחר – יחול האמור בו בתוספת לתמרור שמעליו ובצמוד לו | ተጨማሪ መረጃ ምልክት | Rules 1,2: Additional information narrows a sign that may convey warning, instruction or prohibition as well as information. It can also stand on its own. | Work-zone sign for a warning, instruction, prohibition or information message without a dedicated sign. |
| 925 | ASK-OWNER | קו עצירה – קו כתום לרוחב הנתיב: מקום עצירת הרכב או בעל החיים, לפני הקו וסמוך לו, כאשר יש חובת עצירה | ብርቱካናማ የማቆሚያ መስመር | Rules 7: Part of the unresolved parking/stopping terminology family: the same ማቆም / ማቆሚያ root is used for parking and for the stop line. Confirm the meaning in context after resolving 432/433. | 435/436: parking ban above 10,000 kg / end of the commercial-vehicle parking-ban zone. 626: parking. 628: end of permitted parking. 810/925: stop line, white/orange respectively. 820: no-parking area, not a general no-stopping area. |
| 928 | FIX | איי תנועה (בצורות שונות), מסומנים על הכביש בצבע כתום: אסור לעבור, לעצור או לחנות עליהם | የትራፊክ ደሴቶች | Rules 2: The white/orange distinction is omitted; 928 also drops that these are painted road markings. | Traffic islands painted on the roadway in white (815) / orange (928). Preserve the marking identity and colour. |
| 935 | FIX | מפרץ לעצירה במצב חירום באתר עבודה. | ለአደጋ ጊዜ ማቆሚያ መግቢያ | Rules 1,2: The name ends with entrance rather than clearly identifying an emergency stopping bay and loses the work-zone distinction from 637. | Emergency stopping bay in a work zone. |

## Hebrew source errors

Source-only problems do not automatically make a correct headline FIX. Locations refer to rows[sign_number].text in official_wording_parsed.json.

| Sign | Evidence | Conclusion |
|---|---|---|
| 127 | JSON begins בדרך שלפניך. before the congestion wording; CSV explicitly records removing contamination. | Apparent validity-column fragment already removed in CSV. Current headline fits image. |
| 128 | Both files reference 639 with arrows, while 639 in this dataset is an education-institutions zone. | Suspect source/cross-reference error. Internal inconsistency is confirmed; exact intended reference was not independently established. Do not silently substitute a number. |
| 210 | Both files insert הרמזור על התנועות within the public-transport direction sentence. | Apparent column contamination. Government indexed 2022 table places signal-applicability text in the validity column. U-turn headline remains correct. |
| 420 | JSON inserts עד לצומת הקרוב between על and יותר משני גלגלים; CSV records removing it. | Grammatical/column contamination already repaired in CSV. Keep the cleanup trace. |
| 501 | Both files insert (2) תמרור 502; inside the permission description. | Apparent validity/termination-column contamination. Recover the complete meaning cell from the original. |
| 629 | Both files end ובצמוד לו. after the first sentence, without the intervening conditional text. | Truncated source. Government indexed text includes the condition concerning placement below another sign and its supplemental effect. |
| 705 | Both files say אצור. | Typographical/transcription error; government indexed text has עצור. Proposed stop command is correct. |
| 811 | Both files say מעבר חציה רכב. | Typographical/transcription error; government indexed text has רחב. The condition concerns a wide crossing divided into two. |

Targeted corroboration: [Government 2022 guidelines, indexed table for 209–212](https://www.gov.il/BlobFolder/news/2020_tamrur/he/תקנות%20והנחיות%20להצבת%20תמרורים.pdf) supports the 210 column-mixing diagnosis. [Government 2024 guidelines, indexed passages for 629, 705 and 811](https://www.gov.il/BlobFolder/policy/2020_tamrur_0/he/תקנות%20והנחיות%20להצבת%20תמרורים%202024.pdf) support the truncation and typo findings. These are targeted historical corroborations, not verification of the entire latest legal notice. Direct document retrieval was blocked.

I did not call the suffix פ in 724פ (802/919) corruption: it can identify a sign variant. I also did not rewrite the differing vehicle scopes in 435/436 merely to make the pair match. Sign 218's incorrect 60 is an error in the proposed name, not its Hebrew source.

The previous Gemini text is not an authority: 107/108 describe a narrow road instead of a sharp curve; 512/935 use a sea-bay sense; 224 previously refers to drivers rather than bicycles; 624/625 previously suggest an endless road. Some short names improved on those mistakes, but the roads-versus-lanes error survives in 619–622.

## Recurring terminology

The following are observed candidate terms, not newly approved replacement wording.

| Concept | Candidate terms | Assessment |
|---|---|---|
| Right / left | ቀኝ / ግራ | Consistent; mirror directions checked. |
| Straight | ቀጥታ | Consistent in movement commands. |
| Before / after | በፊት / በኋላ | Correctly distinguishes 204/205 from 206/207. |
| Drive | ያሽከርክሩ; ማሽከርከር | Approved root used; listed banned forms absent from names. |
| Road | መንገድ; መንገዶች | Incorrect for lane counts in 619–622. |
| Lane / painted line | መስመር; መስመሮች | Context must distinguish a lane from a marking. 910–913 preserve lane counts better than 619–622. |
| Sharp curve | ሹል ኩርባ | Interpretable meaning; spoken naturalness requires owner/native judgment, not an asserted native verdict. |
| T-junction | ቲ-መገናኛ | Not Hebrew transliteration, but letter-based wording needs comprehension review for the audience. |
| Roundabout | ክብ ቅርጽ ያለው መገናኛ (121); ክብ ማዞሪያ (303) | Standardize an owner-approved spoken concept. |
| Warning / guidance | ማስጠንቀቂያ | Guidance component omitted in 107/108/118/903/904; restore both functions. |
| Prohibition / permission | የተከለከለ; የተከለከለ ነው; ይፈቀዳል | Short/copular forms can both work. 216 is a meaning reversal, not a suffix-style issue. |
| Stop command | ቁም; አቁም; ይቁሙ | Register/voice varies; variation alone is not a meaning error. Optional spoken-style harmonization. |
| Parking / stopping | ማቆም; መቆም; ማቆሚያ | Required distinction unresolved in 432/433 and related rows. Two spellings do not establish two clear traffic concepts. |
| Kerb | የእግረኛ መንገድ ድንጋዮች | Confirm kerbstones rather than paving stones is understood. |
| U-turn | Return-to-opposite-direction phrase in 209–212; ዩ-ተርን in 430/431 | Apply connector-based rule consistently to prohibitions too. |
| Broken / solid | የተቆራረጠ; ቀጣይ / ቀጣይነት ያለው | Generally distinguish forms; harmonize concise style during approved regeneration. |
| Colours | ነጭ; ቢጫ; ቀይ; አረንጓዴ; ብርቱካናማ | Generally correct; restore white/orange distinction in 815/928. |
| White rectangular signal | አራት ማዕዘን ነጭ መብራት | Restore signal identity in 713–715; check tilted-bar adjective in 711/712. |
| End | መጨረሻ | Generally preserved correctly. |
| Pedestrian crossing | ማቋረጫ / መሻገሪያ | Optional style harmonization; correct 811's conditional instruction first. |

## סיכום לבעל האפליקציה

נבדקו כל 276 השורות ו־275 התמונות המקומיות; לתמרור 303 לא נמצאה תמונה.
הטבלה עדיין אינה מאושרת: 202 שורות תקינות בבדיקה, 44 דורשות תיקון ו־30 דורשות הכרעה שלך עם דובר אמהרית.
הטעויות כוללות איסור כניסה שגוי ב־216, מספר 60 במקום 55 ב־218 ובלבול בין כבישים לנתיבים ב־619–622.
צריך להחזיר הבדלים שנעלמו בין תמרורים, למשל בסימוני תחבורה ציבורית וברמזורים הלבנים.
נדרשת הכרעה לשונית בעיקר לגבי חניה ועצירה, צומת קמץ, עקומה חדה ואבני שפה.
יש גם שיבושים במקור העברי; התרגום הישן אינו הוכחה לנכונות.
הדרישה לשמור מגבלות מספריות מתנגשת בחלק מהשורות עם שם קצר; אין להוסיף מספר בלי התנאי ששייך אליו.
תמרור 101 נשאר כפי שאישרת. לא שיניתי את שמות התמרורים או את נתוני האפליקציה.
יש לתקן בתהליך המאושר, לקבל הכרעות לשוניות ולבדוק שוב לפני הכנסת הטבלה המלאה לאפליקציה.

## Complete row-by-row verdict register

Each data record appears exactly once. CSV row counts the header as row 1. OK rows were reviewed individually; they were not automatically passed by the mechanical scan.

| CSV row | Sign | Verdict | Proposed name reviewed |
|---:|---:|---|---|
| 2 | 101 | OK | ያልተስተካከለ መንገድ |
| 3 | 102 | ASK-OWNER | ሹል ኩርባ ወደ ቀኝ |
| 4 | 103 | ASK-OWNER | ሹል ኩርባ ወደ ግራ |
| 5 | 104 | OK | ኩርባ ቀኝ ከዚያም ግራ |
| 6 | 105 | OK | ኩርባ ግራ ከዚያም ቀኝ |
| 7 | 106 | OK | ጠመዝማዛ መንገድ |
| 8 | 107 | FIX | ሹል ኩርባ ማስጠንቀቂያ |
| 9 | 108 | FIX | ሹል ኩርባ ማስጠንቀቂያ |
| 10 | 109 | OK | መንገዱ እየጠበበ ይሄዳል |
| 11 | 110 | OK | መንገዱ ከቀኝ እየጠበበ ይሄዳል |
| 12 | 111 | OK | መንገዱ ከግራ እየጠበበ ይሄዳል |
| 13 | 112 | OK | ጠባብ መተላለፊያ ወይም መሰናክል |
| 14 | 113 | OK | ከፍታ መሰናክል: ከ 4.80 ሜትር በታች |
| 15 | 114 | FIX | የመንገድ መገናኛ |
| 16 | 115 | ASK-OWNER | ቲ-መገናኛ: ወደ ቀኝ |
| 17 | 116 | ASK-OWNER | ቲ-መገናኛ: ወደ ግራ |
| 18 | 117 | ASK-OWNER | ቲ-መገናኛ |
| 19 | 118 | FIX | ቲ-መገናኛ ማስጠንቀቂያ |
| 20 | 119 | ASK-OWNER | ቲ-መገናኛዎች: ቀኝ ከዚያም ግራ |
| 21 | 120 | ASK-OWNER | ቲ-መገናኛዎች: ግራ ከዚያም ቀኝ |
| 22 | 121 | OK | ክብ ቅርጽ ያለው መገናኛ |
| 23 | 122 | OK | የትራፊክ መብራት |
| 24 | 123 | OK | የቅድሚያ መንገድ ከቀኝ የጎን መንገድ ጋር ይዋሃዳል |
| 25 | 124 | OK | የቅድሚያ መንገድ ከግራ የጎን መንገድ ጋር ይዋሃዳል |
| 26 | 125 | OK | ከቀኝ ቅድሚያ መንገድ ጋር መዋሃድ |
| 27 | 126 | OK | ከግራ ቅድሚያ መንገድ ጋር መዋሃድ |
| 28 | 127 | OK | የትራፊክ መጨናነቅ |
| 29 | 128 | OK | የአካባቢ ባቡር መሻገሪያ |
| 30 | 129 | OK | የባቡር ሀዲድ መሻገሪያ |
| 31 | 130 | OK | የባቡር ሀዲድ መሻገሪያ በ300 ሜትር |
| 32 | 131 | OK | የባቡር ሀዲድ መሻገሪያ በ200 ሜትር |
| 33 | 132 | OK | የባቡር ሀዲድ መሻገሪያ በ100 ሜትር |
| 34 | 133 | ASK-OWNER | አንድ የባቡር ሀዲድ መሻገሪያ |
| 35 | 134 | ASK-OWNER | ከአንድ በላይ የባቡር ሀዲድ መሻገሪያ |
| 36 | 135 | OK | በአቅራቢያ የእግረኛ ማቋረጫ አለ |
| 37 | 136 | OK | በአቅራቢያ እግረኞች አሉ |
| 38 | 137 | OK | የብስክሌት ትራፊክ |
| 39 | 138 | OK | ዋሻ |
| 40 | 139 | FIX | የ"አቁም" ምልክት 302 |
| 41 | 140 | FIX | ቁልቁለት |
| 42 | 141 | OK | የመንሸራተት አደጋ |
| 43 | 142 | OK | ድንጋዮች ከቀኝ ይንከባለላሉ |
| 44 | 143 | OK | ድንጋዮች ከግራ ይንከባለላሉ |
| 45 | 144 | OK | የፍጥነት መቀነሻ |
| 46 | 145 | OK | ባለ ሁለት አቅጣጫ ትራፊክ |
| 47 | 146 | OK | እንስሳት |
| 48 | 147 | OK | የሚሻገር የሥራ ተሽከርካሪ ወይም ትራክተር |
| 49 | 148 | OK | የማመላከቻ እና የማስጠንቀቂያ ምሰሶ |
| 50 | 149 | OK | የማመላከቻ ወይም የመለያየት ምሰሶ |
| 51 | 150 | OK | አደገኛ ቦታ |
| 52 | 151 | OK | አደጋ |
| 53 | 152 | OK | የጎን ንፋስ |
| 54 | 153 | OK | ጥልቅ ውሃ |
| 55 | 201 | OK | ቀጥታ ወይም ወደ ቀኝ ያሽከርክሩ |
| 56 | 202 | OK | ቀጥታ ወይም ወደ ግራ ያሽከርክሩ |
| 57 | 203 | OK | ቀጥታ ያሽከርክሩ |
| 58 | 204 | OK | ወደ ቀኝ ያሽከርክሩ ከመንገድ ምልክቱ በፊት ይታጠፉ |
| 59 | 205 | OK | ወደ ግራ ያሽከርክሩ ከመንገድ ምልክቱ በፊት ይታጠፉ |
| 60 | 206 | OK | ወደ ቀኝ ያሽከርክሩ ከመንገድ ምልክቱ በኋላ ይታጠፉ |
| 61 | 207 | OK | ወደ ግራ ያሽከርክሩ ከመንገድ ምልክቱ በኋላ ይታጠፉ |
| 62 | 208 | OK | ወደ ቀኝ ወይም ወደ ግራ ያሽከርክሩ |
| 63 | 209 | OK | ቀጥታ ያሽከርክሩ ወይም ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ቀኝ ያሽከርክሩ |
| 64 | 210 | OK | ቀጥታ ያሽከርክሩ ወይም ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ግራ ያሽከርክሩ |
| 65 | 211 | OK | ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ቀኝ ያሽከርክሩ |
| 66 | 212 | OK | ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ግራ ያሽከርክሩ |
| 67 | 213 | OK | የተሰየመውን ቦታ ከቀኝ ወይም ከግራ ይለፉ |
| 68 | 214 | OK | የተሰየመውን ቦታ ከቀኝ በኩል ይለፉ |
| 69 | 215 | OK | የተሰየመውን ቦታ ከግራ በኩል ይለፉ |
| 70 | 216 | FIX | ወደ ፈጣን መንገድ መግባት የተከለከለ ነው |
| 71 | 217 | OK | የፈጣን መንገድ መጨረሻ |
| 72 | 218 | FIX | ለሞተር ተሽከርካሪዎች መንገድ በሰዓት 60 ኪ.ሜ |
| 73 | 219 | OK | ለሞተር ተሽከርካሪዎች ብቻ የሚሆን መንገድ |
| 74 | 220 | ASK-OWNER | የተቀናጀ መንገድ |
| 75 | 221 | ASK-OWNER | የተቀናጀ መንገድ መጨረሻ |
| 76 | 222 | OK | የትራፊክ ማረጋጊያ ዞን |
| 77 | 223 | OK | የትራፊክ ማረጋጊያ ዞን መጨረሻ |
| 78 | 224 | OK | ባለአንድ አቅጣጫ የብስክሌት መስመር |
| 79 | 225 | OK | የብስክሌት መስመር መጨረሻ |
| 80 | 226 | OK | የእግረኛ መንገድ ብቻ |
| 81 | 227 | OK | የብስክሌት መንገድ |
| 82 | 228 | OK | የጋራ የእግረኛ እና የብስክሌት መንገድ |
| 83 | 229 | OK | የተለየ የእግረኛ እና የብስክሌት መንገድ |
| 84 | 230 | OK | የክፍያ መንገድ ወይም መስመር |
| 85 | 231 | OK | የክፍያ መንገድ ወይም መስመር መጨረሻ |
| 86 | 301 | OK | ለመስቀለኛ መንገድ ትራፊክ ቅድሚያ ይስጡ |
| 87 | 302 | OK | ቁም! ለመስቀለኛ መንገድ ትራፊክ ቅድሚያ ይስጡ |
| 88 | 303 | FIX | ክብ ማዞሪያ: ቅድሚያ ይስጡ |
| 89 | 304 | ASK-OWNER | ቁም ተንቀሳቃሽ ምልክት |
| 90 | 305 | ASK-OWNER | በጥንቃቄ ይቀጥሉ ተንቀሳቃሽ ምልክት |
| 91 | 306 | OK | ለመንገድ አቋራጭ እግረኞች ቅድሚያ ይስጡ |
| 92 | 307 | OK | በጠባብ መንገድ ለሚመጣው ትራፊክ ቅድሚያ ይስጡ |
| 93 | 308 | OK | በጠባብ መንገድ ቅድሚያ አለዎት |
| 94 | 309 | OK | በመንገድ ላይ ቅድሚያ አለዎት |
| 95 | 310 | OK | የቅድሚያ መንገድ መጨረሻ |
| 96 | 401 | OK | መንገድ ዝግ ነው – በሁለቱም አቅጣጫዎች |
| 97 | 402 | OK | ለሁሉም ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 98 | 403 | FIX | መንገድ ዝግ ነው |
| 99 | 404 | OK | የባቡር ማገጃ |
| 100 | 405 | OK | ለሁሉም ሞተር ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 101 | 406 | OK | ከተጠቀሰው ክብደት በላይ ለሆኑ የንግድ ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 102 | 407 | OK | አደገኛ ቁሳቁስ ለሚያጓጉዙ ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 103 | 408 | OK | ባለ ሁለት ጎማ ተሽከርካሪዎች ሳይጨምር ለሞተር ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 104 | 409 | OK | ለሞተር ሳይክሎች መግባት የተከለከለ ነው |
| 105 | 410 | OK | ለስራ ተሽከርካሪዎች እና ለትራክተሮች መግባት የተከለከለ ነው |
| 106 | 411 | OK | ለእንስሳት መግባት የተከለከለ ነው |
| 107 | 412 | OK | ለብስክሌቶች መግባት የተከለከለ ነው |
| 108 | 413 | OK | እግረኞች መግባት የተከለከለ ነው |
| 109 | 414 | FIX | ለእግረኞች ለስራ ተሽከርካሪዎች ለትራክተሮች ለእንስሳት ወይም ለብስክሌቶች መግባት የተከለከለ ነው |
| 110 | 415 | OK | ከሚፈቀደው ክብደት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 111 | 416 | OK | ከሚፈቀደው ቁመት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 112 | 417 | OK | ከሚፈቀደው ስፋት በላይ ለሆኑ ተሽከርካሪዎች መግባት የተከለከለ ነው |
| 113 | 418 | OK | የመንጃ ትምህርት ክልከላ ዞን |
| 114 | 419 | OK | የመንጃ ትምህርት ክልከላ ዞን መጨረሻ |
| 115 | 420 | OK | ማለፍ የተከለከለ ነው |
| 116 | 421 | OK | የማለፍ ክልከላ መጨረሻ |
| 117 | 422 | OK | ከ 4 ቶን በላይ ለሆኑ ተሽከርካሪዎች ማለፍ የተከለከለ ነው |
| 118 | 423 | OK | የማለፍ ክልከላ መጨረሻ |
| 119 | 424 | OK | የከተማ መንገዶች ዞን |
| 120 | 425 | OK | የከተማ መንገዶች ዞን መጨረሻ |
| 121 | 426 | OK | ከተጠቀሰው ፍጥነት በላይ ማሽከርከር የተከለከለ ነው |
| 122 | 427 | OK | የልዩ ፍጥነት ክፍል መጨረሻ |
| 123 | 428 | OK | ወደ ቀኝ መታጠፍ የተከለከለ |
| 124 | 429 | OK | ወደ ግራ መታጠፍ የተከለከለ |
| 125 | 430 | FIX | ወደ ቀኝ ዩ-ተርን የተከለከለ |
| 126 | 431 | FIX | ወደ ግራ ዩ-ተርን የተከለከለ |
| 127 | 432 | ASK-OWNER | ተሽከርካሪ ማቆም የተከለከለ |
| 128 | 433 | ASK-OWNER | ማንኛውንም ተሽከርካሪ ማቆም እና መቆም የተከለከለ |
| 129 | 434 | OK | የምልክት 432, 433 መመሪያዎች መጨረሻ |
| 130 | 435 | ASK-OWNER | ከ10,000 ኪ.ግ በላይ ክብደት ላለው ተሽከርካሪ ማቆም የተከለከለ |
| 131 | 436 | ASK-OWNER | ከ10,000 ኪ.ግ በላይ ክብደት ላለው የንግድ ተሽከርካሪ ማቆም የተከለከለበት ዞን መጨረሻ |
| 132 | 437 | OK | ለአካል ጉዳተኛ ተሽከርካሪ ብቻ ማቆሚያ |
| 133 | 438 | OK | አቁም! የጉምሩክ ፍተሻ |
| 134 | 439 | OK | አስገዳጅ መልእክት ምልክት |
| 135 | 440 | OK | ለብክለት ተሽከርካሪዎች መግባት የተከለከለበት ዞን |
| 136 | 441 | OK | ለብክለት ተሽከርካሪዎች መግባት የተከለከለበት ዞን መጨረሻ |
| 137 | 501 | FIX | ለሕዝብ ማመላለሻ መንገድ ወይም መስመር |
| 138 | 502 | OK | ለሕዝብ ማመላለሻ መንገድ ወይም መስመር መጨረሻ |
| 139 | 503 | FIX | ለሕዝብ ማመላለሻ መስመር |
| 140 | 504 | FIX | በነጭ ቀስት አቅጣጫ መጓዝ ይፈቀዳል |
| 141 | 505 | OK | የሕዝብ አውቶቡሶች እና የአገልግሎት መስመር ተሽከርካሪዎች ማቆሚያ |
| 142 | 506 | OK | የአካባቢ ባቡር ጣቢያ |
| 143 | 507 | OK | የታክሲ ማቆሚያ |
| 144 | 508 | OK | የታክሲ ማቆሚያ ቦታ መጨረሻ |
| 145 | 509 | OK | ታክሲዎች ተሳፋሪዎችን ለማንሳት እና ለማውረድ ብቻ የሚያቆሙበት ቦታ |
| 146 | 510 | OK | ወታደሮችን ለማንሳት እና ለማውረድ ብቻ የማመላለሻ ማቆሚያ |
| 147 | 511 | FIX | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ |
| 148 | 512 | FIX | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ በመጠባበቂያ ቦታ |
| 149 | 513 | FIX | ለተወሰኑ ተሽከርካሪዎች ማቆሚያ |
| 150 | 514 | FIX | በመንገዱ ላይ የተፈቀዱ የማሽከርከር አቅጣጫዎች |
| 151 | 515 | OK | ለሕዝብ ማመላለሻ መስመር: ድርብ ቀጣይ መስመር |
| 152 | 516 | FIX | ለሕዝብ ማመላለሻ መስመር, ወደ እና ከመስመሩ ማቋረጥ |
| 153 | 601 | OK | የመለዋወጫ ወይም የመስቀለኛ መንገድ ስም |
| 154 | 602 | ASK-OWNER | ከከተማ ውጭ ባለው መንገድ ላይ ከመለዋወጫ በፊት ወደ መድረሻዎች አቅጣጫ |
| 155 | 603 | ASK-OWNER | ከከተማ ውጭ ባለው መንገድ ላይ ከመስቀለኛ መንገድ በፊት ወደ መድረሻዎች አቅጣጫ |
| 156 | 604 | ASK-OWNER | ከከተማ ውጭ ባለው መንገድ ላይ ከመስቀለኛ መንገድ በፊት ወደ መድረሻዎች ቀደምት አቅጣጫ |
| 157 | 605 | OK | ሁለት ተከታታይ እና ቅርብ መውጫዎች |
| 158 | 606 | OK | ከመንገድ መውጫ አቅጣጫ |
| 159 | 607 | OK | ለመውጫ ብቻ አቅጣጫ |
| 160 | 608 | OK | ከመንገድ መውጫ ቦታ |
| 161 | 609 | OK | የሚቀጥሉት መውጫዎች |
| 162 | 610 | OK | ከከተማ ውጭ ባሉ መንገዶች ላይ መድረሻዎች |
| 163 | 611 | OK | የመንገድ ቁጥር |
| 164 | 612 | OK | በመንገድ ላይ ያለው የኪሎሜትር ቁጥር |
| 165 | 613 | FIX | በመስመሮች ውስጥ ያሉ እንቅስቃሴዎች ፍቺ |
| 166 | 614 | OK | በከተማ መንገዶች ላይ ወደ መድረሻዎች አቅጣጫ |
| 167 | 615 | OK | በከተማ መንገድ ላይ ከመለዋወጫ በፊት አቅጣጫ |
| 168 | 616 | OK | በከተማ መንገድ ላይ ከመስቀለኛ መንገድ በፊት አቅጣጫ |
| 169 | 617 | OK | በመስቀለኛ መንገድ ወይም በመለዋወጫ መንገድ መሪ |
| 170 | 618 | OK | አንድ አቅጣጫ መንገድ |
| 171 | 619 | FIX | በቀኝ በኩል የመንገዶች ብዛት መጨመር |
| 172 | 620 | FIX | በግራ በኩል የመንገዶች ብዛት መጨመር |
| 173 | 621 | FIX | በቀኝ በኩል የመንገዶች ብዛት መቀነስ |
| 174 | 622 | FIX | በግራ በኩል የመንገዶች ብዛት መቀነስ |
| 175 | 623 | OK | የማይወጣ መንገድ |
| 176 | 624 | OK | ከቀኝ በኩል የማይወጣ መንገድ |
| 177 | 625 | OK | ከግራ በኩል የማይወጣ መንገድ |
| 178 | 626 | ASK-OWNER | ለተሽከርካሪዎች ማቆሚያ |
| 179 | 627 | FIX | በእግረኛ መንገድ ላይ ማቆም ይፈቀዳል |
| 180 | 628 | ASK-OWNER | በመንገድ ላይ ወይም በእግረኛ መንገድ ላይ ለማቆም የተፈቀደው ቦታ መጨረሻ |
| 181 | 629 | FIX | ለሌለ መልእክት ማስጠንቀቂያ ወይም ማስታወቂያ |
| 182 | 630 | OK | በተጠቀሰው ርቀት ላይ ተፈጻሚ ይሆናል |
| 183 | 631 | FIX | የምልክቱ ርዝመት በሜትሮች |
| 184 | 632 | FIX | የምልክቱ መልእክት በቀስት አቅጣጫ |
| 185 | 633 | OK | ዋሻ |
| 186 | 634 | OK | የዋሻው መጨረሻ |
| 187 | 635 | OK | የእሳት አደጋ |
| 188 | 636 | FIX | ለሞተር ተሽከርካሪዎች አንድ አቅጣጫ መንገድ |
| 189 | 637 | OK | ለድንገተኛ አደጋ ማቆሚያ ቦታ |
| 190 | 638 | OK | ተሳፋሪዎችን ለማውረድ እና ለማንሳት ቦታ |
| 191 | 639 | OK | የትምህርት ተቋማት ዞን |
| 192 | 640 | OK | የትምህርት ተቋማት ዞን መጨረሻ |
| 193 | 701 | OK | ቀይ መብራት: ቁም |
| 194 | 702 | OK | ቀይ እና ቢጫ መብራት አብረው: ቁም |
| 195 | 703 | OK | አረንጓዴ መብራት: ቀጥል |
| 196 | 704 | OK | ለተሽከርካሪዎች አረንጓዴ ቀስት: ቀጥል |
| 197 | 705 | OK | ቢጫ መብራት: ቁም |
| 198 | 706 | OK | ብልጭ ድርግም የሚል ቢጫ መብራት: በጥንቃቄ ቀጥል |
| 199 | 707 | OK | ብልጭ ድርግም የሚል ቢጫ መብራት: በጥንቃቄ ቀጥል |
| 200 | 708 | OK | አግድም አራት ማዕዘን ነጭ መብራት: ቁም |
| 201 | 709 | OK | አግድም አራት ማዕዘን ነጭ እና ክብ ነጭ መብራት አብረው ቁም |
| 202 | 710 | OK | ቀጥ ያለ አራት ማዕዘን ነጭ መብራት: ቀጥል |
| 203 | 711 | ASK-OWNER | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ቀኝ ቀጥል |
| 204 | 712 | ASK-OWNER | የተዘበራረቀ አራት ማዕዘን ነጭ መብራት: ወደ ግራ ቀጥል |
| 205 | 713 | FIX | ቀጥታ ወይም ወደ ቀኝ ያሽከርክሩ |
| 206 | 714 | FIX | ቀጥታ ወይም ወደ ግራ ያሽከርክሩ |
| 207 | 715 | FIX | ቀጥታ፣ ወደ ቀኝ ወይም ወደ ግራ ያሽከርክሩ |
| 208 | 716 | OK | ክብ ነጭ መብራት: ቁም |
| 209 | 717 | OK | ብልጭ ድርግም የሚል ነጭ መብራት: በጥንቃቄ ቀጥል |
| 210 | 718 | OK | ቀይ የቆመ እግረኛ ምስል: አትሻገር |
| 211 | 719 | OK | አረንጓዴ የእግረኛ ምስል: በጥንቃቄ ተሻገር |
| 212 | 720 | OK | ቀይ የብስክሌት ቅርጽ: አትሻገር |
| 213 | 721 | FIX | አረንጓዴ የብስክሌት ምልክት |
| 214 | 722 | FIX | ከባቡር መስመር በፊት ድርብ ብልጭ ድርግም የሚል ቀይ መብራት: ይቁሙ |
| 215 | 723 | OK | የተዘጋ መስመር |
| 216 | 724 | OK | ክፍት መስመር |
| 217 | 725 | OK | ወደ አጎራባች መስመር መሻገር |
| 218 | 726 | OK | መውጫ መስመር |
| 219 | 727 | OK | ቀይ መብራት: ቁም |
| 220 | 728 | OK | አረንጓዴ መብራት: ቀጥል |
| 221 | 729 | OK | ቢጫ መብራት: ቁም |
| 222 | 801 | OK | የመንገድ መስመር ወይም የመንገድ ዘንግ መስመር: ነጭ የተቆራረጠ መስመር |
| 223 | 802 | OK | የሚቀያየር መንገድ ወይም መስመር: ነጭ ድርብ የተቆራረጠ መስመር |
| 224 | 803 | OK | ነጭ ድርብ ቀጣይነት ያለው የመለያ መስመር |
| 225 | 804 | OK | ለብስክሌቶች የተዘጋጀ መንገድ ወይም መስመር |
| 226 | 805 | OK | ነጭ ጥቅጥቅ ያለ የተቆራረጠ መስመር: ድርብ ቀጣይነት ያለው የመለያ መስመር ማስጠንቀቂያ |
| 227 | 806 | OK | ከቀጣይ መስመር አጠገብ ያለ የተቆራረጠ መስመር በነጭ |
| 228 | 807 | OK | ቢጫ ቀጣይነት ያለው መስመር: የመንገድ ዳር መስመር |
| 229 | 808 | OK | ነጭ አራት ማዕዘን መስመር |
| 230 | 809 | OK | ነጭ የተቆራረጠ መስመር – በመገናኛ ላይ መታጠፍ |
| 231 | 810 | ASK-OWNER | የማቆሚያ መስመር: በመስመሩ ስፋት ላይ ያለ ነጭ መስመር |
| 232 | 811 | FIX | የእግረኛ ማቋረጫ: በእግረኛ ማቋረጫው ቀኝ በኩል ይለፉ |
| 233 | 812 | OK | ለብስክሌቶች መሻገሪያ |
| 234 | 813 | OK | በመስመሩ ላይ የተፈቀዱ የማሽከርከር አቅጣጫዎች: ነጭ ቀስቶች |
| 235 | 814 | OK | ሊያልቅ ያለ የማሽከርከር መስመር: ነጭ ሰያፍ ቀስቶች |
| 236 | 815 | FIX | በመንገድ ላይ ምልክት የተደረገባቸው የትራፊክ ደሴቶች |
| 237 | 816 | ASK-OWNER | ጥቁር-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች |
| 238 | 817 | ASK-OWNER | በሰማያዊ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች |
| 239 | 818 | ASK-OWNER | ቀይ-ነጭ ቀለም የተቀቡ የእግረኛ መንገድ ድንጋዮች |
| 240 | 819 | FIX | በነጭ ምልክት የተደረገባቸው የተሽከርካሪ ማቆሚያ ቦታዎች |
| 241 | 820 | ASK-OWNER | በነጭ ምልክት የተደረገበት ማቆም የተከለከለ ቦታ |
| 242 | 821 | OK | የፍጥነት መቀነሻ ቦታ |
| 243 | 901 | OK | በመንገድ ላይ የሥራ ቦታ |
| 244 | 902 | OK | የሥራ ቦታ መጨረሻ |
| 245 | 903 | FIX | በሹል ኩርባ ላይ ማስጠንቀቂያ |
| 246 | 904 | FIX | በቲ-መገናኛ ላይ ማስጠንቀቂያ |
| 247 | 905 | OK | መንገዱ እየጠበበ ይሄዳል |
| 248 | 906 | OK | መንገዱ ከቀኝ እየጠበበ ይሄዳል |
| 249 | 907 | OK | መንገዱ ከግራ እየጠበበ ይሄዳል |
| 250 | 908 | OK | ጠባብ መተላለፊያ ወይም መሰናክል |
| 251 | 909 | OK | ባለ ሁለት አቅጣጫ ትራፊክ |
| 252 | 910 | OK | የመስመሮች ብዛት ከቀኝ ይጨምራል |
| 253 | 911 | OK | የመስመሮች ብዛት ከግራ ይጨምራል |
| 254 | 912 | OK | የመስመሮች ብዛት ከቀኝ ይቀንሳል |
| 255 | 913 | OK | የመስመሮች ብዛት ከግራ ይቀንሳል |
| 256 | 914 | OK | የትራፊክ ማዞሪያ |
| 257 | 915 | FIX | ተጨማሪ መረጃ ምልክት |
| 258 | 916 | OK | በተጠቀሰው ርቀት ላይ |
| 259 | 917 | OK | በተጠቀሰው ክፍል ርዝመት |
| 260 | 918 | OK | ብርቱካናማ የተቆራረጠ መስመር |
| 261 | 919 | OK | ብርቱካናማ ድርብ የተቆራረጠ መስመር |
| 262 | 920 | OK | ብርቱካናማ ድርብ ቀጣይነት ያለው የመለያ መስመር |
| 263 | 921 | OK | ብርቱካናማ ጥቅጥቅ ያለ የተቆራረጠ መስመር |
| 264 | 922 | OK | ብርቱካናማ የተቆራረጠ መስመር ከቀጣይ መስመር አጠገብ |
| 265 | 923 | OK | ብርቱካናማ አራት ማዕዘን ቅርጽ ያለው መስመር |
| 266 | 924 | OK | ብርቱካናማ የተቆራረጠ መስመር - በመገናኛ ላይ መታጠፍ |
| 267 | 925 | ASK-OWNER | ብርቱካናማ የማቆሚያ መስመር |
| 268 | 926 | OK | በመስመሩ ውስጥ የተፈቀዱ የማሽከርከር አቅጣጫዎች: ብርቱካናማ ቀስቶች |
| 269 | 927 | OK | ሊያልቅ ያለ የማሽከርከር መስመር: ብርቱካናማ ሰያፍ ቀስቶች |
| 270 | 928 | FIX | የትራፊክ ደሴቶች |
| 271 | 929 | OK | ማገጃ: መንገዱ ተዘግቷል |
| 272 | 930 | OK | የአቅጣጫ ምሰሶዎች |
| 273 | 931 | OK | አቅጣጫ ማስያዣ ወይም መሰናክል ኮን |
| 274 | 932 | OK | ብርቱካናማ ብልጭ ድርግም የሚል መብራት |
| 275 | 933 | OK | የሚንቀሳቀስ ብልጭ ድርግም የሚል ሰሌዳ |
| 276 | 934 | OK | የሚንቀሳቀስ ብልጭ ድርግም የሚል ሰሌዳ: መንገዱ ዝግ ነው |
| 277 | 935 | FIX | ለአደጋ ጊዜ ማቆሚያ መግቢያ |

## Reproducibility and boundaries

CSV SHA-256: 3b75f6b00b864ff5a813d964109f57da7aa3168a9bbcb7f0c9a5352a9ee0c1a9.

Checks used literal substring tests, Hebrew/Latin character detection, whitespace word counts, numeric-token comparison followed by manual semantic classification, exact-name grouping, and Hebrew/Amharic right-left substring comparison. Counts are labelled by rows or groups. All image rendering and intermediate analysis stayed in memory. No generation, upload, build, deployment or database-writing command was run. The only output file is this report.

