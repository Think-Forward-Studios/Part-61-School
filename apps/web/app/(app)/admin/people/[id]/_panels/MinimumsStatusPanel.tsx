'use client';

/**
 * MinimumsStatusPanel — renders FAA course minimums (SYL-21).
 *
 * Fetches admin.enrollments.getMinimumsStatus and renders per-category
 * progress bars with actual/required labels.
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

export function MinimumsStatusPanel({ enrollmentId }: { enrollmentId: string }) {
  const query = trpc.admin.enrollments.getMinimumsStatus.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>Loading minimums...</p>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>No minimums configured for this course version.</p>
      </section>
    );
  }

  const raw = query.data;
  const categories: Category[] = [];

  // The view returns columns like total_required, total_actual, etc.
  // or a categories jsonb. Handle both shapes.
  if (raw.categories && Array.isArray(raw.categories)) {
    for (const cat of raw.categories as Category[]) {
      categories.push(cat);
    }
  } else {
    // Flatten top-level keys that follow *_required / *_actual pattern
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
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Course minimums (FAA section 61)</h2>
        <p style={{ color: '#888' }}>No minimums configured for this course version.</p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: '1.5rem' }}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
