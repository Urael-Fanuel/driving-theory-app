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
