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
            padding: '0.4rem 0.75rem',
            background: '#fde68a',
            border: '1px solid #f59e0b',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.85rem',
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
            padding: '0.5rem 0.75rem',
            background: '#fee2e2',
            border: '1px solid #b91c1c',
            borderRadius: 4,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#7f1d1d',
            fontSize: '0.85rem',
          }}
        >
          <span>Overdue flight: reservation {id.slice(0, 8)}</span>
          <button
            type="button"
            onClick={() => dismiss(id)}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: '#7f1d1d',
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
