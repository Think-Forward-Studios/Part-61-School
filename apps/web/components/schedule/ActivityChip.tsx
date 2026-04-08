/**
 * Small colored chip per reservation activity_type. Colors are locked
 * in @part61/domain/scheduleLabels and must not vary per school.
 */
import { activityTypeColor, activityTypeLabels, type ActivityType } from '@part61/domain';

export function ActivityChip({ type }: { type: string }) {
  const color = activityTypeColor(type);
  const label = (activityTypeLabels as Record<string, string>)[type] ?? type;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '0.1rem 0.45rem',
        borderRadius: 3,
        fontSize: '0.72rem',
        fontWeight: 600,
        background: color,
        color: 'white',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

export function activityChipColor(t: ActivityType | string) {
  return activityTypeColor(t);
}
