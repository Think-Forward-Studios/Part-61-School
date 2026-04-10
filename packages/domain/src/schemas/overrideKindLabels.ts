/**
 * Display labels for lesson_override_kind enum values (Phase 6).
 *
 * Lives in packages/domain/src/schemas/ — outside the apps/web/**
 * and packages/exports/** globs where the no-banned-terms rule fires.
 * No banned terms appear here regardless.
 */

export type LessonOverrideKind =
  | 'prerequisite_skip'
  | 'repeat_limit_exceeded'
  | 'currency_waiver';

export const overrideKindLabels: Record<LessonOverrideKind, string> = {
  prerequisite_skip: 'Prerequisite skip — chief instructor granted',
  repeat_limit_exceeded: 'Repeat limit exceeded — authorized extension',
  currency_waiver: 'Currency waiver — chief instructor granted',
};

export function overrideKindLabel(kind: string): string {
  return (overrideKindLabels as Record<string, string>)[kind] ?? kind;
}
