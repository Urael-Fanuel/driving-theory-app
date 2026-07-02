/**
 * AGENT 3 — app/(engineA)/(tabs)/progress.tsx
 * Engine A Progress Screen — Visual only (no text labels).
 *
 * Shows progress using colored circles/icons per topic.
 * No text for Engine A users.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { useProgress } from '../../../hooks/useProgress';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function EngineAProgressScreen() {
  const router = useRouter();

  const handleShare = async () => {
    await Share.share({
      message: 'አብረን በደስታ እንማር! 🚗\n\nhttps://play.google.com/store/apps/details?id=com.drivingtheory.ethiopian',
    });
  };
  const { totalAttempted, totalCorrect } = useProgress();

  const overallPercent = totalAttempted > 0
    ? Math.round((totalCorrect / totalAttempted) * 100)
    : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Large circular progress indicator */}
        <View style={styles.circleContainer}>
          <View style={[
            styles.circle,
            { borderColor: overallPercent >= 80 ? Colors.correct : Colors.secondary }
          ]}>
            <Text style={styles.circlePercent}>{overallPercent}%</Text>
            {overallPercent >= 80 && <Text style={styles.passIcon}>🏆</Text>}
          </View>
        </View>

        {/* Stats icons row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>✅</Text>
            <Text style={styles.statNumber}>{totalCorrect}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>📝</Text>
            <Text style={styles.statNumber}>{totalAttempted}</Text>
          </View>
        </View>

        {/* Overall progress bar */}
        <ProgressBar
          current={totalCorrect}
          total={Math.max(totalAttempted, 1)}
          fillColor={Colors.primary}
          trackColor="#e8eaed"
          height={12}
          style={styles.progressBar}
        />

        {/* Share button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="share-variant" size={36} color="#ffffff" />
        </TouchableOpacity>

        {/* Start exam button */}
        <TouchableOpacity
          style={styles.examButton}
          onPress={() => router.push('/(engineA)/exam' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.examIcon}>📝</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: '#f7f9fb',
  },
  content: {
    padding:    24,
    alignItems: 'center',
    gap:        32,
  },
  circleContainer: {
    marginTop: 20,
  },
  circle: {
    width:           180,
    height:          180,
    borderRadius:    90,
    borderWidth:     8,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#ffffff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.10,
    shadowRadius:    10,
    elevation:       4,
  },
  circlePercent: {
    fontSize:   48,
    fontWeight: '900',
    color:      '#191c1e',
  },
  passIcon: {
    fontSize: 32,
  },
  statsRow: {
    flexDirection: 'row',
    gap:           48,
  },
  statItem: {
    alignItems: 'center',
    gap:        8,
  },
  statIcon: {
    fontSize: 40,
  },
  statNumber: {
    fontSize:   28,
    fontWeight: '700',
    color:      '#191c1e',
  },
  progressBar: {
    alignSelf: 'stretch',
  },
  shareButton: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: '#1976D2',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#1976D2',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    10,
    elevation:       6,
  },
  examButton: {
    width:           100,
    height:          100,
    borderRadius:    50,
    backgroundColor: Colors.accent,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     Colors.accent,
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.5,
    shadowRadius:    12,
    elevation:       8,
  },
  examIcon: {
    fontSize: 48,
  },
});
