'use client';
import { useSearchParams } from 'next/navigation';

export function CsvDownloadButton({ slug }: { slug: string }) {
  const params = useSearchParams();
  const href = `/admin/reports/${slug}/export.csv?${params.toString()}`;
  return (
    <a
      href={href}
      download
      style={{
        padding: '0.35rem 0.75rem',
        background: '#16a34a',
        color: 'white',
        borderRadius: 4,
        textDecoration: 'none',
        fontSize: '0.8rem',
      }}
    >
      CSV
    </a>
  );
}
