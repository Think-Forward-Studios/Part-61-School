'use client';
import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc/client';

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = trpc.register.submit.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await submit.mutateAsync({
        schoolId: String(fd.get('schoolId') ?? ''),
        email: String(fd.get('email') ?? ''),
        firstName: String(fd.get('firstName') ?? ''),
        lastName: String(fd.get('lastName') ?? ''),
        phone: (fd.get('phone') as string) || undefined,
        requestedRole: (fd.get('requestedRole') as 'student' | 'rental_customer') ?? 'student',
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  }

  if (done) {
    return (
      <p style={{ padding: '1rem', background: '#e6ffe6', borderRadius: 6 }}>
        Your registration has been submitted. An administrator will review it shortly and
        email you an invitation to set your password.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        School ID <input name="schoolId" required placeholder="uuid from your school" />
      </label>
      <label>
        Requested role{' '}
        <select name="requestedRole" defaultValue="student">
          <option value="student">Student</option>
          <option value="rental_customer">Rental customer</option>
        </select>
      </label>
      <label>
        Email <input name="email" type="email" required />
      </label>
      <label>
        First name <input name="firstName" required />
      </label>
      <label>
        Last name <input name="lastName" required />
      </label>
      <label>
        Phone <input name="phone" />
      </label>
      <button type="submit">Submit registration</button>
    </form>
  );
}
