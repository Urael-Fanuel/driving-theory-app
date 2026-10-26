/**
 * AGENT 3 — constants/strings.ts
 * All Amharic UI strings used in the app.
 *
 * Keeping strings centralized makes it easy to:
 * - Audit for completeness
 * - Add new languages later
 * - Ensure consistency
 *
 * NOTE: Engine A users NEVER see these strings — they are for Engine B only.
 * Engine A uses audio equivalents of each string.
 */

export const Strings = {
  // ─── App General ────────────────────────────────────────────────────────────
  appName:          'መንጃ ፍቃድ',
  appSubtitle:      'በቀላል መንገድ',
  loading:          'እየጫነ ነው...',
  back:             '← ተመለስ',
  next:             'ቀጣይ ›',
  retry:            'ዳግም ሞክር',
  home:             'ቤት',
  error:            'ስህተት ተከስቷል',

  // ─── Engine Selection ───────────────────────────────────────────────────────
  selectEngine:     'ምርጫ ይምረጡ',
  engineA:          'ድምጽ ብቻ',
  engineB:          'ፅሁፍ',
  orDivider:        'ወይም',

  // ─── Home Screen ────────────────────────────────────────────────────────────
  startLearning:    'ትምህርት ጀምር',
  topicsTitle:      'ርዕሰ ጉዳዮች',
  signsCount:       (n: number) => `${n} ምልክቶች`,

  // ─── Sign Detail ────────────────────────────────────────────────────────────
  practiceQuiz:     'ልምምድ',
  watchVideo:       'ቪዲዮ ተመልከት',
  listenExplanation: 'ማብራሪያ ድምጽ',

  // ─── Question Screen ────────────────────────────────────────────────────────
  questionOf:       (current: number, total: number) => `${current} / ${total}`,
  speakAnswer:      'ይናገሩ...',
  listeningNow:     'እየሰማ ነው...',
  processingVoice:  'ድምጽ እየሰማ...',
  tapNumber:        'ቁጥሩን ይጫኑ',
  notHeard:         'ያልተሰማ',

  // ─── Feedback ───────────────────────────────────────────────────────────────
  correct:          'ትክክል ነው! ✅',
  wrong:            'ትክክል አይደለም ❌',

  // ─── Exam ───────────────────────────────────────────────────────────────────
  examTitle:        'ፈተና',
  startExam:        'ፈተና ጀምር',
  examPassed:       'ፈተናው ተሳክቷል! 🏆',
  examFailed:       'ዳግም ሞክር 📖',
  passThreshold:    '80% (24/30) ያስፈልጋል',
  score:            (s: number, t: number) => `${s} ከ ${t}`,
  timeElapsed:      'ያለፈ ጊዜ',
  correct_answers:  'ትክክል',
  wrong_answers:    'ስህተት',

  // ─── Progress ───────────────────────────────────────────────────────────────
  progressTitle:    'እድገቴ',
  overallProgress:  'ጠቅላላ እድገት',
  readyForExam:     '🏆 ለፈተና ዝግጁ ነዎት!',
  notReadyYet:      (pct: number) => `ለፈተና 80% ያስፈልጋል (${Math.max(0, 80 - pct)}% ቀሪ)`,
  questionsAttempted: 'ሞክሯል',
  questionsCorrect:   'ትክክል',
  byTopic:          'በርዕስ ጉዳይ',
  noProgressYet:    'ገና አልተጀመረም። ምልክቶቹን ሲያጠኑ እድገትዎ እዚህ ይታያል።',

  // ─── Topics ─────────────────────────────────────────────────────────────────
  topicRegulatory:   'አስገዳጅ ምልክቶች',
  topicWarning:      'ማስጠንቀቂያ ምልክቶች',
  topicInformation:  'መረጃ ምልክቶች',
  topicRoadMarkings: 'የመንገድ ምልክቶች',
  topicRightOfWay:   'ቅድሚያ ምልክቶች',
  topicSafety:       'ደህንነት ምልክቶች',

  // ─── Results ────────────────────────────────────────────────────────────────
  examResult:       'የፈተና ውጤት',
  goHome:           'ቤት',
  tryAgain:         'ዳግም ሞክር',
  topicBreakdown:   'በርዕስ ጉዳይ',
} as const;

/**
 * Interface texts that were left in HEBREW on screens (found 2026-10-01): a
 * user who reads only Amharic could not understand them, and the four a11y*
 * labels are what the screen reader (TalkBack) says aloud for a button.
 * Wording chosen by the app owner on 2026-10-06 from options written by Gemini
 * (shareApp is the owner's own wording). Engine A screens only use the a11y*
 * labels; the rest appear in Engine B and on the shared result screen.
 */
export const UiStrings = {
  levelsHeader:  (n: number) => "" + n + " የትምህርት ደረጃዎች • ከመሰረቱ ጀምሮ",
  topicCount:    (n: number) => "" + n + " ርዕሰ ጉዳዮች",
  underDevTitle: "በሂደት",
  underDevBody:  "ይህ ይዘት በልማት ላይ ነው።",
  backToList:    "ወደ ዝርዝሩ ተመለስ",
  topicLabel:    "ርዕሰ ጉዳይ",
  shareApp:      "አፕሊኬሽኑን ለሌሎች አጋሩ",
  shareSuccess:  "ስኬትዎን ያጋሩ",
  a11yBack:      "ተመለስ",
  a11yShare:     "ማጋራት",
  a11yLevel:     (n: number | string) => "ደረጃ " + n + "",
  a11yTopicQuiz: "የርዕሰ ጉዳዩ ፈተና",
  /** Label of the "ad privacy choices" button (EU / UK / CH users only). Gemini option 1, picked by the owner 2026-10-25
   *  (scripts/translatePrivacyOptionsLabel.mjs). If ever emptied, the button shows the icon only. */
  privacyOptions: "ማስታወቂያ ምርጫ",
} as const;
