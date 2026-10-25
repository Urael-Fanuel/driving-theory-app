# Recorded TTS — final rollout verification

**Verdict: COMPLETE — publication coverage and the approved client's recording-selection path.**

Verified 2026-10-25. Public checks completed at 2026-10-25T06:52:18.094Z. All 69 subtopics are represented by the full expected set of 5,133 distinct recordings. No missing/extra index entries, bad HEAD results, or sampled MP3-format failures were found. The four requested source/test fingerprints match REPORT_3.

This verdict does not claim every user is running the reviewed build or that live Google TTS is never used. Field observation of an installed client remains separate. The exact conditions and a no-code-change evidence plan appear below.

## 1. Approved code unchanged

| File | SHA-256 | Matches REPORT_3 |
|---|---|---|
| services/audioCache.ts | 09aaa8f0aad4daf9a1be9f6c678b748eb0a935548dcba3aab3659dbe68fab722 | YES |
| utils/googleTTS.ts | 037082049b1d1ed251c4154a23d6ff2bd9f000c8d390488095ad53b086c708a5 | YES |
| scripts/recordTts.mjs | ea0f58b0df29c09820c72d540984b1259550ddd09cd7e351802643ee28b70d8c | YES |
| planning/codex-qa-2026-10-06/tests/recorded-tts-test.cjs | dd8d48eca79201f0aac64cf17195451e4f309884f8baffea28b540a91ea49741 | YES |

These are hashes of the actual files in C:/Users/Yakov/Desktop/driving-theory-app. No assumption was made from the implementer's statement alone.

## 2. Coverage computed from real client code

Loaded services/audioCache.ts through the same TypeScript/VM mechanism as the integrated tests and used its actual recordedTtsFilename(text), rather than trusting the script's hash port. Separately enumerated the behavioral strings from the eight scaffolds, questions, raw answers, numbered Engine B answers, all current praise variants and the wrong-answer prefix; the speech guard passed against current screen/component source.

| Check | Result |
|---|---:|
| Subtopics | 69 |
| Per-subtopic sentence records | 5,157 |
| Expected unique recording filenames | 5,133 |
| Public index entries / unique entries | 5,133 / 5,133 |
| Missing expected filenames | 0 |
| Extra filenames | 0 |
| Duplicate index entries | 0 |

The fewer unique files are due to identical text reused across subtopics. Scope remains the fixed behavioral vocabulary approved in REPORT_3, including both engines and their applicable exam/practice/quiz/feedback paths; dynamic and explicitly excluded phrases remain live/cache-backed.

