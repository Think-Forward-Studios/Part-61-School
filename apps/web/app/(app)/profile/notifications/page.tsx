/**
 * /profile/notifications — Phase 8 (08-02, NOT-02).
 *
 * Per-event × per-channel toggle matrix. Rows are grouped notification
 * kinds (Reservations / Grading / Squawks / Documents & Currency /
 * Messaging / Safety) and columns are (in_app, email). Safety-critical
 * in_app cells are disabled (always delivered).
 */
import { NotificationPrefsMatrix } from './NotificationPrefsMatrix';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function NotificationPrefsPage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        subtitle="Choose which alerts reach you and how. Events flagged Safety always deliver in-app — the in-app tickbox is locked. Email still respects your choice for every event, safety or not."
      />
      <NotificationPrefsMatrix />
    </main>
  );
}
