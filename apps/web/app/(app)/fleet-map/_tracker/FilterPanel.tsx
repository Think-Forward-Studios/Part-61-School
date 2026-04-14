'use client';

import { memo, useState, useCallback } from 'react';

export interface Filters {
  icao24: string;
  callsign: string;
  altMin: number | null;
  altMax: number | null;
}

interface FilterPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

function FilterPanel({ filters, onFiltersChange }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(filters);

  const apply = useCallback(() => {
    onFiltersChange(local);
  }, [local, onFiltersChange]);

  const clear = useCallback(() => {
    const empty: Filters = { icao24: '', callsign: '', altMin: null, altMax: null };
    setLocal(empty);
    onFiltersChange(empty);
  }, [onFiltersChange]);

  const hasFilters =
    filters.icao24 || filters.callsign || filters.altMin != null || filters.altMax != null;

  return (
    <div className="absolute right-14 top-14 z-10">
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: 'rgba(17, 17, 17, 0.92)',
          border: '1px solid #1e1e1e',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Toggle button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2"
          style={{
            borderBottom: expanded ? '1px solid #1e1e1e' : 'none',
            background: hasFilters
              ? 'linear-gradient(90deg, rgba(255, 145, 0, 0.08), transparent)'
              : 'linear-gradient(90deg, rgba(0, 229, 255, 0.05), transparent)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasFilters ? '#ff9100' : '#00e5ff'}
            strokeWidth="2"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#888]">
            Filter
          </span>
          {hasFilters && (
            <div
              className="ml-auto h-1.5 w-1.5 rounded-full"
              style={{ background: '#ff9100', boxShadow: '0 0 4px #ff9100' }}
            />
          )}
        </button>

        {expanded && (
          <div className="space-y-2.5 p-3" style={{ minWidth: 220 }}>
            {/* ICAO24 search */}
            <div>
              <label className="mb-1 block font-mono text-[9px] tracking-wider text-[#555]">
                ICAO24
              </label>
              <input
                type="text"
                placeholder="e.g. a12345"
                value={local.icao24}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, icao24: e.target.value.toLowerCase().trim() }))
                }
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className="w-full rounded px-2 py-1.5 font-mono text-[11px]"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #2a2a2a',
                  color: '#ccc',
                  outline: 'none',
                }}
              />
            </div>

            {/* Callsign search */}
            <div>
              <label className="mb-1 block font-mono text-[9px] tracking-wider text-[#555]">
                CALLSIGN
              </label>
              <input
                type="text"
                placeholder="e.g. DAL27"
                value={local.callsign}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, callsign: e.target.value.toUpperCase().trim() }))
                }
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className="w-full rounded px-2 py-1.5 font-mono text-[11px]"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #2a2a2a',
                  color: '#ccc',
                  outline: 'none',
                }}
              />
            </div>

            {/* Altitude range */}
            <div>
              <label className="mb-1 block font-mono text-[9px] tracking-wider text-[#555]">
                ALTITUDE (ft)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={local.altMin ?? ''}
                  onChange={(e) =>
                    setLocal((p) => ({
                      ...p,
                      altMin: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  className="w-full rounded px-2 py-1.5 font-mono text-[11px]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #2a2a2a',
                    color: '#ccc',
                    outline: 'none',
                  }}
                />
                <span className="font-mono text-[9px] text-[#444]">—</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={local.altMax ?? ''}
                  onChange={(e) =>
                    setLocal((p) => ({
                      ...p,
                      altMax: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  className="w-full rounded px-2 py-1.5 font-mono text-[11px]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid #2a2a2a',
                    color: '#ccc',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={apply}
                className="flex-1 rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em]"
                style={{
                  background: 'rgba(0, 229, 255, 0.1)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  color: '#00e5ff',
                }}
              >
                Apply
              </button>
              <button
                onClick={clear}
                className="rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em]"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid #2a2a2a',
                  color: '#666',
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(FilterPanel);
