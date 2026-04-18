# Part 61 Frontend Polish — Style Guide

Aviation "pre-flight briefing" aesthetic. Midnight navy surfaces + amber CTAs + role-coded hues.

## Import the primitives

```tsx
import { PageHeader, Card, Button, Metric, EmptyState } from '@/components/ui';
import { color, radius } from '@/components/ui/tokens';
```

## Color substitutions (find-and-replace targets)

Light-theme anti-patterns → dark tokens:

| Old (anti-pattern)                      | New         | Token                |
| --------------------------------------- | ----------- | -------------------- |
| `'#666'` / `'gray'`                     | `'#7a869a'` | `color.fgDim`        |
| `'#999'` / `'lightgray'`                | `'#5b6784'` | `color.fgFaint`      |
| `'#333'` / `'black'`                    | `'#f7f9fc'` | `color.fg`           |
| `'#f8fafc'` / `'#f9fafb'` / `'#f1f5f9'` | `'#121826'` | `color.surfaceElev`  |
| `'#fff'` / `'white'` / `'#ffffff'`      | `'#0d1220'` | `color.surface`      |
| `'#eee'` / `'#e5e7eb'`                  | `'#1f2940'` | `color.border`       |
| `'#ddd'` / `'#d1d5db'`                  | `'#293352'` | `color.borderStrong` |
| `'crimson'` / `'red'`                   | `'#f87171'` | `color.rose`         |
| `'#16a34a'` / `'green'`                 | `'#34d399'` | `color.mint`         |
| `'#2563eb'` / `'blue'`                  | `'#38bdf8'` | `color.sky`          |

## Main page wrapper (for server pages)

```tsx
<main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
  <PageHeader
    eyebrow="Section"
    title="Page Title"
    subtitle="Short descriptive subtitle."
    actions={/* optional CTA */}
  />
  {/* content */}
</main>
```

For wide pages (tables, dispatch, fleet-map): `maxWidth: 1600`.

## Table pattern

```tsx
<div
  style={{
    background: '#0d1220',
    border: '1px solid #1f2940',
    borderRadius: 12,
    overflow: 'hidden',
  }}
>
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
    <thead>
      <tr style={{ background: '#121826' }}>
        <th style={TH}>Column</th>
      </tr>
    </thead>
    <tbody>
      <tr style={{ borderBottom: '1px solid #161d30' }}>
        <td style={TD}>value</td>
      </tr>
    </tbody>
  </table>
</div>;

// Shared style constants (define at module top):
const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};
```

For null cells: `<span style={{ color: '#5b6784' }}>—</span>`

## Empty state

```tsx
<div
  style={{
    padding: '3rem 1rem',
    textAlign: 'center',
    color: '#7a869a',
    fontSize: '0.88rem',
    background: '#0d1220',
    border: '1px dashed #1f2940',
    borderRadius: 12,
  }}
>
  No records match these filters.
</div>
```

## Role-coded chips

```tsx
const ROLE_HUE: Record<string, string> = {
  admin: '#f97316', // orange — OPS
  instructor: '#38bdf8', // sky — CFI
  student: '#34d399', // mint — STU
  mechanic: '#a78bfa', // violet — MX
  rental_customer: '#7a869a',
};

// usage:
<span
  style={{
    padding: '0.18rem 0.55rem',
    borderRadius: 999,
    background: `${hue}1f`,
    color: hue,
    border: `1px solid ${hue}44`,
    fontSize: '0.68rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
  }}
>
  {label}
</span>;
```

## Status chips

```tsx
const STATUS_HUE: Record<string, { bg: string; fg: string }> = {
  active: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
  pending: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  inactive: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
  rejected: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
};
```

With triple fallback to satisfy `noUncheckedIndexedAccess`:

```tsx
const tone = STATUS_HUE[status] ?? STATUS_HUE.inactive ?? { bg: '#1a2238', fg: '#7a869a' };
```

## Action buttons (inline, mono)

Mint (confirm/go):

```tsx
padding: '0.35rem 0.8rem',
background: 'rgba(52, 211, 153, 0.12)',
color: '#34d399',
border: '1px solid rgba(52, 211, 153, 0.35)',
borderRadius: 6,
fontSize: '0.72rem',
fontFamily: '"JetBrains Mono", ui-monospace, monospace',
letterSpacing: '0.1em',
textTransform: 'uppercase',
fontWeight: 600,
```

Rose (reject/delete): swap `52, 211, 153` → `248, 113, 113` and `#34d399` → `#f87171`.

## Gotchas

1. **`'use client'` required on any UI primitive that uses mouse handlers.** Button, Card, Hover effects — all have `onMouseEnter` / `onMouseLeave`. They must be client components or the page throws a server digest error.
2. **`noUncheckedIndexedAccess` is ON.** `obj[key]` returns `T | undefined`. Use `?? fallback` or triple-fallback.
3. **Don't hex-literal-spam:** prefer tokens (`color.fgDim`) when convenient, but inline hex is fine if matches table above — consistency beats purity.
4. **Fleet-map route has its own visual system** — leave `apps/web/app/(app)/fleet-map/*` alone.
5. **Print/PDF components** (`*PdfDocument.tsx`, `ReportPdfShell.tsx`) are intentionally white for print — SKIP.
6. **CTAs:** use `<Button variant="primary">` from `@/components/ui` for amber gradient buttons. Don't inline a new gradient.

## Reference implementations (copy from these)

- Table: `apps/web/app/(app)/admin/people/PeopleTable.tsx`
- Server page wrapper: `apps/web/app/(app)/admin/people/page.tsx`
- Approval list (table + action chips): `apps/web/app/(app)/schedule/approvals/ApprovalList.tsx`
- UI primitives: `apps/web/components/ui/`
