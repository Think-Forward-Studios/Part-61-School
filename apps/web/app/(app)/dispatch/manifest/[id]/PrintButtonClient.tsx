'use client';

export function PrintButtonClient() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: '0.5rem 1rem',
        background: '#0070f3',
        color: 'white',
        border: 0,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      Print
    </button>
  );
}
