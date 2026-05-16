/**
 * components/shared/DisclaimerModal.tsx
 * Shows Amharic terms of service on first launch.
 * Auto-plays audio. User must tap "ገባኝ" to dismiss (persisted — never shown again).
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Colors }     from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAudio }   from '../../hooks/useAudio';

interface Props {
  visible: boolean;
  onAccept: () => void;
}

const SECTIONS = [
  {
    num: '1',
    title: 'የአፕሊኬሽኑ ዓላማ',
    body:  'ይህ አፕሊኬሽን ተጠቃሚዎች የንድፈ ሃሳብ ፈተናዎችን እንዲዘጋጁ ለመርዳት የተዘጋጀ ነው። ይዘቱ በእስራኤል የትራፊክ ደንቦች እና በቪየና ዓለም አቀፍ ስምምነት ላይ የተመሰረተ ነው። ይህ አፕሊኬሽን በአገርዎ ውስጥ ላለው ኦፊሴላዊ የፍቃድ ባለሥልጣን ቁሳቁስ ምትክ አይደለም።',
  },
  {
    num: '2',
    title: 'የተጠያቂነት ገደብ',
    body:  'ገንቢው ይህን አፕሊኬሽን ብቻ ተመርኩዞ ፈተናው ያልተሳካ ከሆነ ተጠያቂ አይሆንም። በእስራኤል የትራፊክ ደንቦች እና በሌሎች አገሮች ደንቦች መካከል ልዩነቶች ሊኖሩ ይችላሉ። አፕሊኬሽኑን መጠቀም ሙሉ በሙሉ የተጠቃሚው ኃላፊነት ነው።',
  },
  {
    num: '3',
    title: 'ክፍያ እና መሰረዝ',
    body:  'ክፍያ ለተመረጠው የምዝገባ ጊዜ አስቀድሞ ይፈጸማል። ምዝገባ ከተካሄደ በኋላ ገንዘብ አይመለስም። በአፕሊኬሽኑ በኩል የተረጋገጠ ቴክኒካዊ ብልሽት ከተከሰተ ገንቢው እያንዳንዱን ጉዳይ በተናጠል ይገመግማል።',
  },
  {
    num: '4',
    title: 'የፍቃድ አጠቃቀም',
    body:  'ይህ አፕሊኬሽን ለግል አጠቃቀም ብቻ የታሰበ ነው። ከገንቢው የጽሁፍ ፈቃድ ሳይኖር የአፕሊኬሽኑን ይዘት መቅዳት፣ ማሰራጨት፣ መሸጥ ወይም ማሻሻያ ማድረግ ጥብቅ ክልከላ ነው። ይህን ውል መጣስ ህጋዊ ሂደቶችን ሊያስከትል ይችላል።',
  },
  {
    num: '5',
    title: 'ግላዊነት',
    body:  'አፕሊኬሽኑ አገልግሎቱን ለማሻሻል ማንነት የለሽ የአጠቃቀም ውሂብ ሊሰበስብ ይችላል። የተጠቃሚ ስምምነት ሳይኖር ግለሰቡን የሚያሳይ ምንም ዓይነት መረጃ አይሰበሰብም። ገንቢው የተጠቃሚ ውሂብ ለሶስተኛ ወገኖች አለመሸጥ ያረጋግጣል።',
  },
  {
    num: '6',
    title: 'ለውሎቹ ለውጦች',
    body:  'ገንቢው እነዚህን ውሎች በማንኛውም ጊዜ የማሻሻል መብቱ የተጠበቀ ነው። ዋና ዋና ለውጦች በአፕሊኬሽኑ ውስጥ ይታተማሉ። ለውጦቹ ከታተሙ በኋላ አፕሊኬሽኑን መጠቀሙን መቀጠል አዲሶቹ ውሎችን መቀበልን ያሳያል።',
  },
];

export default function DisclaimerModal({ visible, onAccept }: Props) {
  const { playAudio, stopAudio, pauseAudio, resumeAudio, audioState } = useAudio();
  const hasAutoPlayed = useRef(false);

  useEffect(() => {
    if (visible && !hasAutoPlayed.current) {
      hasAutoPlayed.current = true;
      playAudio('assets/audio/disclaimer.mp3').catch(() => {});
    }
    if (!visible) {
      stopAudio().catch(() => {});
    }
  }, [visible]);

  const handleAudioToggle = () => {
    if (audioState === 'playing') {
      pauseAudio().catch(() => {});
    } else if (audioState === 'paused') {
      resumeAudio().catch(() => {});
    } else {
      // finished / idle / error → replay from beginning
      playAudio('assets/audio/disclaimer.mp3').catch(() => {});
    }
  };

  const speakerIcon =
    audioState === 'playing' ? '⏸' : '▶️';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.speakerBtn} onPress={handleAudioToggle}>
            <Text style={styles.speakerIcon}>{speakerIcon}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>የአጠቃቀም ውሎች</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Ethiopian flag stripe */}
        <View style={styles.flagBar}>
          <View style={[styles.flagStripe, { backgroundColor: '#078930' }]} />
          <View style={[styles.flagStripe, { backgroundColor: '#FCDD09' }]} />
          <View style={[styles.flagStripe, { backgroundColor: '#DA121A' }]} />
        </View>

        {/* Intro */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* DISCLAIMER chip */}
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>DISCLAIMER</Text>
            </View>
          </View>

          <Text style={styles.intro}>
            ወደ አማርኛ የንድፈ ሃሳብ ፈተና ዝግጅት አፕሊኬሽን እንኳን ደህና መጡ። ይህን አፕሊኬሽን
            በመጠቀምዎ የሚከተሉትን ውሎች ይስማሙ።
          </Text>

          {/* Sections */}
          {SECTIONS.map(sec => (
            <View key={sec.num} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{sec.num}</Text>
                </View>
                <Text style={styles.sectionTitle}>{sec.title}</Text>
              </View>
              <Text style={styles.sectionBody}>{sec.body}</Text>
            </View>
          ))}

          {/* Closing instruction */}
          <View style={styles.closingBox}>
            <Text style={styles.closingText}>
              ከተረዱ እና ከተስማሙ፣ ከታች ባለው አረንጓዴ{' '}
              <Text style={styles.closingHighlight}>❝ ገባኝ ❞</Text>
              {' '}ቁልፍ ላይ ይጫኑ።
            </Text>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>

        {/* Accept button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.85}>
            <Text style={styles.acceptText}>ገባኝ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
    backgroundColor:   Colors.surface,
  },
  title: {
    ...Typography.h2,
    color:     Colors.textPrimary,
    flex:      1,
    textAlign: 'center',
  },
  speakerBtn: {
    width:           44,
    height:          44,
    borderRadius:    10,
    backgroundColor: '#E67E22',
    justifyContent:  'center',
    alignItems:      'center',
  },
  speakerIcon: {
    fontSize: 20,
  },

  // ── Ethiopian flag bar ───────────────────────────────────────────────────────
  flagBar: {
    flexDirection: 'row',
    height:        4,
  },
  flagStripe: {
    flex: 1,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
  },

  // ── DISCLAIMER chip ──────────────────────────────────────────────────────────
  chipRow: {
    alignItems:   'flex-end',
    marginBottom: 12,
  },
  chip: {
    borderWidth:   1,
    borderColor:   Colors.secondary,
    borderRadius:  20,
    paddingHorizontal: 12,
    paddingVertical:    4,
  },
  chipText: {
    fontSize:    11,
    fontWeight:  '700',
    color:       Colors.secondary,
    letterSpacing: 1,
  },

  // ── Intro ────────────────────────────────────────────────────────────────────
  intro: {
    ...Typography.body,
    color:        Colors.textSecondary,
    marginBottom: 20,
    lineHeight:   26,
    textAlign:    'center',
  },

  // ── Sections ─────────────────────────────────────────────────────────────────
  section: {
    marginBottom:    16,
    backgroundColor: Colors.surface,
    borderRadius:    14,
    padding:         16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  10,
  },
  badge: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: '#2E7D32',
    justifyContent:  'center',
    alignItems:      'center',
    marginRight:     10,
  },
  badgeText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   14,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.secondary,
    flex:  1,
  },
  sectionBody: {
    ...Typography.body,
    color:      Colors.textSecondary,
    lineHeight: 24,
    textAlign:  'center',
  },

  // ── Closing ──────────────────────────────────────────────────────────────────
  closingBox: {
    marginTop:         8,
    marginBottom:      16,
    backgroundColor:   Colors.surface,
    borderRadius:      12,
    padding:           16,
    borderLeftWidth:   3,
    borderLeftColor:   Colors.primary,
  },
  closingText: {
    ...Typography.body,
    color:      Colors.textPrimary,
    lineHeight: 26,
    textAlign:  'center',
  },
  closingHighlight: {
    color:      Colors.primary,
    fontWeight: 'bold',
  },
  bottomPad: {
    height: 16,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     Platform.OS === 'android' ? 24 : 16,
    backgroundColor:   Colors.surface,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    16,
    paddingVertical: 18,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
  },
  acceptText: {
    ...Typography.h2,
    color: Colors.textOnPrimary,
  },
});
