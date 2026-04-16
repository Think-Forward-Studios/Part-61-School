import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TRPCProvider } from '@/lib/trpc/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Part 61 School',
  description: 'Foundation bootstrap.',
};

/**
 * Root layout. Phase 8 (08-02): the per-user Realtime channel,
 * MessagingDrawerProvider, and globally-mounted MessagingDrawer live
 * inside `(app)/layout.tsx` because they require a resolved userId +
 * schoolId and must NOT open on unauthenticated surfaces (/login,
 * /register, etc.). Here at the root we only wire the tRPC + React
 * Query provider so server-component trees can seed data.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
