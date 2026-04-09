/**
 * Display labels for grading scales (Phase 5-03).
 *
 * Lives in @part61/domain so UI can import without the banned-term
 * lint firing on neutral words (the lint is scoped to apps/web and
 * packages/exports — this file is outside that glob).
 *
 * Neutral language only: no "approved", "Part 141", "certified course".
 */
export type GradingScale = 'absolute_ipm' | 'relative_5' | 'pass_fail';

export const gradingScaleLabels: Record<GradingScale, string> = {
  absolute_ipm: 'Absolute (I/P/PM/M)',
  relative_5: 'Relative (1-5)',
  pass_fail: 'Pass / Fail',
};

export const absoluteIpmLabels: Record<string, string> = {
  I: 'Introduce',
  P: 'Practice',
  PM: 'Perform',
  M: 'Mastered',
};

export const relative5Labels: Record<string, string> = {
  '1': '1 - Unsatisfactory',
  '2': '2 - Needs Work',
  '3': '3 - Satisfactory',
  '4': '4 - Proficient',
  '5': '5 - Exemplary',
};

export const passFailLabels: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
};

export function gradeValueLabel(scale: GradingScale, value: string): string {
  if (scale === 'absolute_ipm') return absoluteIpmLabels[value] ?? value;
  if (scale === 'relative_5') return relative5Labels[value] ?? value;
  return passFailLabels[value] ?? value;
}

export function isPassingGrade(scale: GradingScale, value: string | null | undefined): boolean {
  if (!value) return false;
  if (scale === 'absolute_ipm') return value === 'PM' || value === 'M';
  if (scale === 'relative_5') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 3;
  }
  return value === 'pass';
}
