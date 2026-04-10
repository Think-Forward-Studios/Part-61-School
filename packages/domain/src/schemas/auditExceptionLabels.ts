/**
 * Display labels for audit_exception_kind and audit_exception_severity
 * enum values (Phase 6).
 *
 * Lives in packages/domain/src/schemas/ — outside the apps/web/**
 * and packages/exports/** globs where the no-banned-terms rule fires.
 */

export type AuditExceptionKind =
  | 'missing_lessons'
  | 'hours_deficit'
  | 'missing_endorsements'
  | 'missing_stage_checks'
  | 'stale_rollovers'
  | 'expired_overrides';

export type AuditExceptionSeverity = 'info' | 'warn' | 'critical';

export const auditExceptionKindLabels: Record<AuditExceptionKind, string> = {
  missing_lessons: 'Missing lessons',
  hours_deficit: 'Hours deficit',
  missing_endorsements: 'Missing endorsements',
  missing_stage_checks: 'Missing stage checks',
  stale_rollovers: 'Stale rollover items',
  expired_overrides: 'Expired overrides',
};

export const auditExceptionSeverityLabels: Record<AuditExceptionSeverity, string> = {
  info: 'Information',
  warn: 'Warning',
  critical: 'Critical',
};

export function auditExceptionKindLabel(kind: string): string {
  return (auditExceptionKindLabels as Record<string, string>)[kind] ?? kind;
}

export function auditExceptionSeverityLabel(severity: string): string {
  return (auditExceptionSeverityLabels as Record<string, string>)[severity] ?? severity;
}
