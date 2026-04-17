'use client';
import { type ReactNode } from 'react';
import { CsvDownloadButton } from './CsvDownloadButton';
import { PdfDownloadButton } from './PdfDownloadButton';

interface ColumnDef {
  key: string;
  label: string;
  format?: (v: unknown) => string;
}

interface Props {
  title: string;
  slug: string;
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
  isLoading?: boolean;
  error?: string | null;
  filters: ReactNode;
}

export function ReportShell({ title, slug, columns, rows, isLoading, error, filters }: Props) {
  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1rem',
          gap: '1rem',
          flexWrap: 'wrap',
          paddingBottom: '1rem',
          borderBottom: '1px solid #1a2238',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.68rem',
              letterSpacing: '0.25em',
              color: '#5b6784',
              textTransform: 'uppercase',
              marginBottom: '0.3rem',
            }}
          >
            Analytics · Report
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Antonio", system-ui, sans-serif',
              fontSize: 'clamp(1.6rem, 2.4vw, 1.9rem)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: '#f7f9fc',
            }}
          >
            {title}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <CsvDownloadButton slug={slug} />
          <PdfDownloadButton slug={slug} />
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          padding: '0.85rem 1rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 8,
        }}
      >
        {filters}
      </div>

      {isLoading ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.78rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Loading…
        </div>
      ) : error ? (
        <div
          style={{
            padding: '1rem 1.1rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderLeft: '3px solid #ef4444',
            borderRadius: 6,
            color: '#fca5a5',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      ) : rows.length === 0 ? (
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
          No data for the selected filters.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
            }}
          >
            <thead>
              <tr style={{ background: '#121826' }}>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      padding: '0.6rem 0.8rem',
                      textAlign: 'left',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.68rem',
                      letterSpacing: '0.15em',
                      color: '#7a869a',
                      textTransform: 'uppercase',
                      fontWeight: 500,
                      borderBottom: '1px solid #1f2940',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid #161d30',
                    transition: 'background 0.1s ease',
                  }}
                >
                  {columns.map((c) => {
                    const val = row[c.key];
                    const display = c.format ? c.format(val) : String(val ?? '');
                    return (
                      <td
                        key={c.key}
                        style={{
                          padding: '0.7rem 0.8rem',
                          color: '#cbd5e1',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
