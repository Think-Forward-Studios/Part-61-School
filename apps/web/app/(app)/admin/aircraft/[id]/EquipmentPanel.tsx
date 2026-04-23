'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

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
    setOk(false);
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
      setTimeout(() => setOk(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Equipment</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
        {TAGS.map((t) => {
          const on = selected.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 999,
                border: on
                  ? '1px solid rgba(251, 191, 36, 0.5)'
                  : '1px solid rgba(255,255,255,0.12)',
                background: on ? 'rgba(251, 191, 36, 0.15)' : 'rgba(9, 13, 24, 0.85)',
                color: on ? '#fbbf24' : '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.03em',
                fontWeight: on ? 700 : 500,
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          marginTop: '0.9rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onSave}
          style={s.primaryButton}
          disabled={setEquipment.isPending}
        >
          {setEquipment.isPending ? 'Saving…' : 'Save equipment tags'}
        </button>
        {error ? <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</span> : null}
        {ok ? <span style={{ color: '#4ade80', fontSize: '0.82rem' }}>Saved.</span> : null}
      </div>
    </section>
  );
}
