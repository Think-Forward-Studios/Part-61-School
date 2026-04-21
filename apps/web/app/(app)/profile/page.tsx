import { PageHeader } from '@/components/ui';
import { ProfileForm } from './ProfileForm';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Account & School"
        title="My Profile"
        subtitle="Personal details and contact information on file with the school. Legal-status fields (citizenship, TSA AFSP) are admin-managed and shown read-only."
      />
      <ProfileForm />
    </main>
  );
}
