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
        background: 'white',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0 }}>Grade Sheet</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.2rem',
            cursor: 'pointer',
          }}
        >
          &#x2715;
        </button>
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <p style={{ color: '#666' }}>Grade sheet: {gradeSheetId}</p>
        <a
          href={`/admin/grade-sheets/${gradeSheetId}`}
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          Open full grading form &rarr;
        </a>
      </div>
    </div>
  );
}
