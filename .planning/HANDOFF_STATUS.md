# Session Handoff — Part 61 School

Snapshot of the in-flight work so the next session (or a compacted one)
can pick up cleanly. Written 2026-04-22. Everything described below is
either on `main` already or explicitly noted as TODO.

## Production

- **Vercel project:** `chriswebb-cmyk / part-61-school-web` (Hobby plan — 10 s function cap)
- **URL (current primary):** `https://part-61-school-web-cyan.vercel.app`
- **Repo:** `https://github.com/Think-Forward-Studios/Part-61-School`
- **Branch that deploys:** `main` (auto-deploy on push)
- **Latest commit at handoff:** `5061b0c` (fleet-map geofence render fix)

## Quick-start pointers for a fresh session

- **Style guide / dark-theme conventions:** `.planning/FRONTEND_STYLE_GUIDE.md` — full token table, page-wrapper pattern, table pattern, role/status chips. Read this before touching any UI.
- **Role sub-nav (the big dropdown menu):** `apps/web/components/RoleSubNav.tsx` — per-role config at top of file. Admin/Instructor/Student/Mechanic/Rental each have their own `directLinks + groups`.
- **ADS-B provider selection:** `apps/web/app/api/adsb/_provider.ts` — env-driven, see "ADS-B / Fleet map" below.
- **Tailwind v4 imported via `@import` in `apps/web/app/globals.css`.**

## Environment variables (set in Vercel → Production)

Critical ones that must be right:

| Var                     | Purpose                                     | Current state                 |
| ----------------------- | ------------------------------------------- | ----------------------------- |
| `DATABASE_URL`          | Runtime pooler (transaction mode)           | `:6543` ✓ (user set manually) |
| `DIRECT_DATABASE_URL`   | Migrations (session mode)                   | `:5432` ✓                     |
| `OPENSKY_CLIENT_ID`     | OAuth2 client credentials grant for OpenSky | `chriswebb-api-client` ✓      |
| `OPENSKY_CLIENT_SECRET` | Paired with above                           | Set ✓                         |

A `credentials-2.json` file used to live at the repo root with the OpenSky secret in plaintext; it's **gitignored** but still on disk. Deleting it when convenient is fine — secret is already in Vercel.

## What works in prod right now

- Auth, role switching, session cookie, RLS-enforced tenant isolation.
- All 94 admin + cross-role pages rendered in the established aviation dark theme (midnight navy + amber CTAs + role-coded hues).
- Role-aware sub-nav renders for every role. 8 themed dropdowns for admin, trimmed sets for others.
- `/admin/people` list + detail with full EditProfileForm (now including citizenship + TSA AFSP selects).
- `/admin/people/[id]` panels (holds, currencies, qualifications, emergency contacts, etc.) — all dark-theme.
- Training catalog seed: 7 system-template courses (PPL-ASEL / PPL-AMEL / PPL-AMEL-AO / PPL-H / PPL-G / SP-A / REC-A) from Phase 2 syllabus sprint.
- `/schedule/approvals` with human-readable names + tail numbers (no raw UUIDs).
- `/admin/courses`, `/admin/aircraft/[id]/maintenance`, `/admin/work-orders/[id]`, `/dispatch/close/[id]`, `/dispatch/manifest/[id]` — all show human-readable labels via FK joins.
- `/profile` full editor; `/profile/documents` with admin target-user picker; `/profile/notifications` with per-section + global bulk toggles.
- `/fleet-map` with live aircraft, airports, navaids — data from adsb.fi primary, OpenSky fallback.
- Geofence editor draws + saves + **renders** (saved fix in `5061b0c`).

## Recent commit arc (most recent first)

```
5061b0c  fix(fleet-map): actually render the saved geofence on the map
ee6cf5e  feat(fleet-map): Replay link in the selected-aircraft pill
01d92dc  fix(fleet-map): geofence save — visible feedback + brighter overlay
944c34c  fix(fleet-map): label source truthfully (ADS-B, not FAA SWIM)
2fcd5bf  fix(adsb/adsbfi): correct base URL + v3 endpoint path
88de42b  fix(adsb): flip composite — adsb.fi primary, OpenSky secondary
9800462  feat(adsb): composite provider — OpenSky with adsb.fi fallback
afc3b6f  fix(adsb/opensky): 20s timeout, 4s bbox cache, 30s maxDuration
24a1f5a  feat(adsb): Next.js API proxy routes back the fleet map
0f0d004  feat(adsb): OpenSky + adsb.fi providers, env-driven selection
```

Full log: `git log --oneline` in repo.

## ADS-B / Fleet map — current architecture

`LiveMapView` (in `apps/web/app/(app)/fleet-map/_tracker/`) is the live
map. It calls legacy REST endpoints via `apps/web/lib/adsb-api.ts`
which now default to same-origin `/api/adsb/...`. Those routes proxy
to our `AdsbProvider` abstraction.

