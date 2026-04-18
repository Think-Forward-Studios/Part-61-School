import { PageHeader } from '@/components/ui';

export default function ProfilePage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Personal details and contact information."
      />
      <div
        style={{
          padding: '3rem 1rem',
          textAlign: 'center',
          color: '#7a869a',
          fontSize: '0.88rem',
          background: '#0d1220',
          border: '1px dashed #1f2940',
          borderRadius: 12,
        }}
      >
        Profile fields land in a later plan.
      </div>
    </main>
  );
}
