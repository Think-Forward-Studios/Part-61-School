# Logbook PDF export

## Library choice: `@react-pdf/renderer` 4.4.0

Evaluated per plan 04-05 PITFALL 1 (PDF library React 19 compatibility risk).

- **Attempted:** `@react-pdf/renderer@^4.4.0` (first major version to advertise
  React 19 support in its peerDependencies).
- **Result:** Clean install + clean `pnpm --filter ./apps/web build`. No
  `SECRET_INTERNALS` crash, no undefined `renderToStream` export, no
  React-internals stack traces. Ships to production as a dynamic Node.js
  Route Handler.
- **Decision:** Pinned. No pivot to `pdfkit` required.

## Runtime contract

The export Route Handler at
`apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/export.pdf/route.ts`:

- Uses `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- Authenticates the caller via the Supabase SSR client and checks that the
  user has `active_role in ('mechanic','admin')` — same gate as
  `mechanicOrAdminProcedure` on the tRPC side.
- Loads the aircraft row (school-scoped), current totals from
  `aircraft_current_totals`, and the **sealed** logbook entries for the
  requested `bookKind`, newest first.
- Hydrates signer snapshot display strings from `signer_snapshot` JSONB.
- Calls `renderToStream(<LogbookPdfDocument data={...} />)` and returns the
  stream as an `application/pdf` Response with an inline filename.

## Banned-term posture

Every static string in `LogbookPdfDocument.tsx` uses "certify / compliant /
current / authorized" vocabulary. No "approved" literal appears. The ESLint
`part61/no-banned-terms` rule applies to `apps/web/**` and this file passes
cleanly.
