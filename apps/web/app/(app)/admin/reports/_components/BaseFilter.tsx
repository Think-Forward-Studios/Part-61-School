'use client';
import { useSearchParams, useRouter } from 'next/navigation';

export function BaseFilter() {
  const params = useSearchParams();
  const router = useRouter();
  const current = params.get('base_id') ?? '';

  return (
    <select
      value={current}
      onChange={(e) => {
        const sp = new URLSearchParams(params.toString());
        if (e.target.value) {
          sp.set('base_id', e.target.value);
        } else {
          sp.delete('base_id');
        }
        router.replace('?' + sp.toString(), { scroll: false });
      }}
      style={{
        padding: '0.35rem',
        borderRadius: 4,
        border: '1px solid #d1d5db',
        fontSize: '0.85rem',
      }}
    >
      <option value="">Active base</option>
      <option value="all">All bases</option>
    </select>
  );
}
