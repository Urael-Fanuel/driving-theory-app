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
    audioState === 'playing' ? '⏸' :
    audioState === 'paused'  ? '▶️' : '🔊';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>የአጠቃቀም ውሎች</Text>
          <TouchableOpacity style={styles.speakerBtn} onPress={handleAudioToggle}>
            <Text style={styles.speakerIcon}>{speakerIcon}</Text>
          </TouchableOpacity>
        </View>

        {/* Intro */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.intro}>
            ወደ አማርኛ የንድፈ ሃሳብ ፈተና ዝግጅት አፕሊኬሽን እንኳን ደህና መጡ። ይህን አፕሊኬሽን
            በመጠቀምዎ የሚከተሉትን ውሎች ይስማሙ።
          </Text>

          {/* Sections */}
          {SECTIONS.map(sec => (
            <View key={sec.num} style={styles.section}>
              <Text style={styles.sectionTitle}>{sec.num}. {sec.title}</Text>
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
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingVertical:   16,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  speakerBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: Colors.card,
    justifyContent:  'center',
    alignItems:      'center',
  },
  speakerIcon: {
    fontSize: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop:        20,
  },
  intro: {
    ...Typography.body,
    color:        Colors.textSecondary,
    marginBottom: 24,
    lineHeight:   26,
  },
  section: {
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.secondary,
  },
  sectionTitle: {
    ...Typography.h3,
    color:        Colors.secondary,
    marginBottom: 8,
  },
  sectionBody: {
    ...Typography.body,
    color:      Colors.textSecondary,
    lineHeight: 24,
  },
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
