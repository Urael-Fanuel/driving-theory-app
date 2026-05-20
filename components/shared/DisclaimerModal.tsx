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
  Image,
} from 'react-native';
import { useAudio } from '../../hooks/useAudio';

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  green:      '#0f5238',
  greenLight: '#2d6a4f',
  yellow:     '#f1c048',
  yellowBg:   'rgba(241,192,72,0.12)',
  yellowBdr:  'rgba(241,192,72,0.35)',
  red:        '#ba1a1a',
  redBg:      'rgba(186,26,26,0.06)',
  greenBg:    'rgba(15,82,56,0.06)',
  white:      '#ffffff',
  bg:         '#f7f9fb',
  surface:    '#ffffff',
  surfaceAlt: '#eceef0',
  textPri:    '#191c1e',
  textSec:    '#404943',
};

interface Props {
  visible: boolean;
  onAccept: () => void;
}

const SECTIONS: { num: string; title: string; body: string; color: string; titleColor: string }[] = [
  {
    num:        '1',
    title:      'የአፕሊኬሽኑ ዓላማ',
    body:       'ይህ አፕሊኬሽን ተጠቃሚዎች የንድፈ ሃሳብ ፈተናዎችን እንዲዘጋጁ ለመርዳት የተዘጋጀ ነው። ይዘቱ በእስራኤል የትራፊክ ደንቦች እና በቪየና ዓለም አቀፍ ስምምነት ላይ የተመሰረተ ነው። ይህ አፕሊኬሽን በአገርዎ ውስጥ ላለው ኦፊሴላዊ የፍቃድ ባለሥልጣን ቁሳቁስ ምትክ አይደለም።',
    color:      C.green,
    titleColor: C.green,
  },
  {
    num:        '2',
    title:      'የተጠያቂነት ገደብ',
    body:       'ገንቢው ይህን አፕሊኬሽን ብቻ ተመርኩዞ ፈተናው ያልተሳካ ከሆነ ተጠያቂ አይሆንም። በእስራኤል የትራፊክ ደንቦች እና በሌሎች አገሮች ደንቦች መካከል ልዩነቶች ሊኖሩ ይችላሉ። አፕሊኬሽኑን መጠቀም ሙሉ በሙሉ የተጠቃሚው ኃላፊነት ነው።',
    color:      C.yellow,
    titleColor: '#7a5800',
  },
  {
    num:        '3',
    title:      'ክፍያ እና መሰረዝ',
    body:       'ክፍያ ለተመረጠው የምዝገባ ጊዜ አስቀድሞ ይፈጸማል። ምዝገባ ከተካሄደ በኋላ ገንዘብ አይመለስም። በአፕሊኬሽኑ በኩል የተረጋገጠ ቴክኒካዊ ብልሽት ከተከሰተ ገንቢው እያንዳንዱን ጉዳይ በተናጠል ይገምግማል።',
    color:      C.red,
    titleColor: C.red,
  },
  {
    num:        '4',
    title:      'የፍቃድ አጠቃቀም',
    body:       'ይህ አፕሊኬሽን ለግል አጠቃቀም ብቻ የታሰበ ነው። ከገንቢው የጽሁፍ ፈቃድ ሳይኖር የአፕሊኬሽኑን ይዘት መቅዳት፣ ማሰራጨት፣ መሸጥ ወይም ማሻሻያ ማድረግ ጥብቅ ክልከላ ነው። ይህን ውል መጣስ ህጋዊ ሂደቶችን ሊያስከትል ይችላል።',
    color:      C.green,
    titleColor: C.green,
  },
  {
    num:        '5',
    title:      'ግላዊነት',
    body:       'አፕሊኬሽኑ አገልግሎቱን ለማሻሻል ማንነት የለሽ የአጠቃቀም ውሂብ ሊሰበስብ ይችላል። የተጠቃሚ ስምምነት ሳይኖር ግለሰቡን የሚያሳይ ምንም ዓይነት መረጃ አይሰበሰብም። ገንቢው የተጠቃሚ ውሂብ ለሶስተኛ ወገኖች አለመሸጥ ያረጋግጣል።',
    color:      C.yellow,
    titleColor: '#7a5800',
  },
  {
    num:        '6',
    title:      'ለውሎቹ ለውጦች',
    body:       'ገንቢው እነዚህን ውሎች በማንኛውም ጊዜ የማሻሻል መብቱ የተጠበቀ ነው። ዋና ዋና ለውጦች በአፕሊኬሽኑ ውስጥ ይታተማሉ። ለውጦቹ ከታተሙ በኋላ አፕሊኬሽኑን መጠቀሙን መቀጠል አዲሶቹ ውሎችን መቀበልን ያሳያል።',
    color:      C.red,
    titleColor: C.red,
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
      playAudio('assets/audio/disclaimer.mp3').catch(() => {});
    }
  };

  const speakerIcon = audioState === 'playing' ? '⏸' : '▶️';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.safeArea}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.speakerBtn} onPress={handleAudioToggle}>
            <Text style={styles.speakerIcon}>{speakerIcon}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>የአጠቃቀም ውሎች</Text>
          <View style={styles.disclaimerChip}>
            <Text style={styles.disclaimerChipText}>DISCLAIMER</Text>
          </View>
        </View>

        {/* ── Ethiopian flag stripe ───────────────────────────────────────── */}
        <View style={styles.flagBar}>
          <View style={[styles.flagStripe, { backgroundColor: '#078930' }]} />
          <View style={[styles.flagStripe, { backgroundColor: '#FCDD09' }]} />
          <View style={[styles.flagStripe, { backgroundColor: '#DA121A' }]} />
        </View>

        {/* ── Scrollable content ─────────────────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — logo only */}
          <View style={styles.hero}>
            <View style={styles.heroLogoWrapper}>
              <Image
                source={require('../../assets/images/NEW LOGO.png')}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Hero subtitle — below the logo box */}
          <Text style={styles.heroText}>
            ወደ አማርኛ የንድፈ ሃሳብ ፈተና ዝግጅት እንኳን ደህና መጡ
          </Text>

          {/* Intro */}
          <Text style={styles.intro}>
            ይህን አፕሊኬሽን በመጠቀምዎ የሚከተሉትን ውሎች ይስማሙ።
          </Text>

          {/* Section cards */}
          {SECTIONS.map((sec) => (
            <View
              key={sec.num}
              style={[styles.card, { borderLeftColor: sec.color, backgroundColor: C.white }]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: sec.color }]}>
                  <Text style={styles.badgeText}>{sec.num}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: sec.titleColor }]}>{sec.title}</Text>
              </View>
              <Text style={styles.cardBody}>{sec.body}</Text>
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

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Accept button ──────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.88}>
            <Text style={styles.acceptText}>ገባኝ ✓</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: C.bg,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
    backgroundColor:   C.green,
  },
  headerTitle: {
    flex:       1,
    textAlign:  'center',
    fontSize:   20,
    fontWeight: '700',
    color:      C.white,
  },
  speakerBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  speakerIcon: {
    fontSize: 18,
  },
  disclaimerChip: {
    backgroundColor:   C.yellow,
    borderRadius:      20,
    paddingHorizontal: 12,
    paddingVertical:   5,
  },
  disclaimerChipText: {
    fontSize:      10,
    fontWeight:    '700',
    color:         '#251a00',
    letterSpacing: 1,
  },

  // ── Flag bar ─────────────────────────────────────────────────────────────────
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

  // ── Hero ─────────────────────────────────────────────────────────────────────
  hero: {
    borderRadius:      14,
    backgroundColor:   C.white,
    marginBottom:      16,
    alignItems:        'center',
    justifyContent:    'center',
    paddingVertical:   6,
    paddingHorizontal: 6,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 3 },
    shadowOpacity:     0.1,
    shadowRadius:      8,
    elevation:         3,
  },
  heroLogoWrapper: {
    width:           220,
    height:          220,
    borderRadius:    24,
    overflow:        'hidden',
    backgroundColor: '#ffffff',
  },
  heroLogo: {
    width:  220,
    height: 220,
  },
  heroText: {
    color:         C.green,
    fontSize:      19,
    fontWeight:    '700',
    lineHeight:    28,
    textAlign:     'center',
    marginTop:     12,
    marginBottom:  16,
    paddingHorizontal: 8,
  },

  // ── Intro ─────────────────────────────────────────────────────────────────────
  intro: {
    fontSize:     18,
    color:        C.textSec,
    textAlign:    'center',
    marginBottom: 16,
    lineHeight:   26,
    paddingHorizontal: 8,
  },

  // ── Section cards ─────────────────────────────────────────────────────────────
  card: {
    borderRadius:    14,
    padding:         16,
    borderLeftWidth: 4,
    marginBottom:    12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  10,
    gap:           10,
  },
  badge: {
    width:          32,
    height:         32,
    borderRadius:   16,
    justifyContent: 'center',
    alignItems:     'center',
  },
  badgeText: {
    color:      C.white,
    fontWeight: '700',
    fontSize:   15,
  },
  cardTitle: {
    fontSize:   20,
    fontWeight: '700',
    flex:       1,
  },
  cardBody: {
    fontSize:   17,
    color:      C.textPri,
    lineHeight: 26,
  },

  // ── Closing ───────────────────────────────────────────────────────────────────
  closingBox: {
    backgroundColor: C.surface,
    borderRadius:    12,
    padding:         16,
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    3,
    elevation:       1,
  },
  closingText: {
    fontSize:   20,
    color:      C.textPri,
    lineHeight: 30,
    textAlign:  'center',
  },
  closingHighlight: {
    color:      C.green,
    fontWeight: 'bold',
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop:        14,
    paddingBottom:     Platform.OS === 'android' ? 24 : 14,
    backgroundColor:   C.surface,
    borderTopWidth:    2,
    borderTopColor:    'rgba(241,192,72,0.25)',
  },
  acceptBtn: {
    backgroundColor:  C.green,
    borderRadius:     14,
    paddingVertical:  18,
    alignItems:       'center',
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.25,
    shadowRadius:     8,
    elevation:        6,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  acceptText: {
    fontSize:   23,
    fontWeight: '700',
    color:      C.white,
  },
});
