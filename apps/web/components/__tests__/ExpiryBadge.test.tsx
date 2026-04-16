/* eslint-disable @typescript-eslint/no-unused-expressions */
import { describe, it, expect } from 'vitest';
import { classifyExpiry, bandColors } from '../ExpiryBadge';

const DAY_MS = 86_400_000;

describe('classifyExpiry', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('returns "none" when expiresAt is null or invalid', () => {
    expect(classifyExpiry(null, now).band).toBe('none');
    expect(classifyExpiry(undefined, now).band).toBe('none');
    expect(classifyExpiry('not-a-date', now).band).toBe('none');
  });

  it('marks past expirations as EXPIRED', () => {
    const past = new Date(now.getTime() - 5 * DAY_MS);
    const r = classifyExpiry(past, now);
    expect(r.band).toBe('expired');
    expect(r.label).toBe('EXPIRED');
  });

  it('marks 0..7 days as critical with day-count label', () => {
    const d3 = new Date(now.getTime() + 3 * DAY_MS);
    const r = classifyExpiry(d3, now);
    expect(r.band).toBe('critical');
    expect(r.label).toBe('3d');
    expect(r.daysLeft).toBe(3);
  });

  it('marks 8..30 days as warning', () => {
    const d20 = new Date(now.getTime() + 20 * DAY_MS);
    const r = classifyExpiry(d20, now);
    expect(r.band).toBe('warning');
    expect(r.label).toBe('20d');
  });

  it('marks >30 days as ok', () => {
    const d60 = new Date(now.getTime() + 60 * DAY_MS);
    const r = classifyExpiry(d60, now);
    expect(r.band).toBe('ok');
    expect(r.label).toBe('60d');
  });

  it('accepts ISO strings', () => {
    const iso = new Date(now.getTime() + 10 * DAY_MS).toISOString();
    const r = classifyExpiry(iso, now);
    expect(r.band).toBe('warning');
  });
});

describe('bandColors', () => {
  it('returns distinct colors per band', () => {
    const expired = bandColors('expired');
    const critical = bandColors('critical');
    const warning = bandColors('warning');
    const ok = bandColors('ok');
    const none = bandColors('none');
    expect(expired.bg).toBe('#fee2e2');
    expect(critical.bg).toBe('#fee2e2');
    expect(warning.bg).toBe('#fef3c7');
    expect(ok.bg).toBe('#dcfce7');
    expect(none.bg).toBe('#f3f4f6');
  });
});
