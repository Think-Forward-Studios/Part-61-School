'use client';

import { memo } from 'react';

interface LayerVisibility {
  waypoints: boolean;
  airports: boolean;
  navaids: boolean;
  aircraft: boolean;
  tracks: boolean;
  weather: boolean;
}

interface ControlPanelProps {
  layers: LayerVisibility;
  counts: Record<keyof LayerVisibility, number>;
  onToggle: (key: keyof LayerVisibility) => void;
  zoom: number;
}

interface LayerConfig {
  key: keyof LayerVisibility;
  label: string;
  color: string;
  glowColor: string;
  minZoom?: number;
}

const LAYER_CONFIG: LayerConfig[] = [
  {
    key: 'aircraft',
    label: 'AIRCRAFT',
    color: '#ffd600',
    glowColor: 'rgba(255, 214, 0, 0.3)',
  },
  {
    key: 'airports',
    label: 'AIRPORTS',
    color: '#00e676',
    glowColor: 'rgba(0, 230, 118, 0.3)',
  },
  {
    key: 'navaids',
    label: 'NAVAIDS',
    color: '#ff9100',
    glowColor: 'rgba(255, 145, 0, 0.3)',
    minZoom: 6,
  },
  {
    key: 'tracks',
    label: 'TRACKS',
    color: '#c864ff',
    glowColor: 'rgba(200, 100, 255, 0.3)',
  },
  {
    key: 'waypoints',
    label: 'WAYPOINTS',
    color: '#00e5ff',
    glowColor: 'rgba(0, 229, 255, 0.3)',
    minZoom: 7,
  },
  {
    key: 'weather',
    label: 'WEATHER',
    color: '#00bfff',
    glowColor: 'rgba(0, 191, 255, 0.3)',
  },
];

function ControlPanel({ layers, counts, onToggle, zoom }: ControlPanelProps) {
  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="absolute left-4 top-14 z-10 w-56">
      {/* Panel container */}
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: 'rgba(17, 17, 17, 0.92)',
          border: '1px solid #1e1e1e',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            borderBottom: '1px solid #1e1e1e',
            background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.05), transparent)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00e5ff"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#888]">
            Layers
          </span>
        </div>

        {/* Layer toggles */}
        <div className="space-y-0.5 p-2">
          {LAYER_CONFIG.map((cfg) => {
            const active = layers[cfg.key];
            const count = counts[cfg.key];
            const belowMinZoom = cfg.minZoom != null && zoom <= cfg.minZoom;

            return (
              <button
                key={cfg.key}
                onClick={() => onToggle(cfg.key)}
                className="group flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 transition-all duration-150"
                style={{
                  background: active
                    ? `linear-gradient(90deg, ${cfg.glowColor}, transparent)`
                    : 'transparent',
                }}
              >
                {/* Toggle indicator */}
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm transition-all duration-150"
                  style={{
                    background: active ? cfg.color : 'transparent',
                    border: `1.5px solid ${active ? cfg.color : '#333'}`,
                    boxShadow: active ? `0 0 6px ${cfg.glowColor}` : 'none',
                  }}
                />

                {/* Label */}
                <span
                  className="flex-1 text-left text-[10px] font-semibold tracking-[0.15em] transition-colors duration-150"
                  style={{
                    color: active ? '#ccc' : '#555',
                  }}
                >
                  {cfg.label}
                </span>

                {/* Count / status badge */}
                {active && !belowMinZoom ? (
                  <span className="font-mono text-[9px] tabular-nums" style={{ color: cfg.color }}>
                    {count.toLocaleString()}
                  </span>
                ) : belowMinZoom && active ? (
                  <span className="font-mono text-[8px] text-[#444]">Z{cfg.minZoom}+</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Track altitude legend */}
        {layers.tracks && (
          <div className="space-y-1 px-3 py-2" style={{ borderTop: '1px solid #1e1e1e' }}>
            <span className="font-mono text-[8px] tracking-wider text-[#ccc]">TRACK ALTITUDE</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="h-[2px] w-4 rounded" style={{ background: '#00ff64' }} />
                <span className="font-mono text-[8px] text-[#ccc]">&lt;10K</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-[2px] w-4 rounded" style={{ background: '#00c8ff' }} />
                <span className="font-mono text-[8px] text-[#ccc]">10-33K</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-[2px] w-4 rounded" style={{ background: '#c864ff' }} />
                <span className="font-mono text-[8px] text-[#ccc]">&gt;33K</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer stats */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            borderTop: '1px solid #1e1e1e',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <span className="font-mono text-[9px] tracking-wider text-[#ccc]">VISIBLE</span>
          <span className="font-mono text-[10px] tabular-nums text-[#00e5ff]">
            {totalVisible.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(ControlPanel);
