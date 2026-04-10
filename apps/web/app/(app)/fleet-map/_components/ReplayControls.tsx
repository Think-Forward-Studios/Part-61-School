'use client';

/**
 * ReplayControls (ADS-06).
 *
 * Floating control panel for track replay playback:
 * - Play/pause toggle
 * - Time slider (0-100 -> 0.0-1.0 progress)
 * - Speed selector (1x / 2x / 4x)
 * - Flight info: departure time, current interpolated time, duration
 * - Current altitude readout
 */

interface ReplayControlsProps {
  /** Progress 0.0 - 1.0 */
  progress: number;
  /** Whether animation is playing */
  playing: boolean;
  /** Current playback speed multiplier */
  speed: number;
  /** Unix epoch seconds of track start */
  firstSeen: number;
  /** Unix epoch seconds of track end */
  lastSeen: number;
  /** Current altitude in meters (interpolated) */
  currentAltitude: number | null;
  onProgressChange: (progress: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
}

function formatTime(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function metersToFeet(m: number | null): string {
  if (m == null) return '--';
  return `${Math.round(m * 3.28084).toLocaleString()} ft`;
}

const SPEEDS = [1, 2, 4];

export function ReplayControls({
  progress,
  playing,
  speed,
  firstSeen,
  lastSeen,
  currentAltitude,
  onProgressChange,
  onPlayPause,
  onSpeedChange,
}: ReplayControlsProps) {
  const totalDuration = Math.max(1, lastSeen - firstSeen);
  const currentTime = firstSeen + progress * totalDuration;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'rgba(15, 15, 25, 0.92)',
        borderRadius: 10,
        padding: '12px 20px',
        fontFamily: 'system-ui, sans-serif',
        color: '#e2e8f0',
        minWidth: 380,
        maxWidth: 520,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Time info row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#94a3b8',
          marginBottom: 8,
        }}
      >
        <span>{formatTime(firstSeen)}</span>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatTime(currentTime)}</span>
        <span>{formatTime(lastSeen)}</span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onProgressChange(Number(e.target.value) / 1000)}
        style={{
          width: '100%',
          height: 6,
          appearance: 'none',
          background: `linear-gradient(to right, #3b82f6 0%, #22c55e 50%, #ef4444 100%)`,
          borderRadius: 3,
          outline: 'none',
          cursor: 'pointer',
          marginBottom: 10,
        }}
      />

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
        {/* Play/Pause */}
        <button
          type="button"
          onClick={onPlayPause}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.2)',
            background: playing ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '\u23F8' : '\u25B6'}
        </button>

        {/* Speed buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              style={{
                padding: '3px 10px',
                borderRadius: 4,
                border: speed === s ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.15)',
                background: speed === s ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                color: speed === s ? '#93c5fd' : '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Duration + altitude */}
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
          <div>Duration: {formatDuration(totalDuration)}</div>
          <div>Alt: {metersToFeet(currentAltitude)}</div>
        </div>
      </div>
    </div>
  );
}
