/**
 * Display labels for lesson.kind (Phase 5-03).
 * Neutral language — no banned terms.
 */
export type LessonKind = 'ground' | 'flight' | 'simulator' | 'oral' | 'written_test';

export const lessonKindLabels: Record<LessonKind, string> = {
  ground: 'Ground',
  flight: 'Flight',
  simulator: 'Simulator',
  oral: 'Oral',
  written_test: 'Written Test',
};
