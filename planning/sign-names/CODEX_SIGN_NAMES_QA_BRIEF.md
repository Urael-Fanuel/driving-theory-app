# CODEX brief: QA of the 276 proposed sign names (Amharic) for the driving-theory app

Prepared 2026-10-23 by Claude Code (the implementer). The app owner is a non-programmer and the final decision
maker. He asked for an independent check so that he does not have to verify every row by hand.
After you approve, the names go into the app (sign 101 first, then the rest in stages).

## 0. Ground rules

- **Review only.** Do not edit any data file, `content/signs.json`, any script, or the database. Do not push.
  Do not run `uploadNewAudio.mjs`, `generateAllAudio.ts`, or anything that writes to Supabase or storage.
  Do not print `.env`.
- The only file you may create is your report: `planning/sign-names/CODEX_SIGN_NAMES_QA_REPORT.md`.
- **Never hand-write replacement Amharic as a final answer.** The project rule is that Amharic is produced by
  Gemini scripts and approved by the owner. If a name is wrong, explain *why* in English and say what the
  correct meaning must be (in English/Hebrew). You may add a suggested Amharic wording, but mark it
  `SUGGESTION (needs Gemini + owner approval)`.
- Topics `regulatory`, `warning`, `right_of_way` are normally frozen. The owner approved ONE exception:
  the sign *name* field and a short *name audio clip* only. That is what is being reviewed here.
- Audience: Amharic speakers worldwide, many with low literacy. The names are read on screen (Engine B)
  and played as a short audio clip before the explanation (Engine A). So names must be short, clear and
  natural when spoken.

## 1. What is being reviewed

Every sign gets a **name** = the official Israeli Ministry of Transport wording, translated into short Amharic.

Files (all in `planning/sign-names/`):

| File | What it is |
|---|---|
| `sign_names_for_codex_qa.csv` | **The file to review** (UTF-8 with BOM, 276 rows). Columns: `sign_number`, `topic`, `official_hebrew_wording`, `proposed_short_amharic_name`, `previous_long_amharic_by_gemini`, `review_notes`, `image_path` |
| `official_wording_parsed.json` | The raw official wording extracted from the law, used to build the table, for cross-checking a row (`rows[<number>].text`) |
| `sign_names_review_v4.xlsx` | The same data as the owner sees it in Google Sheets, with two more columns: current name in the app, and internal id |

Official source of the Hebrew wording: the Traffic Notice "הודעת התעבורה (קביעת לוח תמרורים)",
https://www.nevo.co.il/law_html/law01/500_427.htm (column "פירושו"). It is a table of meanings, not a list of
names, so many wordings are long. The owner decided: **the name is the official wording as it is, never
invented**. For this table the Amharic name is a *shortened headline* of that wording (see rules below), and
the full explanation stays in the existing explanation text and audio.

Sign images: `image_path` column (under `assets/images/<topic folder>/<number>.png`). Open the picture of
each sign when a name depends on direction, side, symbols or numbers. Sign 303 has no PNG in `assets/images`;
look in `scripts/downloaded-signs/` or judge it from the Hebrew only and say so.

## 2. The rules the Amharic names were built under (check them too)

1. **Meaning fidelity.** The Amharic name must mean what the official Hebrew wording means (its headline), and
   must fit the sign picture. Nothing invented, nothing contradictory.
2. **Never lose what makes a sign different from its neighbours:** direction (right = ቀኝ, left = ግራ), side,
   "before / after the sign", numbers and measurements, vehicle type, and *prohibition vs permission*.
   Mirror signs must have mirror names (e.g. 102 = sharp curve right, 103 = sharp curve left; 110/111; 115/116;
   204-207; 619-622; 910-913 ...).
3. **Short.** Usually 2-8 words; a few words more are fine when the meaning needs it. Flag names that are
   still too long or too vague (one word that does not identify the sign).