- **Provider selection:** `apps/web/app/api/adsb/_provider.ts`
- **Active order:** adsb.fi primary → OpenSky secondary, via `CompositeAdsbProvider`.
  adsb.fi is faster (sub-second, no auth) and doesn't hit the 10 s Hobby cap.
  If adsb.fi returns 0 aircraft the composite tries OpenSky.
  If the project upgrades to Vercel Pro (60 s cap), flipping OpenSky-primary is a one-line change in `_provider.ts`.
- **adsb.fi base URL:** `https://opendata.adsb.fi/api` (v3 endpoint for radius query). If this breaks again, docs: `https://github.com/adsbfi/opendata`.
- **Tracks layer:** synthesized server-side from a rolling position cache per-icao24 (see `apps/web/app/api/adsb/_trackCache.ts`). Cache is per-lambda instance, max 40 points / aircraft, 10 min TTL. Upgrade to shared Redis if quality matters.
- **Airports / Navaids:** OurAirports CC0 data fetched from `davidmegginson.github.io/ourairports-data/*.csv` on first request per lambda, cached in memory. See `apps/web/app/api/adsb/_ourAirports.ts`.
- **Waypoints / Airways:** stubbed `[]`. OurAirports doesn't publish them. Follow-up: seed FAA NASR CIFP fixes into our own DB.

## Known dead code worth cleaning up

These were part of an earlier fleet-map iteration and are no longer imported by the live route:

- `apps/web/app/(app)/fleet-map/FleetMapClient.tsx`
- `apps/web/app/(app)/fleet-map/_components/AircraftPopup.tsx`
- `apps/web/app/(app)/fleet-map/_components/AircraftLayer.tsx`
- `apps/web/app/(app)/fleet-map/_components/TrafficPopup.tsx`
- `apps/web/app/(app)/fleet-map/_components/TrafficLayer.tsx`

Safe to delete as a cleanup commit. None of them are referenced from the live route.

## Known follow-ups / TODO

- **Fleet map "Waypoints"/"Airways" layers** — populate from FAA NASR once we decide we need them.
- **Track-cache durability** — move from per-lambda memory to shared Redis if trails need to survive cold starts across concurrent users.
- **OpenSky primary on Pro plan** — if/when Vercel plan upgrades, flip the `CompositeAdsbProvider` order in `_provider.ts`.
- **"FAA SWIM" label** — if we ever wire a real SWIM tracker as primary, turn the popup Source label into a function of the active provider rather than a static string (currently hard-coded "ADS-B (adsb.fi)").
- **Dead-code cleanup** — FleetMapClient + old popup/layer components (see list above).
- **CI has been failing** on every push since `0002_phase2_personnel_aircraft` — `type "role" already exists` because Supabase's local stack auto-applies migrations and then drizzle-kit migrate re-applies them. Not blocking Vercel deploys but worth fixing. Options discussed: skip Supabase auto-apply, or wipe public schema before drizzle migrate. See `.github/workflows/ci.yml`.

## Gotchas for next session

1. **UI primitives with mouse handlers need `'use client';`.** Button, Card, anything with onMouseEnter/Leave. Missing this throws a server digest error.
2. **`noUncheckedIndexedAccess` is ON.** `obj[key]` returns `T | undefined`. Use triple-fallback for lookups in status maps.
3. **Banned-terms lint fires in `apps/web/**`and`packages/exports/**`.** Blocked words: `Part 141`, `approved`, `certified course`. Enum values like `tsa_afsp_status='approved'` need `// allow-banned-term:` comments where used as UI strings.
4. **Fleet-map uses `position: fixed` for its viewport lock.** Changing the top-header or sub-nav height will require updating `top: 109` in `apps/web/app/(app)/fleet-map/layout.tsx`. Better long-term: CSS custom properties for header heights.
5. **Vercel env var changes require redeploy.** Changing `OPENSKY_CLIENT_SECRET` doesn't hot-reload existing lambdas.
6. **Migrations are manual via GitHub Actions.** Actions → `Migrate Production DB` → type `MIGRATE`. Never choose `reset = true` unless you want to nuke the DB.
7. **Phase 2 syllabus seed uses the `fn_phase2_seed_courses()` pattern** to work around Postgres's rule against using new enum values in the same tx they were added. Pre-apply step in `migrate-production.yml` runs ALTER TYPE ADD VALUE outside drizzle-kit's transaction before migrations run.

## How to pick up from a fresh session

Paste this at the start of the new Claude Code session:

> "Continuing work on the Part 61 School flight-school app. All context is in `.planning/HANDOFF_STATUS.md` at the repo root. Read that first, then I'll tell you what I want next."

Or just reference the doc by path and ask for what you need.
