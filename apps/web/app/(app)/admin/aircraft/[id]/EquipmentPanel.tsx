'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const TAGS = [
  'ifr_equipped',
  'complex',
  'high_performance',
  'glass_panel',
  'autopilot',
  'ads_b_out',
  'ads_b_in',
  'gtn_650',
  'gtn_750',
  'g1000',
  'g3x',
  'garmin_530',
  'kln_94',
  'tail_dragger',
  'retractable_gear',
] as const;
type Tag = (typeof TAGS)[number];

export function EquipmentPanel({
  aircraftId,
  initialTags,
}: {
  aircraftId: string;
  initialTags: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const setEquipment = trpc.admin.aircraft.setEquipment.useMutation();

  function toggle(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
  }

  async function onSave() {
    setError(null);
    setOk(false);
    try {
      await setEquipment.mutateAsync({
        aircraftId,
        tags: [...selected] as Tag[],
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Equipment</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {ok ? <p style={{ color: 'green' }}>Saved.</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 16,
              border: '1px solid #ccc',
              background: selected.has(t) ? '#0070f3' : 'white',
              color: selected.has(t) ? 'white' : 'black',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSave} style={{ marginTop: '0.75rem' }}>
        Save equipment tags
      </button>
    </section>
  );
}
