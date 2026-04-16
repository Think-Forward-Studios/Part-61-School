'use client';

/**
 * AppShellProviders — Phase 8 (08-02).
 *
 * Mounted once at the root layout. Carries the userId + schoolId
 * resolved server-side (in (app)/layout.tsx via a hydration shim) or
 * `null` when the caller is unauthenticated (public/login pages) so
 * the Realtime channel is simply not opened.
 *
 * Order:
 *   TRPCProvider → RealtimeUserChannelProvider → MessagingDrawerProvider
 *
 * The MessagingDrawer itself is rendered here so the drawer state
 * survives navigations between authenticated pages.
 */
import type { ReactNode } from 'react';
import { RealtimeUserChannelProvider } from './RealtimeUserChannelProvider';
import { MessagingDrawerProvider } from './MessagingDrawerProvider';
import { MessagingDrawer } from './MessagingDrawer';

interface Props {
  userId: string | null;
  schoolId: string | null;
  children: ReactNode;
}

export function AppShellProviders({ userId, schoolId, children }: Props) {
  return (
    <RealtimeUserChannelProvider userId={userId} schoolId={schoolId}>
      <MessagingDrawerProvider>
        {children}
        <MessagingDrawer currentUserId={userId} />
      </MessagingDrawerProvider>
    </RealtimeUserChannelProvider>
  );
}
