/**
 * AGENT 3 — app/(engineA)/(tabs)/progress.tsx
 * Engine A Progress Screen — Visual only (no text labels).
 *
 * Shows progress using colored circles/icons per topic.
 * No text for Engine A users.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Animated,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { ProgressBar } from '../../../components/shared/ProgressBar';
import { useProgress } from '../../../hooks/useProgress';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LocationPermissionModal } from '../../../components/shared/LocationPermissionModal';
import { useLocationPrompt } from '../../../hooks/useLocationPrompt';
import { useEngine } from '../../../contexts/EngineContext';

export default function EngineAProgressScreen() {
  const router = useRouter();
  const { userId } = useEngine();
  const {
    visible: locationModalVisible,
    approved: locationApproved,
    showManually: showLocationPrompt,
    handleApprove: handleLocationApprove,
    handleNotNow: handleLocationNotNow,
  } = useLocationPrompt(userId);

  // Gentle attention-drawing pulse on the 📍 button, same pattern as the
  // "Start Quiz" button elsewhere in the app — stops once approved.
  const locationPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (locationApproved) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(locationPulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(locationPulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [locationApproved]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <LocationPermissionModal
        visible={locationModalVisible}
        onApprove={handleLocationApprove}
        onNotNow={handleLocationNotNow}
      />
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

        {/* Location recommendations — permanent low-friction entry point so a
            user who dismissed the auto-prompt can still turn it on later.
            Hidden once already approved. */}
        {!locationApproved && (
          <Animated.View style={{ transform: [{ scale: locationPulseAnim }] }}>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={showLocationPrompt}
              activeOpacity={0.8}
              accessibilityLabel="የቅርብ ቅናሾችን አሳየኝ"
            >
              <MaterialCommunityIcons name="map-marker" size={36} color="#ffffff" />
            </TouchableOpacity>
          </Animated.View>
        )}

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
    backgroundColor: '#25D366',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#25D366',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    10,
    elevation:       6,
  },
  locationButton: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: '#29B6F6',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     3,
    borderColor:     '#B3E5FC',
    shadowColor:     '#29B6F6',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.7,
    shadowRadius:    18,
    elevation:       10,
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
