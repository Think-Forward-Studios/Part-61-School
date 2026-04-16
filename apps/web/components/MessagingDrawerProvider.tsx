'use client';

/**
 * MessagingDrawerProvider — Phase 8 (08-02, MSG-01/MSG-03).
 *
 * Holds drawer open-state + active conversationId so the MessagingDrawer
 * (mounted once at the root layout) survives navigations between pages.
 *
 * `openConversation(otherUserId)` is the admin/DM-button entry point
 * used by /admin/active-sessions — it opens the drawer and primes the
 * active conversation. Resolving the conversationId happens via
 * `trpc.messaging.conversations.open` inside the drawer itself so that
 * the provider stays tRPC-free (and server-component safe).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ContextValue {
  open: boolean;
  activeConversationId: string | null;
  pendingOtherUserId: string | null;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setActiveConversationId: (id: string | null) => void;
  openConversation: (otherUserId: string) => void;
  clearPendingOtherUser: () => void;
}

const Ctx = createContext<ContextValue | null>(null);

export function useMessagingDrawer(): ContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback when provider isn't mounted (e.g. unauthenticated
    // pages). Return a no-op surface so components that render the
    // drawer button don't throw.
    return {
      open: false,
      activeConversationId: null,
      pendingOtherUserId: null,
      toggle: () => undefined,
      setOpen: () => undefined,
      setActiveConversationId: () => undefined,
      openConversation: () => undefined,
      clearPendingOtherUser: () => undefined,
    };
  }
  return v;
}

export function MessagingDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingOtherUserId, setPendingOtherUserId] = useState<string | null>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const openConversation = useCallback((otherUserId: string) => {
    setPendingOtherUserId(otherUserId);
    setOpen(true);
  }, []);
  const clearPendingOtherUser = useCallback(() => setPendingOtherUserId(null), []);

  const value = useMemo<ContextValue>(
    () => ({
      open,
      activeConversationId,
      pendingOtherUserId,
      toggle,
      setOpen,
      setActiveConversationId,
      openConversation,
      clearPendingOtherUser,
    }),
    [
      open,
      activeConversationId,
      pendingOtherUserId,
      toggle,
      openConversation,
      clearPendingOtherUser,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
