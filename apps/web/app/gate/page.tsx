// Server component — renders a standard HTML form POST.
// Avoids JS/fetch entirely so Safari ITP doesn't drop the cookie.

type SearchParams = { next?: string; error?: string };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = params.next || '/';
  const hasError = params.error === '1';

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

        <form method="POST" action="/api/gate">
          <input type="hidden" name="next" value={next} />
          <label
            htmlFor="gate-password"
            style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}
          >
            Password
          </label>
          <input
            id="gate-password"
            name="password"
            type="password"
            placeholder="Team password"
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
          {hasError && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
              Incorrect password
            </p>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: '1rem',
              padding: '0.7rem',
              background: '#fafafa',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
