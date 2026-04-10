'use client';

/**
 * StudentMinimumsPanel — FAA course minimums for students (SYL-21).
 *
 * Uses record.getMyMinimumsStatus (student-scoped). Same progress bars
 * as the admin MinimumsStatusPanel but without a refresh button.
 */

import { trpc } from '@/lib/trpc/client';

type Category = {
  category: string;
  required: number;
  actual: number;
  remaining: number;
  percent: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  total: 'Total',
  dual: 'Dual received',
  solo: 'Solo',
  cross_country: 'Cross-country',
  night: 'Night',
  instrument: 'Instrument',
  solo_cross_country: 'Solo cross-country',
  landings_day: 'Day landings',
  landings_night: 'Night landings',
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, ' ');
}

function barColor(percent: number): string {
  if (percent >= 100) return '#16a34a';
  if (percent >= 50) return '#d97706';
  return '#94a3b8';
}

export function StudentMinimumsPanel({ enrollmentId }: { enrollmentId: string }) {
  const query = trpc.record.getMyMinimumsStatus.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>Loading minimums...</p>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>No minimums configured for this course version.</p>
      </section>
    );
  }

  const raw = query.data as Record<string, unknown>;
  const categories: Category[] = [];

  if (raw.categories && Array.isArray(raw.categories)) {
    for (const cat of raw.categories as Category[]) {
      categories.push(cat);
    }
  } else {
    const seen = new Set<string>();
    for (const key of Object.keys(raw)) {
      const match = key.match(/^(.+)_required$/);
      if (match) {
        const cat = match[1]!;
        if (seen.has(cat)) continue;
        seen.add(cat);
        const required = Number(raw[`${cat}_required`] ?? 0);
        const actual = Number(raw[`${cat}_actual`] ?? 0);
        const remaining = Math.max(0, required - actual);
        const percent = required > 0 ? Math.round((actual / required) * 100) : 0;
        categories.push({ category: cat, required, actual, remaining, percent });
      }
    }
  }

  if (categories.length === 0) {
    return (
      <section>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>No minimums configured for this course version.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {categories.map((c) => (
          <div key={c.category}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                marginBottom: '0.15rem',
              }}
            >
              <span>{categoryLabel(c.category)}</span>
              <span>
                {c.actual.toFixed(1)} / {c.required.toFixed(1)}
              </span>
            </div>
            <div
              style={{
                background: '#e5e7eb',
                borderRadius: 4,
                height: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(c.percent, 100)}%`,
                  height: '100%',
                  background: barColor(c.percent),
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            {c.remaining > 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.1rem' }}>
                {c.remaining.toFixed(1)} more hours needed
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
