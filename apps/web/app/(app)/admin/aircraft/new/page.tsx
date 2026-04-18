import { CreateAircraftForm } from './CreateAircraftForm';
import { PageHeader } from '@/components/ui';

export default function NewAircraftPage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Add Aircraft"
        subtitle="Creates the aircraft plus an initial baseline flight log entry with the clocks you enter."
      />
      <CreateAircraftForm />
    </main>
  );
}
