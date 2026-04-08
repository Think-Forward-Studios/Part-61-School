'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function SchoolSettingsForm({
  initial,
}: {
  initial: { name: string; timezone: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const update = trpc.admin.school.update.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        name: String(fd.get('name') ?? ''),
        timezone: String(fd.get('timezone') ?? ''),
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {ok ? <p style={{ color: 'green' }}>Saved.</p> : null}
      <label>
        School name <input name="name" defaultValue={initial.name} required />
      </label>
      <label>
        Timezone (IANA){' '}
        <input
          name="timezone"
          defaultValue={initial.timezone}
          required
          placeholder="America/Los_Angeles"
        />
      </label>
      <button type="submit">Save</button>
    </form>
  );
}
