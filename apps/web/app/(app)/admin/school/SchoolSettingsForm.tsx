'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

/**
 * Common US timezones expressed as the labels pilots actually use
 * (EST/EDT, CST/CDT, …) mapped to the IANA zone we persist. We keep
 * a "Custom IANA" escape hatch for Alaska, Hawaii, or any school that
 * wants to pin a zone we haven't listed.
 */
const TIMEZONE_OPTIONS: ReadonlyArray<{
  label: string;
  value: string;
  blurb: string;
}> = [
  { label: 'Eastern (ET) — EST / EDT', value: 'America/New_York', blurb: 'UTC−5 / −4' },
  { label: 'Central (CT) — CST / CDT', value: 'America/Chicago', blurb: 'UTC−6 / −5' },
  { label: 'Mountain (MT) — MST / MDT', value: 'America/Denver', blurb: 'UTC−7 / −6' },
  {
    label: 'Arizona (MST, no DST)',
    value: 'America/Phoenix',
    blurb: 'UTC−7 year-round',
  },
  { label: 'Pacific (PT) — PST / PDT', value: 'America/Los_Angeles', blurb: 'UTC−8 / −7' },
  { label: 'Alaska (AKT) — AKST / AKDT', value: 'America/Anchorage', blurb: 'UTC−9 / −8' },
  { label: 'Hawaii (HST, no DST)', value: 'Pacific/Honolulu', blurb: 'UTC−10 year-round' },
];

/**
 * Max dimensions for the client-side downscale. Icons only need to look
 * good at ~28 px in the header pill; 256 px leaves plenty of headroom
 * for retina displays and the preview card.
 */
const MAX_ICON_PX = 256;
const MAX_DATA_URL_BYTES = 400_000;

export interface SchoolSettingsInitial {
  name: string;
  timezone: string;
  homeBaseAirport: string | null;
  iconUrl: string | null;
}

