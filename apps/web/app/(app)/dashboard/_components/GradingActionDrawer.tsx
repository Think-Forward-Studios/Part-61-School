'use client';

interface Props {
  gradeSheetId: string;
  onClose: () => void;
}

export function GradingActionDrawer({ gradeSheetId, onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#0d1220',
        borderLeft: '1px solid #1f2940',
        boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.55)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        color: '#cbd5e1',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #1f2940',
        }}
      >
        <h3
          style={{
            margin: 0,
            color: '#f7f9fc',
            fontFamily: '"Antonio", system-ui, sans-serif',
            fontSize: '1.1rem',
            letterSpacing: '0.02em',
          }}
        >
          Grade Sheet
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #1f2940',
            borderRadius: 6,
            color: '#7a869a',
            fontSize: '1rem',
            padding: '0.2rem 0.5rem',
            cursor: 'pointer',
          }}
        >
          &#x2715;
        </button>
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <p
          style={{
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.78rem',
            letterSpacing: '0.05em',
          }}
        >
          Grade sheet: {gradeSheetId}
        </p>
        <a
          href={`/admin/grade-sheets/${gradeSheetId}`}
          style={{ color: '#38bdf8', textDecoration: 'underline' }}
        >
          Open full grading form &rarr;
        </a>
      </div>
    </div>
  );
}
