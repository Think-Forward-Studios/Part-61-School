/**
 * Display labels for endorsement_template.category (AC 61-65K).
 * Neutral language — no banned terms.
 */
export type EndorsementCategory =
  | 'pre_solo'
  | 'solo'
  | 'solo_cross_country'
  | 'flight_review'
  | 'ipc'
  | 'complex'
  | 'high_performance'
  | 'high_altitude'
  | 'tailwheel'
  | 'knowledge_test'
  | 'practical_test'
  | 'retest'
  | 'glider_tow'
  | 'sport_pilot_solo'
  | 'other';

export const endorsementCategoryLabels: Record<EndorsementCategory, string> = {
  pre_solo: 'Pre-Solo',
  solo: 'Solo',
  solo_cross_country: 'Solo Cross-Country',
  flight_review: 'Flight Review',
  ipc: 'Instrument Proficiency Check',
  complex: 'Complex Aircraft',
  high_performance: 'High Performance',
  high_altitude: 'High Altitude / Pressurized',
  tailwheel: 'Tailwheel',
  knowledge_test: 'Knowledge Test',
  practical_test: 'Practical Test',
  retest: 'Retest After Failure',
  glider_tow: 'Glider Tow',
  sport_pilot_solo: 'Sport Pilot Solo',
  other: 'Other',
};
