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
        padding: '0.35rem 0.75rem',
        background: '#dc2626',
        color: 'white',
        borderRadius: 4,
        textDecoration: 'none',
        fontSize: '0.8rem',
      }}
    >
      PDF
    </a>
  );
}
