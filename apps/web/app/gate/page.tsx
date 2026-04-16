'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateForm />
    </Suspense>
  );
}

function GateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      setError('Incorrect password');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#fafafa',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: '#161616',
          padding: '2rem 2.5rem',
          borderRadius: 12,
          border: '1px solid #2a2a2a',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            TFS Flight School
          </div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            Enter team password to continue
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="gate-password" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Password
          </label>
          <input
            id="gate-password"
            type="password"
            placeholder="Team password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%',
              padding: '0.6rem 0.8rem',
              background: '#0a0a0a',
              color: '#fafafa',
              border: '1px solid #333',
              borderRadius: 6,
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              marginTop: '1rem',
              padding: '0.7rem',
              background: loading ? '#2a2a2a' : '#fafafa',
              color: loading ? '#888' : '#0a0a0a',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
