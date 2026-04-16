/**
 * /profile/notifications — Phase 8 (08-02, NOT-02).
 *
 * Per-event × per-channel toggle matrix. Rows are grouped notification
 * kinds (Reservations / Grading / Squawks / Documents & Currency /
 * Messaging / Safety) and columns are (in_app, email). Safety-critical
 * in_app cells are disabled (always delivered).
 */
import { NotificationPrefsMatrix } from './NotificationPrefsMatrix';

export const dynamic = 'force-dynamic';

export default function NotificationPrefsPage() {
  return (
    <main style={{ padding: '1rem', maxWidth: 900 }}>
      <h1>Notification preferences</h1>
      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
        Choose which alerts reach you and how. Safety-critical in-app alerts are always delivered
        even if you disable the channel.
      </p>
      <NotificationPrefsMatrix />
    </main>
  );
}