Public index: [index.json](https://bpltieicivxixpogxfim.supabase.co/storage/v1/object/public/audio/tts/index.json).
- HTTP 200; Content-Type: application/json.
- Index updated: 2026-10-25T06:21:59.725Z.
- SHA-256 of the fetched JSON bytes: f2762ff2dcf87b4afddb311647c860d7fda531561efbebc2211ef96f2d3c5508.
- A second public GET using the client's ten-minute ?v= query convention returned the same status, type, entry count and SHA-256 after the scan. No index drift was observed.

## 3. Every object's metadata and random audio sample

Performed HEAD on **all 5,133 indexed objects**, with eight concurrent workers and bounded retry for transport/429/server failures. All final results were HTTP 200, audio/mpeg, and larger than 1,024 bytes. Failed final results: **0**.

- Object size range: **6,528–166,080 bytes**.
- Sum of Content-Length: **270,043,200 bytes** (about 257.53 MiB). This is the remote library, not a bulk download to the app; the client retains its 120 MB cache budget.
- Downloaded **100 distinct randomly selected clips** into memory with public GET.
- GET results: **100/100 HTTP 200, audio/mpeg**.
- MP3 structure: **100/100 passed**. Parsed sequential MPEG Layer III frames, checking sync/version/layer/bitrate/sample-rate/derived frame boundaries, rather than trusting the MIME label or one sync byte. Each sample had 64–770 complete frames, with zero trailing unparsed bytes. These sampled bodies are MP3 streams, not JSON/HTML error responses.
- Sample size range: **12,288–147,840 bytes**.
- Header-derived duration range: **1.536–18.480 seconds**.
- Sample text lengths: **8–126 characters**; byte/text ratios **1,047.9–1,680.0 bytes per character**. These are consistent with short speech clips; no size/duration anomaly was found in the sample.

Examples: 8-character text -> 12,288 bytes / 1.536 s; 39 characters -> 50,112 bytes / 6.264 s; 126 characters -> 147,840 bytes / 18.480 s.

The reproducible selection seed was 6b44c79f8e63dccf041294383c3f2e51. Selection: sort all index filenames by SHA-256(seed + filename), using hexadecimal string localeCompare, then take the first 100. The complete sampled filename/size/duration evidence is appended below.

Limits: HEAD validates metadata, not every object's audio payload. Full binary frame validation was performed on the sample, not all 5,133 bodies. Frame parsing is not decoded listening or transcription; it does not prove that the spoken words in each uploaded file semantically match its filename. That association is supported by the approved exact-text generator, filename mapping and publication process, with device listening as the field check.

## 4. Real published index through the integrated client harness

Fetched the real public index once for this experiment, then supplied that JSON to the fake index-network response while loading the real audioCache.ts and googleTTS.ts together. Used the same 100 sampled texts in two independent initially empty cache worlds.

| Path | Texts | Successful simulated playback | Recorded downloads | Live tts invocations |
|---|---:|---:|---:|---:|
| speakAndAwait | 100 | 100 | 100 | **0** |
| prefetchTtsForTexts | 100 | Not a playback operation | 100 | **0** |

The index is real; download/filesystem/player/provider dependencies in this harness are fake. The 100 real MP3 GET/format checks above are a separate public-network experiment. This verifies the actual source code's branch selection using the published filenames; it does not pretend to be Android playback or observed phone traffic.

## What the result establishes

The published recording set is complete for the approved fixed behavioral vocabulary. The reviewed client code selects cached audio or published recordings without a live TTS request under healthy conditions. This review does not establish which build is installed on a particular phone, nor that every real-device session has made zero live requests. Those are the field checks described below. The owner's successful pilot is reported in the handover, not independently witnessed here.

## Playback selection and remaining live calls

Source references: utils/googleTTS.ts:286–330,352–392,618–660; services/audioCache.ts:975–990,1047–1153.

For speakAndAwait:
1. A cached live tts_* file takes priority, then a cached recorded rtts_* file. A healthy cache hit plays locally with no new Google request.
2. On a cache miss, fetchRecordedTts checks the index and downloads the listed rtts_* clip. When it arrives within the eight-second deadline and plays successfully, the function returns without invoking the tts Edge Function.
3. If a saved clip fails, the current request tries live TTS once. It retains ownership checks and the corrected final speaking-state cleanup.

For prefetchTtsForTexts, a cache hit is skipped; a recording returned within the same deadline ends that item's work before the live invoke. Prefetch does not decode/test-play a downloaded clip. A decoding defect is handled by the foreground recovery path when used.

Live invocation remains possible when no usable cache satisfies the request and:
- the exact text is absent from the currently available index, including a stale/negative index still awaiting refresh;
- no usable index is available (network/HTTP/JSON failure, initial absence, timeout, or missing runtime Storage URL);
- the recorded download fails or exceeds eight seconds, including queue/cooldown delays, or storage/cache operations prevent returning a usable local file;
- that recording has been skipped for the session after a prior playback failure;
- cached audio or a newly downloaded recording fails to load/start/play: recovery goes directly to live, even if another published copy exists;
- an intentionally unrecorded/dynamic text is spoken and is not already cached.

The last category includes generated why-explanations, standalone celebration, the daily announcement and the location primer. Such live calls are expected and are not coverage gaps in this behavioral recording set. A cancellation before playback does not itself trigger live recovery.

“Listed and reachable” alone is therefore too broad: the clip must also arrive in time and be playable, and a different failed cache hit can take the recovery branch first. The preserved eight-second deadline is a fallback policy, not evidence of missing publication.

## Public bucket verification and risk

Public GET of index.json returned application/json. HEAD of every clip and GET of the sample returned audio/mpeg. This establishes actual public serving behavior. Public reads cannot prove the complete administrative allowed-MIME list, the claimed unchanged 5 MB upload limit, write policies, or the history of the dashboard change. I did not test writes to infer those settings.

Allowing application/json broadens the kinds of objects an already-authorized uploader may place in this public bucket; it does not by itself grant upload/delete permission. Public bucket reads and write access are separate in [Supabase's bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals), and MIME restrictions are upload restrictions in [Creating Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets). The practical concern is that any JSON uploaded here is public: keep it to public recording metadata, not secrets or personal records. The observed index contains recording filenames and a publication timestamp. No material new risk was identified from adding this metadata type, conditional on retaining the existing authorized-writer policies; those policies were not audited here.

## Objective field evidence without code changes

Use the reviewed build on a test device, and record its installed version/build identity. A local source fingerprint does not prove the store-installed binary contains this feature.

1. Record a precise UTC start/end window and the behavioral subtopic/question/answers used in Engine A and Engine B. Restart the app before the test so it fetches the current index rather than relying on an older negative result.
2. Use previously unplayed sentences on a separate test installation/profile where practical. Do not clear the owner's primary app data just to gather evidence. A previously cached live rendering also gives zero invocations and sounds identical.
3. Record the tts invocation count before and after, with the same time filter and enough delay for log ingestion. Avoid why-explanations, daily announcements, location prompts and unrelated flows during the controlled window. If the count increases, inspect the requests rather than declaring failure: other users, expected dynamic text or a genuine network fallback can account for it.
4. For stronger attribution, correlate the exact rtts_* object GET paths with the test window/device using available Storage request logs or an already-supported test-device network inspector. Pair those successful recording GETs with absence of /functions/v1/tts requests from the same test client. This distinguishes a newly fetched recording from an old live cache hit. Subsequent cached replay can correctly show neither request.
5. After a successful first play, repeat offline and confirm audible replay. This proves local availability of that played sentence; the preceding recording GET identifies its origin.

Aggregate function counts alone are useful but cannot attribute traffic to this phone, distinguish cached-live from cached-recorded audio, or prove the same behavior for all users. A tts invocation also is not necessarily a successfully billed Google synthesis. This field collection is still for the owner/implementer after this report; I did not access their dashboard or claim to have observed phone traffic.

## Scope

Only the final report is written. Verification used public GET/HEAD, local read-only source inspection and in-memory fake-I/O harnesses. Sample MP3 buffers were inspected in memory, not saved as extra files. No uploads, builds, source edits, production function invocations, bucket changes, or credential reads occurred. Earlier tests were not rerun merely for unchanged code; the requested source fingerprints and real-index harness were checked in this review.


## סיכום לבעל האפליקציה

הפרסום הושלם: כל 69 תתי־הנושאים מכוסים ב־5,133 הקלטות, ללא קבצים חסרים ברשימה.
בדקתי את כל הקבצים: כולם זמינים, מסוג שמע ובגודל תקין.
דגמתי 100 קבצים, ובכולם נמצא מבנה MP3 תקין.
ארבעת קובצי הקוד והבדיקות תואמים לגרסה שאושרה.
בבדיקת מסלול הקוד עם האינדקס האמיתי התקבלו אפס פניות להקראה חיה.
קובץ ישן שכבר שמור בטלפון יכול עדיין להתנגן מקומית; גם הוא אינו מחייב פנייה חדשה לגוגל.
הגיבוי החי נשאר פעיל לתקלות ולמשפטים שלא נכללו; את התנהגות המכשיר נאמת לפי תוכנית השטח.
נכתב רק הדוח; לא שונו קוד או הגדרות ולא הועלה דבר.

## Appendix: public GET sample evidence

Every row below returned HTTP 200, audio/mpeg and passed complete sequential frame parsing with zero trailing bytes.

| File | Text chars | Bytes | Frame-derived seconds |
|---|---:|---:|---:|
| rtts_103_a7c91d83af2db2da.mp3 | 103 | 112512 | 14.064 |
| rtts_11_47b64618f29b0e87.mp3 | 11 | 16704 | 2.088 |
| rtts_117_a1b2f3fa06e49bb4.mp3 | 117 | 135168 | 16.896 |
| rtts_119_4b3e267024efc9ac.mp3 | 119 | 137664 | 17.208 |
| rtts_12_68b0e988c6209549.mp3 | 12 | 20160 | 2.520 |
| rtts_126_6f99eda0e9b88d29.mp3 | 126 | 147840 | 18.480 |
| rtts_13_4a18990c0e7b6dd2.mp3 | 13 | 19584 | 2.448 |
| rtts_14_d87bd9b40117d70b.mp3 | 14 | 19776 | 2.472 |
| rtts_16_03bda98310b82215.mp3 | 16 | 18816 | 2.352 |
| rtts_17_3fd76a0cc04eed95.mp3 | 17 | 23616 | 2.952 |
| rtts_18_35b63c28277779e0.mp3 | 18 | 21888 | 2.736 |
| rtts_18_efc860381c64fe70.mp3 | 18 | 21312 | 2.664 |
| rtts_19_06599d33062f756a.mp3 | 19 | 25344 | 3.168 |
| rtts_20_d345d297de6d15f5.mp3 | 20 | 25728 | 3.216 |
| rtts_20_d9b295c362ff224b.mp3 | 20 | 24000 | 3.000 |
| rtts_20_dfe664fc62fdb357.mp3 | 20 | 25728 | 3.216 |
| rtts_20_edf15384b1b050bd.mp3 | 20 | 24576 | 3.072 |
| rtts_21_242e49226909a998.mp3 | 21 | 25728 | 3.216 |
| rtts_21_4114df00b911fa66.mp3 | 21 | 24000 | 3.000 |
| rtts_21_68b8c1502e0e6d7f.mp3 | 21 | 27840 | 3.480 |
| rtts_21_78901e58af325d12.mp3 | 21 | 28608 | 3.576 |
| rtts_21_89c805b2dc4ab960.mp3 | 21 | 24192 | 3.024 |
| rtts_21_a2bd086a654515b4.mp3 | 21 | 27072 | 3.384 |
| rtts_21_f52f10784d384a55.mp3 | 21 | 27264 | 3.408 |
| rtts_22_bdd148d0d11e6c6f.mp3 | 22 | 29760 | 3.720 |
| rtts_23_23566ea8b6dbe1e7.mp3 | 23 | 30912 | 3.864 |
| rtts_23_3b4a0da0dc303248.mp3 | 23 | 26496 | 3.312 |
| rtts_25_6469820e94962b56.mp3 | 25 | 33792 | 4.224 |
| rtts_25_bad2ebb43ecec599.mp3 | 25 | 31488 | 3.936 |
| rtts_26_8d61a08c1b40fb73.mp3 | 26 | 34752 | 4.344 |
| rtts_27_68c579fcf1062500.mp3 | 27 | 29184 | 3.648 |
| rtts_28_74aa99d8cc19ffd5.mp3 | 28 | 36288 | 4.536 |
| rtts_28_77c9cdf880a08f07.mp3 | 28 | 34368 | 4.296 |
| rtts_29_d6da5dd85af724a6.mp3 | 29 | 34176 | 4.272 |
| rtts_29_d80fc843d8cb45e5.mp3 | 29 | 35136 | 4.392 |
| rtts_30_0337ab78e04675cd.mp3 | 30 | 37056 | 4.632 |
| rtts_30_93578b88339cde2a.mp3 | 30 | 38976 | 4.872 |
| rtts_30_ceaa2ff024e8e073.mp3 | 30 | 37824 | 4.728 |
| rtts_31_c4b2c3b3fb3a648a.mp3 | 31 | 37824 | 4.728 |
| rtts_32_de0ec5d8ec7f6aed.mp3 | 32 | 42048 | 5.256 |
| rtts_33_41d6fcd0fb60fa8e.mp3 | 33 | 39552 | 4.944 |
| rtts_34_0910c19ca6048ba0.mp3 | 34 | 39168 | 4.896 |
| rtts_35_09c8272cb11eb14e.mp3 | 35 | 45120 | 5.640 |
| rtts_35_47263b765493eb71.mp3 | 35 | 38784 | 4.848 |
| rtts_35_84b9ac542808a802.mp3 | 35 | 37440 | 4.680 |
| rtts_36_1bae4fdf47e00873.mp3 | 36 | 40704 | 5.088 |
| rtts_36_2007e170e1b101e1.mp3 | 36 | 43392 | 5.424 |
| rtts_36_59b76a20a946628a.mp3 | 36 | 41664 | 5.208 |
| rtts_37_df9489eeb1c63722.mp3 | 37 | 42432 | 5.304 |
| rtts_39_1f135df04f2fe92c.mp3 | 39 | 45312 | 5.664 |
| rtts_39_264f134856eef7e2.mp3 | 39 | 45504 | 5.688 |
| rtts_39_45acf338fc3eadd5.mp3 | 39 | 50112 | 6.264 |
| rtts_39_b4bf3bb036195795.mp3 | 39 | 46464 | 5.808 |
| rtts_39_f4df2c9c3e6899cf.mp3 | 39 | 47040 | 5.880 |
| rtts_40_378159b40f24bd72.mp3 | 40 | 42432 | 5.304 |
| rtts_41_fd7a7c685f937d31.mp3 | 41 | 51264 | 6.408 |
| rtts_42_7d43232472096d76.mp3 | 42 | 51264 | 6.408 |
| rtts_42_810507f04cbde8f2.mp3 | 42 | 45504 | 5.688 |
| rtts_42_daba12e216a3e862.mp3 | 42 | 48192 | 6.024 |
| rtts_42_dff7b870b76e5dc9.mp3 | 42 | 45696 | 5.712 |
| rtts_43_9732b673ab5c46b2.mp3 | 43 | 48768 | 6.096 |
| rtts_44_95874b488f4f3f20.mp3 | 44 | 55296 | 6.912 |
| rtts_48_53390a98479ec5f9.mp3 | 48 | 57216 | 7.152 |
| rtts_49_98c9927c03057ab4.mp3 | 49 | 56064 | 7.008 |
| rtts_49_9dba542f6ebe4484.mp3 | 49 | 52416 | 6.552 |
| rtts_49_c7cc54e2453e4c73.mp3 | 49 | 56064 | 7.008 |
| rtts_50_f1cfafa26652f42e.mp3 | 50 | 55680 | 6.960 |
| rtts_51_3706b9c0bd2868c0.mp3 | 51 | 55488 | 6.936 |
| rtts_51_592704d88f246c3e.mp3 | 51 | 59328 | 7.416 |
| rtts_52_2921be60d8941b92.mp3 | 52 | 60864 | 7.608 |
| rtts_53_942879988771dcd6.mp3 | 53 | 59136 | 7.392 |
| rtts_53_c0bfc840d8d602aa.mp3 | 53 | 60672 | 7.584 |
| rtts_54_cb931d08d9b31f81.mp3 | 54 | 71040 | 8.880 |
| rtts_56_77cbe538642c9109.mp3 | 56 | 60480 | 7.560 |
| rtts_57_3935cc68c80ec449.mp3 | 57 | 66048 | 8.256 |
| rtts_57_c71aaca884a5fa00.mp3 | 57 | 70656 | 8.832 |
| rtts_59_5852eb784eb3566a.mp3 | 59 | 61824 | 7.728 |
| rtts_63_934cfb7022ccac28.mp3 | 63 | 67200 | 8.400 |
| rtts_63_c8649e0054d50fa9.mp3 | 63 | 68160 | 8.520 |
| rtts_65_7301815079781a5f.mp3 | 65 | 81792 | 10.224 |
| rtts_66_bd3d5500fe53d2b5.mp3 | 66 | 80448 | 10.056 |
| rtts_67_3272fc58e1fe6bc3.mp3 | 67 | 78336 | 9.792 |
| rtts_67_bd662f8042f45739.mp3 | 67 | 75648 | 9.456 |
| rtts_69_3f68275084a4c328.mp3 | 69 | 92928 | 11.616 |
| rtts_70_dc4f55783f4d475c.mp3 | 70 | 76800 | 9.600 |
| rtts_72_aa639ba615a13031.mp3 | 72 | 89280 | 11.160 |
| rtts_73_61aa0190e2b42bcd.mp3 | 73 | 95808 | 11.976 |
| rtts_74_492a8722a1b54d1b.mp3 | 74 | 87360 | 10.920 |
| rtts_77_8a9988b86f80b736.mp3 | 77 | 91584 | 11.448 |
| rtts_78_33b512afc46b9584.mp3 | 78 | 84864 | 10.608 |
| rtts_78_be296468eb9b0da1.mp3 | 78 | 81792 | 10.224 |
| rtts_8_7aba9cf834bf5b16.mp3 | 8 | 12288 | 1.536 |
| rtts_85_d9f87f338fa0664f.mp3 | 85 | 98112 | 12.264 |
| rtts_86_a9260fa8794a6f1f.mp3 | 86 | 100416 | 12.552 |
| rtts_90_ff893af04f63b49b.mp3 | 90 | 114432 | 14.304 |
| rtts_91_4ba90484c3763ebb.mp3 | 91 | 108288 | 13.536 |
| rtts_93_a19749105cc9634f.mp3 | 93 | 106368 | 13.296 |
| rtts_94_b7301e305d907770.mp3 | 94 | 115392 | 14.424 |
| rtts_96_17333b58c110a1d0.mp3 | 96 | 111744 | 13.968 |
| rtts_97_0d484e3f0900dc6d.mp3 | 97 | 109440 | 13.680 |
