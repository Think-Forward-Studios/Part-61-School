'use client';
import { useSearchParams } from 'next/navigation';

export function PdfDownloadButton({ slug }: { slug: string }) {
  const params = useSearchParams();
  const href = `/admin/reports/${slug}/export.pdf?${params.toString()}`;
  return (
    <a
      href={href}
      download
      style={{
        padding: '0.5rem 0.9rem',
        background: '#121826',
        color: '#fbbf24',
        border: '1px solid #fbbf2433',
        borderRadius: 6,
        textDecoration: 'none',
        fontSize: '0.72rem',
        fontFamily: '"JetBrains Mono", monospace',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 600,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      ↓ PDF
    </a>
  );
}
