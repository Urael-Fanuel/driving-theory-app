/**
 * TrafficSignIcon.tsx
 * Renders the top 4 topics as real international traffic sign shapes.
 * All others get a clean MaterialCommunityIcons vector icon.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// ── Modern vector icons for behavioral topic levels ───────────────────────────
export const BEHAVIORAL_LEVEL_ICON_MAP: Record<string, string> = {
  // vehicle_knowledge
  vk_l1: 'car-outline',
  vk_l2: 'car-door',
  vk_l3: 'speedometer',
  vk_l4: 'car-light-high',
  vk_l5: 'engine-outline',
  vk_l6: 'clipboard-check-outline',
  vk_l7: 'car-brake-hold',
  vk_l8: 'shield-car',
  // mind_safety
  ms_l1: 'sleep',
  ms_l2: 'weather-night',
  ms_l3: 'glass-wine',
  ms_l4: 'head-heart-outline',
  // society_law
  sl_l1: 'walk',
  sl_l2: 'police-badge-outline',
  // the_road
  tr_l1: 'city',
  tr_l2: 'road-variant',
  tr_l3: 'weather-pouring',
  // my_vehicle
  mv_l1: 'car-brake-alert',
  mv_l2: 'parking',
  mv_l3: 'account-group',
  // two_wheelers
  tw_l1: 'motorbike',
  tw_l2: 'motorbike-electric',
  // basics_license
  bl_l1: 'card-account-details-outline',
  bl_l2: 'medical-bag',
};

// ── Level count for behavioral topics (no sign_count in DB) ───────────────────
export const TOPIC_SUBTOPIC_COUNT: Record<string, number> = {
  vehicle_knowledge: 8,
  mind_safety:       4,
  society_law:       2,
  the_road:          3,
  my_vehicle:        3,
  two_wheelers:      2,
  basics_license:    2,
};

// ── Primary color of each topic's icon (used for count badge) ─────────────────
export const TOPIC_ICON_COLOR: Record<string, string> = {
  regulatory:            '#1565C0',
  warning:               '#C62828',
  right_of_way:          '#C62828',
  prohibitions:          '#C62828',
  information_guidance:  '#555555',
  public_transport:      '#555555',
  traffic_lights:        '#555555',
  road_markings:         '#555555',
  work_site:             '#555555',
  vehicle_knowledge:     '#555555',
  mind_safety:           '#555555',
  society_law:           '#555555',
  the_road:              '#555555',
  my_vehicle:            '#555555',
  two_wheelers:          '#555555',
  basics_license:        '#555555',
};

// ── Vector icon map for non-sign topics ───────────────────────────────────────
export const TOPIC_ICON_MAP: Record<string, string> = {
  regulatory:            'shield-check',
  warning:               'alert-decagram',
  right_of_way:          'arrow-up-bold-circle',
  prohibitions:          'cancel',
  information_guidance:  'information',
  public_transport:      'bus',
  traffic_lights:        'traffic-light',
  road_markings:         'road-variant',
  work_site:             'hammer-wrench',
  vehicle_knowledge:     'car-wrench',
  mind_safety:           'brain',
  society_law:           'scale-balance',
  the_road:              'map',
  my_vehicle:            'car-sports',
  two_wheelers:          'motorbike',
  basics_license:        'card-account-details',
};

interface Props {
  topicId: string;
  size: number;   // base size (e.g. 60 for Engine A, 42 for Engine B)
}

export function TrafficSignIcon({ topicId, size }: Props) {

  // ── 1. Regulatory — blue mandatory circle ──────────────────────────────────
  if (topicId === 'regulatory') {
    return (
      <View style={[styles.circle, {
        width:           size,
        height:          size,
        borderRadius:    size / 2,
        backgroundColor: '#1565C0',
        borderWidth:     size * 0.07,
        borderColor:     '#ffffff',
      }]}>
        <MaterialCommunityIcons name="arrow-right-bold" size={size * 0.48} color="#ffffff" />
      </View>
    );
  }

  // ── 2. Warning — red-bordered yellow diamond / triangle ────────────────────
  if (topicId === 'warning') {
    const diamond = size * 0.72;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* Diamond shape (rotated square) */}
        <View style={{
          position:        'absolute',
          width:           diamond,
          height:          diamond,
          backgroundColor: '#FFFDE7',
          borderWidth:     size * 0.07,
          borderColor:     '#C62828',
          borderRadius:    size * 0.06,
          transform:       [{ rotate: '45deg' }],
        }} />
        {/* Icon counter-rotated to stay upright */}
        <MaterialCommunityIcons name="exclamation-thick" size={size * 0.46} color="#1a1a1a" />
      </View>
    );
  }

  // ── 3. Right of way — red-bordered inverted triangle (yield) ───────────────
  if (topicId === 'right_of_way') {
    const diamond = size * 0.72;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          position:        'absolute',
          width:           diamond,
          height:          diamond,
          backgroundColor: '#ffffff',
          borderWidth:     size * 0.07,
          borderColor:     '#C62828',
          borderRadius:    size * 0.06,
          transform:       [{ rotate: '45deg' }],
        }} />
        <MaterialCommunityIcons name="chevron-down-circle-outline" size={size * 0.5} color="#C62828" />
      </View>
    );
  }

  // ── 4. Prohibitions — red no-entry circle ─────────────────────────────────
  if (topicId === 'prohibitions') {
    return (
      <View style={[styles.circle, {
        width:           size,
        height:          size,
        borderRadius:    size / 2,
        backgroundColor: '#C62828',
        borderWidth:     size * 0.07,
        borderColor:     '#ffffff',
      }]}>
        <MaterialCommunityIcons name="minus-thick" size={size * 0.48} color="#ffffff" />
      </View>
    );
  }

  // ── All other topics — standard vector icon ────────────────────────────────
  const iconName = TOPIC_ICON_MAP[topicId] ?? 'view-grid';
  return (
    <MaterialCommunityIcons name={iconName as any} size={size * 0.85} color="#555" />
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems:     'center',
  },
});
