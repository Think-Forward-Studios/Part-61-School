'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchAirports, type Airport } from '@/lib/adsb-api';

interface HomeAirportPanelProps {
  homeAirport: Airport | null;
  radiusNm: number;
  aircraftCount: number;
  trackCount: number;
  callsignCount: number;
  onAirportChange: (airport: Airport | null) => void;
  onRadiusChange: (nm: number) => void;
}

const RADIUS_OPTIONS = [25, 50, 100, 150, 200, 250, 300, 400, 500];

export default function HomeAirportPanel({
  homeAirport,
  radiusNm,
  aircraftCount,
  trackCount,
  callsignCount,
  onAirportChange,
  onRadiusChange,
}: HomeAirportPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Airport[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const data = await searchAirports(q);
      setResults(data);
      setShowResults(true);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const selectAirport = (apt: Airport) => {
    onAirportChange(apt);
    setQuery(apt.icao_id || apt.location_id);
    setShowResults(false);
    setResults([]);
  };

  const clear = () => {
    onAirportChange(null);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div
      className="absolute bottom-4 right-16 z-10 overflow-visible rounded-lg"
      style={{
        background: 'rgba(17, 17, 17, 0.92)',
        border: homeAirport ? '1px solid rgba(255, 200, 0, 0.35)' : '1px solid #1e1e1e',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        minWidth: '220px',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          borderBottom: '1px solid #1e1e1e',
          background: homeAirport
            ? 'linear-gradient(90deg, rgba(255, 200, 0, 0.07), transparent)'
            : 'linear-gradient(90deg, rgba(0, 229, 255, 0.04), transparent)',
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke={homeAirport ? '#ffc800' : '#555'}
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: '#888' }}
        >
          Home Airport
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Search input */}
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="ICAO or airport name..."
            className="w-full rounded px-2.5 py-1.5 font-mono text-[11px] outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #2a2a2a',
              color: '#ccc',
              caretColor: '#ffc800',
            }}
          />
          {query && (
            <button
              onClick={clear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]"
              style={{ fontSize: 12 }}
            >
              ✕
            </button>
          )}
          {searching && (
            <div className="absolute right-6 top-1/2 h-2 w-2 -translate-y-1/2 animate-pulse rounded-full bg-[#ffc800]" />
          )}

          {/* Dropdown results */}
          {showResults && results.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded"
              style={{
                background: 'rgba(20, 20, 20, 0.98)',
                border: '1px solid #2a2a2a',
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}
            >
              {results.map((apt, i) => (
                <button
                  key={`${apt.location_id}-${i}`}
                  onClick={() => selectAirport(apt)}
                  className="w-full px-2.5 py-2 text-left transition-colors hover:bg-[#1a1a1a]"
                  style={{ borderBottom: '1px solid #1a1a1a' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: '#ffc800', minWidth: 36 }}
                    >
                      {apt.icao_id || apt.location_id}
                    </span>
                    <span className="truncate text-[10px] text-[#888]">{apt.name}</span>
                  </div>
                  {apt.city && (
                    <div className="mt-0.5 pl-0 text-[9px] text-[#555]">
                      {apt.city}, {apt.state_code}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Radius selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-[#555]">RADIUS</span>
            <span className="font-mono text-[11px]" style={{ color: '#ffc800' }}>
              {radiusNm} NM
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {RADIUS_OPTIONS.map((nm) => (
              <button
                key={nm}
                onClick={() => onRadiusChange(nm)}
                className="rounded px-1.5 py-0.5 font-mono text-[9px] transition-all"
                style={{
                  background: radiusNm === nm ? 'rgba(255, 200, 0, 0.2)' : 'rgba(255,255,255,0.04)',
                  border: radiusNm === nm ? '1px solid rgba(255, 200, 0, 0.5)' : '1px solid #222',
                  color: radiusNm === nm ? '#ffc800' : '#555',
                }}
              >
                {nm}
              </button>
            ))}
          </div>
        </div>

        {/* Stats — only show when airport selected */}
        {homeAirport && (
          <div className="space-y-1 pt-2" style={{ borderTop: '1px solid #1e1e1e' }}>
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#555]">AIRCRAFT</span>
              <span className="font-mono text-[10px] tabular-nums" style={{ color: '#ffc800' }}>
                {aircraftCount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#555]">TRACKS</span>
              <span className="font-mono text-[10px] tabular-nums text-[#888]">
                {trackCount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[9px] text-[#555]">IDENTIFIED</span>
              <span className="font-mono text-[10px] tabular-nums text-[#888]">
                {callsignCount.toLocaleString()}
              </span>
            </div>
            <div className="mt-0.5 flex justify-between">
              <span className="font-mono text-[9px] text-[#444]">CENTER</span>
              <span className="font-mono text-[9px] text-[#444]">
                {homeAirport.latitude.toFixed(3)}°N {Math.abs(homeAirport.longitude).toFixed(3)}°W
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
