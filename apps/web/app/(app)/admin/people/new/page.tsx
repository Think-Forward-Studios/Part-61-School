import { CreatePersonForm } from './CreatePersonForm';
import { PageHeader } from '@/components/ui';

export default function NewPersonPage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 800, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Directory"
        title="New Person"
        subtitle="Creates a user, sends an invitation email, and builds their profile. The user will be able to set their password from the invite link."
      />
      <CreatePersonForm />
    </main>
  );
}
