'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// The actual realtime integration depends on the RealtimeUserChannelProvider
// which may use a different event shape. This component provides the flash
// state and toast UI, consuming events from props.
type DispatchCue = {
  id: string;
  kind: string;
  sourceRecordId: string;
  title: string;
  body: string;
};

const FLASH_DURATION_MS = 60_000;

interface FlashEntry {
  cue: DispatchCue;
  expiresAt: number;
}

export function CueSubscriber() {
  const [, setFlashes] = useState<Map<string, FlashEntry>>(new Map());
  const [toasts, setToasts] = useState<DispatchCue[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addCue = useCallback((cue: DispatchCue) => {
    setFlashes((prev) => {
      const next = new Map(prev);
      next.set(cue.sourceRecordId, {
        cue,
        expiresAt: Date.now() + FLASH_DURATION_MS,
      });
      return next;
    });
    setToasts((prev) => [...prev, cue]);

    // Auto-clear flash after 60s
    const existing = timersRef.current.get(cue.sourceRecordId);
    if (existing) clearTimeout(existing);
    timersRef.current.set(
      cue.sourceRecordId,
      setTimeout(() => {
        setFlashes((prev) => {
          const next = new Map(prev);
          next.delete(cue.sourceRecordId);
          return next;
        });
        timersRef.current.delete(cue.sourceRecordId);
      }, FLASH_DURATION_MS),
    );

    // Auto-dismiss toast after 8s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== cue.id));
    }, 8000);
  }, []);

  // Listen for dispatch-kind notifications via custom event
  useEffect(() => {
    const handler = (e: CustomEvent<DispatchCue>) => addCue(e.detail);
    window.addEventListener('dispatch-cue' as string, handler as EventListener);
    return () => window.removeEventListener('dispatch-cue' as string, handler as EventListener);
  }, [addCue]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <>
      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxWidth: 360,
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                padding: '0.75rem 1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ fontWeight: 600, color: '#dc2626' }}>{t.title}</div>
              <div style={{ color: '#666', marginTop: '0.15rem' }}>{t.body}</div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  marginTop: '0.25rem',
                }}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Hook for DispatchBoard rows — returns whether a given ID should flash.
 * Consumes from the CueSubscriber's window-level event pattern.
 */
export function useDispatchFlash(recordId: string): { flashing: boolean } {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.sourceRecordId === recordId) {
        setFlashing(true);
        setTimeout(() => setFlashing(false), 60_000);
      }
    };
    window.addEventListener('dispatch-cue' as string, handler as EventListener);
    return () => window.removeEventListener('dispatch-cue' as string, handler as EventListener);
  }, [recordId]);

  return { flashing };
}
