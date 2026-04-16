'use client';

/**
 * RealtimeUserChannelProvider — Phase 8 (08-02).
 *
 * Per RESEARCH Pitfall 1 (connection storm) and Open Question #7
 * (realtime connection count at beta scale), we mount ONE Supabase
 * Realtime channel per user at the root layout. Consumers subscribe
 * via `useRealtimeEvents(kind, handler)` and the provider fans events
 * out to all subscribers for that kind.
 *
 * Three event kinds are multiplexed onto the single channel:
 *   - 'notification'  ←  INSERT on notifications  where user_id=eq.{userId}
 *   - 'message'       ←  INSERT on message (all inserts; RLS on the
 *                        client-side tRPC refetch drops non-participant
 *                        rows — see MessagingDrawer header comment for
 *                        the tradeoff rationale)
 *   - 'broadcast'     ←  INSERT on broadcast where school_id=eq.{schoolId}
 *
 * If the user is not authenticated (no userId), the provider renders
 * children as a pass-through and does not open any channel.
 *
 * BroadcastChannel-across-tabs sharing is DEFERRED — see RESEARCH Open
 * Question #7. If beta seat count pushes us past 200 concurrent
 * connections, revisit.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type RealtimeEventKind = 'notification' | 'message' | 'broadcast';

type Handler = (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => void;

interface ContextValue {
  subscribe: (kind: RealtimeEventKind, handler: Handler) => () => void;
  connected: boolean;
}

const RealtimeContext = createContext<ContextValue | null>(null);

export function useRealtimeEvents(kind: RealtimeEventKind, handler: Handler): void {
  const ctx = useContext(RealtimeContext);
  // Keep a stable ref to the latest handler so consumers can inline
  // their closure without forcing re-subscription each render.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ctx) return;
    const unsub = ctx.subscribe(kind, (payload) => handlerRef.current(payload));
    return unsub;
  }, [ctx, kind]);
}

interface ProviderProps {
  userId: string | null;
  schoolId: string | null;
  children: ReactNode;
}

export function RealtimeUserChannelProvider({ userId, schoolId, children }: ProviderProps) {
  const subscribersRef = useRef<Map<RealtimeEventKind, Set<Handler>>>(
    new Map([
      ['notification', new Set()],
      ['message', new Set()],
      ['broadcast', new Set()],
    ]),
  );
  const [connected, setConnected] = useState(false);

  const subscribe = useCallback((kind: RealtimeEventKind, handler: Handler) => {
    const set = subscribersRef.current.get(kind);
    if (!set) return () => undefined;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setConnected(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const fan =
      (kind: RealtimeEventKind) =>
      (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        const subs = subscribersRef.current.get(kind);
        if (!subs) return;
        subs.forEach((fn) => {
          try {
            fn(payload);
          } catch (err) {
            console.error(`[realtime] subscriber for ${kind} threw:`, err);
          }
        });
      };

    const channel = supabase.channel(`user:${userId}`);
    // supabase-js's postgres_changes handler types are overly strict
    // on the literal event name; cast through unknown to stay honest.
    type PGHandler = (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => void;
    const asPG = (fn: PGHandler): PGHandler => fn;
    channel
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        asPG(fan('notification')),
      )
      .on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'message' },
        asPG(fan('message')),
      );

    if (schoolId) {
      channel.on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast',
          filter: `school_id=eq.${schoolId}`,
        },
        asPG(fan('broadcast')),
      );
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
    });

    return () => {
      void supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [userId, schoolId]);

  const value = useMemo<ContextValue>(() => ({ subscribe, connected }), [subscribe, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
