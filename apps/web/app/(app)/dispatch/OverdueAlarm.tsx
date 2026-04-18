'use client';

/**
 * OverdueAlarm (FTR-04).
 *
 * Watches a list of currently-overdue reservation ids and plays a
 * one-shot audio cue + shows a dismissible banner the first time each
 * id appears. The "seen" set is persisted in sessionStorage so a tab
 * reload doesn't re-fire the alarm for already-known overdue flights.
 *
 * Audio autoplay caveat: browsers block audio.play() until the user
 * has interacted with the page. The "Enable sound alerts" button
 * primes an HTMLAudioElement on click; subsequent overdue events can
 * play without a fresh gesture.
 */
import { useEffect, useRef, useState } from 'react';

const SEEN_KEY = 'p61.dispatch.seenOverdue.v1';

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

export function OverdueAlarm({ overdueIds }: { overdueIds: string[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [primed, setPrimed] = useState(false);
  const [banners, setBanners] = useState<string[]>([]);

  useEffect(() => {
    audioRef.current = new Audio('/sounds/overdue.wav');
    audioRef.current.preload = 'auto';
  }, []);

  useEffect(() => {
    const seen = loadSeen();
    const fresh = overdueIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.add(id));
    saveSeen(seen);
    setBanners((prev) => Array.from(new Set([...prev, ...fresh])));
    if (primed && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        /* ignore — gesture may have been revoked */
      });
    }
  }, [overdueIds, primed]);

  function prime() {
    if (!audioRef.current) return;
    audioRef.current
      .play()
      .then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setPrimed(true);
      })
      .catch(() => {
        setPrimed(false);
      });
  }

  function dismiss(id: string) {
    setBanners((prev) => prev.filter((x) => x !== id));
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {!primed ? (
        <button
          type="button"
          onClick={prime}
          style={{
            padding: '0.4rem 0.85rem',
            background: 'rgba(251, 191, 36, 0.12)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Enable sound alerts
        </button>
      ) : null}
      {banners.map((id) => (
        <div
          key={id}
          role="alert"
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 0.85rem',
            background: 'rgba(248, 113, 113, 0.12)',
            border: '1px solid rgba(248, 113, 113, 0.45)',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#f87171',
            fontSize: '0.85rem',
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.78rem',
              letterSpacing: '0.05em',
            }}
          >
            Overdue flight: reservation {id.slice(0, 8)}
          </span>
          <button
            type="button"
            onClick={() => dismiss(id)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#f87171',
              fontWeight: 600,
              padding: '0.25rem 0.65rem',
              fontSize: '0.7rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