4. **Forbidden:** the verb root of "to drive" in the forms ይንዱ / ንዱ / ነዱ / መንዳት and any variation (the owner
   says it sounds wrong). The approved replacement is **ያሽከርክሩ** (and words based on ማሽከርከር).
5. **No parentheses.** A U-turn is written inside the sentence with a connector, e.g.
   "ወደ ተቃራኒ አቅጣጫ ለመመለስ ወደ ቀኝ ያሽከርክሩ" (to turn back, drive to the right).
6. **No Hebrew words and no sound-alike transliteration of Hebrew** (the old "የካማት" for "צומת קמץ" was rejected).
   No Hebrew or Latin letters except digits. "צומת קמץ" = a T-junction, written as a concept.
7. **Terminology must be consistent across the 276 rows.** In particular parking/standing (חניה) and stopping
   (עצירה) must be two clearly different words; "right/left"; "prohibited" forms; "lane" vs "road".
8. `ሹል` means sharp/pointed (used for "sharp curve"). Tell us if a native speaker would find it unnatural.
9. Sign 101 is **already approved by the owner**: `ያልተስተካከለ መንገድ` (uneven road). Do not change it.

## 3. How to review

Go through **all 276 rows, one by one** (do not sample). For each row decide a verdict:

- `OK` the name is correct, short, natural, and fits the sign.
- `FIX` the name is wrong or breaks a rule. Say which rule (1-9), what is wrong, and what it must say.
- `ASK-OWNER` it depends on a native speaker's taste or a real ambiguity (for example a T-junction term).

Use the Hebrew wording first, then the picture, then `previous_long_amharic_by_gemini` as a second reading of
the same sign. If the Hebrew in the CSV looks cut, mixed with another row, or does not match the picture, check
`official_wording_parsed.json` and report it as a **source error** (separate list).

Run these mechanical checks over the whole CSV and report counts and offending rows:

- any of ይንዱ ንዱ ነዱ መንዳት in column D; any `(` `)` in column D;
- Hebrew or Latin letters in column D;
- digits in the Hebrew wording that are missing from the Amharic name when they are a *measurement or limit*
  (weights, heights, speeds, distances). Cross references to other sign numbers may be dropped;
- right/left present in the Hebrew but missing in the Amharic;
- different signs sharing an identical Amharic name where the Hebrew wording differs
  (known and intended duplicates: 107/108, 706/707, 421/423, 701/727, 138/633, 109/905 ... check each);
- names longer than 9 words.

Known weak spots to look at first: 107/108 (the owner's example wanted "warning and guidance" kept),
117-120 and all "צומת קמץ" rows, 201-212 (before/after the sign, U-turn), 303 (roundabout), 511-513
(stopping places for a vehicle type: their short names are nearly identical), 713-715, 801-815 and 918-927
(road markings), 304/305 (portable signs), and anything about parking vs stopping (432, 433, 817, 818, 626-628).

## 4. Deliverable

Write `planning/sign-names/CODEX_SIGN_NAMES_QA_REPORT.md` containing:

1. **Verdict line**: `APPROVED`, `APPROVED WITH FIXES`, or `NOT APPROVED`, with counts of OK / FIX / ASK-OWNER.
   Use `APPROVED` only if there is no FIX left. The names go into the app only after you approve (or after the
   fixes are applied and re-checked).
2. **Mechanical checks** results (section 3).
3. **Table of every FIX and ASK-OWNER row**: sign number, official Hebrew, proposed Amharic, the problem
   (rule number), what the correct meaning is, optional marked SUGGESTION.
4. **Source errors** found in the official wording extraction.
5. **Terminology list**: the Amharic word used for each recurring concept and any inconsistency.
6. A short **plain-language summary for the owner (in Hebrew)**, max 10 lines: what is fine, what needs his decision.

If anything blocks you (missing image, unreadable file), say so explicitly instead of guessing.
Be honest about confidence: if you are not sure about a native-speaker nuance, mark `ASK-OWNER`, do not guess.
