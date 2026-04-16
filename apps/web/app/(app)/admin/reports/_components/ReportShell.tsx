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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <CsvDownloadButton slug={slug} />
          <PdfDownloadButton slug={slug} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {filters}
      </div>
      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
          Loading report data...
        </div>
      ) : error ? (
        <div
          style={{
            padding: '1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
          No data for the selected filters.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              {columns.map((c) => (
                <th key={c.key} style={{ padding: '0.5rem' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {columns.map((c) => {
                  const val = row[c.key];
                  const display = c.format ? c.format(val) : String(val ?? '');
                  return (
                    <td key={c.key} style={{ padding: '0.5rem' }}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
