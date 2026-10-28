/**
 * constants/topicNames.ts
 *
 * Amharic name of every topic, for screens that only have a topic id (per-topic breakdowns: the
 * exam result, the daily quiz result, the Engine B progress screen). One list, so these screens
 * always show the same names. Moved here from app/result/[sessionId].tsx (2026-10-27) when the
 * progress screen was found showing the raw ids ("regulatory", "warning") instead.
 */
export const TOPIC_NAMES: Record<string, string> = {
  regulatory:           'አስገዳጅ ምልክቶች',
  warning:              'የማስጠንቀቂያ ምልክቶች',
  right_of_way:         'የቅድሚያ መብት',
  prohibitions:         'የክልከላ ምልክቶች',
  information_guidance: 'የመረጃ ምልክቶች',
  public_transport:     'የህዝብ ማመላለሻ',
  traffic_lights:       'የትራፊክ መብራቶች',
  road_markings:        'የመንገድ ምልክቶች',
  work_site:            'የሥራ ቦታ ምልክቶች',
  vehicle_knowledge:    'መኪናን ማወቅ',
  mind_safety:          'አዕምሮ እና ደህንነት',
  society_law:          'ማህበረሰብ እና ህግ',
  the_road:             'የመንገድ ሁኔታዎች',
  my_vehicle:           'ትክክለኛ አነዳድ',
  two_wheelers:         'ሁለት ጎማ ተሽከርካሪ',
  road_decisions:       'የመንገድ ላይ ውሳኔዎች',
  basics_license:       'መሠረቶች እና ፍቃድ',
};

/** The Amharic name of a topic, or the id itself if a new topic is not in the list yet. */
export function topicName(topicId: string): string {
  return TOPIC_NAMES[topicId] ?? topicId;
}