export function SchoolSettingsForm({ initial }: { initial: SchoolSettingsInitial }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [customTimezone, setCustomTimezone] = useState(
    TIMEZONE_OPTIONS.some((t) => t.value === initial.timezone) ? '' : initial.timezone,
  );
  const [useCustomTz, setUseCustomTz] = useState(
    !TIMEZONE_OPTIONS.some((t) => t.value === initial.timezone),
  );
  const [homeBaseAirport, setHomeBaseAirport] = useState(initial.homeBaseAirport ?? '');
  const [iconUrl, setIconUrl] = useState<string | null>(initial.iconUrl);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [processingIcon, setProcessingIcon] = useState(false);

  const update = trpc.admin.school.update.useMutation();

  async function onIconChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      setError('Icon must be a PNG, JPEG, or WebP image.');
      return;
    }
    setError(null);
    setProcessingIcon(true);
    try {
      const dataUrl = await downscaleImageToDataUrl(file, MAX_ICON_PX);
      if (dataUrl.length > MAX_DATA_URL_BYTES) {
        setError('Icon is too large after processing. Try a simpler image.');
        return;
      }
      setIconUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read image.');
    } finally {
      setProcessingIcon(false);
    }
  }

  function clearIcon() {
    setIconUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const finalTz = useCustomTz ? customTimezone.trim() : timezone;
    if (!finalTz) {
      setError('Timezone is required.');
      return;
    }
    try {
      await update.mutateAsync({
        name,
        timezone: finalTz,
        // Empty string → null (clear). Trim so whitespace-only is treated
        // as empty.
        homeBaseAirport: homeBaseAirport.trim() || null,
        iconUrl: iconUrl ?? null,
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        marginTop: '1.5rem',
      }}
    >
      {/* Icon upload block */}
      <section style={sectionStyle}>
        <div style={labelBlockStyle}>
          <div style={labelTitleStyle}>School icon</div>
          <div style={labelHintStyle}>
            PNG / JPEG / WebP. Auto-scaled to {MAX_ICON_PX}px before upload. Shown in the top-nav
            pill on every page.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: iconUrl ? 'transparent' : 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {iconUrl ? (
              // Data URL — safe as <img src>. next/image's remote loader
              // isn't needed for admin-owned assets already inlined.
              <img
                src={iconUrl}
                alt="School icon preview"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '1.4rem', color: '#475569' }}>◆</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label style={buttonStyleSecondary}>
              {iconUrl ? 'Replace' : 'Upload'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onIconChange}
                style={{ display: 'none' }}
              />
            </label>
            {iconUrl ? (
              <button type="button" onClick={clearIcon} style={buttonStyleGhost}>
                Remove
              </button>
            ) : null}
            {processingIcon ? (
              <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>
                Processing…
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* School name */}
      <section style={sectionStyle}>
        <div style={labelBlockStyle}>
          <div style={labelTitleStyle}>School name</div>
          <div style={labelHintStyle}>Shown in the header brand and on generated reports.</div>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
      </section>

      {/* Home base airport */}
      <section style={sectionStyle}>
        <div style={labelBlockStyle}>
          <div style={labelTitleStyle}>Home base airport</div>
          <div style={labelHintStyle}>
            ICAO or display name (e.g. <code style={codeStyle}>KBHM</code>). Shown in the top header
            pill on every page. Leave blank to hide.
          </div>
        </div>
        <input
          value={homeBaseAirport}
          onChange={(e) => setHomeBaseAirport(e.target.value.toUpperCase())}
          placeholder="KBHM"
          maxLength={80}
          style={inputStyle}
        />
      </section>

      {/* Timezone */}
      <section style={sectionStyle}>
        <div style={labelBlockStyle}>
          <div style={labelTitleStyle}>Timezone</div>
          <div style={labelHintStyle}>
            Drives date boundaries on flight logs, reports, and scheduling screens.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <select
            value={useCustomTz ? '__custom' : timezone}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__custom') {
                setUseCustomTz(true);
              } else {
                setUseCustomTz(false);
                setTimezone(v);
              }
            }}
            style={inputStyle}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label} · {tz.blurb}
              </option>
            ))}
            <option value="__custom">Custom IANA zone…</option>
          </select>
          {useCustomTz ? (
            <input
              value={customTimezone}
              onChange={(e) => setCustomTimezone(e.target.value)}
              placeholder="America/Los_Angeles"
              style={inputStyle}
            />
          ) : null}
        </div>
      </section>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.5rem',
        }}
      >
        <button type="submit" style={buttonStylePrimary} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {error ? <span style={{ color: '#f87171', fontSize: '0.9rem' }}>{error}</span> : null}
        {ok ? <span style={{ color: '#4ade80', fontSize: '0.9rem' }}>Saved.</span> : null}
      </div>
    </form>
  );
}

// --- client-side image downscale -------------------------------------------

/**
 * Read a file, render it to a square canvas at most `maxPx` on a side,
 * and return a PNG data URL. Keeps transparent backgrounds intact.
 */
async function downscaleImageToDataUrl(file: File, maxPx: number): Promise<string> {
  const arrayBuf = await file.arrayBuffer();
  const blob = new Blob([arrayBuf], { type: file.type });
  const src = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read image'));
      i.src = src;
    });
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(src);
  }
}

// --- styles ---------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px 1fr',
  gap: '1.5rem',
  alignItems: 'start',
  padding: '1rem 0',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};

const labelBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
};

const labelTitleStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '0.95rem',
  fontWeight: 600,
};

const labelHintStyle: React.CSSProperties = {
  color: '#7a869a',
  fontSize: '0.78rem',
  lineHeight: 1.45,
};

const codeStyle: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.75rem',
  padding: '0.05rem 0.3rem',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 4,
  color: '#cbd5e1',
};

const inputStyle: React.CSSProperties = {
  height: '2.5rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.95rem',
  outline: 'none',
};

const buttonStylePrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  padding: '0.55rem 1.25rem',
  fontSize: '0.92rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};

const buttonStyleSecondary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '2.25rem',
  padding: '0 0.9rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const buttonStyleGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '2.25rem',
  padding: '0 0.9rem',
  background: 'transparent',
  border: '1px solid rgba(248,113,113,0.4)',
  borderRadius: 8,
  color: '#fca5a5',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
};
