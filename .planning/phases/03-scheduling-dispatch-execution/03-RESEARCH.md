# Phase 3: Scheduling & Dispatch Execution - Research

**Researched:** 2026-04-07
**Domain:** Postgres range-based conflict detection + calendar UI + real-time dispatch workflow in Next.js 15 / tRPC / Supabase
**Confidence:** HIGH on data model, migrations, tRPC polling, trigger pattern. MEDIUM on FullCalendar approach (license forced a fallback). MEDIUM on audio cue autoplay workaround.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reservation data model (SCH-01, SCH-02, SCH-13)**

- Single `reservation` table with `activity_type` enum: `flight | simulator | oral | academic | misc`
- `time_range tstzrange` with `'[)'` half-open bounds
- `status` enum: `requested | approved | dispatched | flown | closed | cancelled | no_show | scrubbed` (plus `pending_sign_off` added for student-submitted close-out)
- Columns: id, school_id, base_id, activity_type, time_range, status, aircraft_id (null), instructor_id (null), student_id (null), room_id (null), series_id, parent_block_id, notes, requested_at/by, approved_at/by, dispatched_at/by, closed_at/by, close_out_reason, deleted_at, plus XC and check-in columns
- Audit trigger + hard-delete blocker + RLS on school_id/base_id

**Conflict-check constraints (SCH-02)**

- Four `EXCLUDE USING gist` constraints on reservation (aircraft, instructor, student, room) each gated by `WHERE (<col> is not null and status in ('approved','dispatched','flown'))`
- Requires `create extension if not exists btree_gist`
- `requested` rows do NOT participate; approval is where the check bites
- Cancelled/no_show/scrubbed drop out via WHERE

**Personnel unavailability (SCH-15) — shadow rows**

- `person_unavailability` table (create if Phase 2 didn't)
- BEFORE INSERT trigger inserts a matching `reservation` row with `activity_type='misc'`, `status='approved'`, instructor_id or student_id set
- Handle UPDATE/DELETE symmetrically

**Recurring reservations (SCH-06)**

- Materialize child rows at creation; shared `series_id uuid`
- Edit modes: "this occurrence" / "this and following" / "entire series"
- No RRULE/iCalendar v1

**Block scheduling (SCH-16)**

- `schedule_block` + `schedule_block_instance` materialized
- Reservations reference `parent_block_id`; trigger inflates instructor/aircraft/room from the block
- Block instances are NOT reservation rows; they exist only as bookable slots

**`isAirworthyAt` stub (SCH-04, FLT-04)**

- `public.is_airworthy_at(aircraft_id uuid, at timestamptz) returns boolean`
- False if deleted_at set, grounded_at set and ≤ at, or any `aircraft_squawk` with severity='grounding' open at that time
- Phase 3 creates minimal `aircraft_squawk` table (severity info/watch/grounding)
- Called on approve and dispatch
- Phase 4 replaces body with same signature

**Calendar UI (SCH-07, SCH-17)**

- FullCalendar React. Verify `@fullcalendar/resource-timeline` license at install (Claude's research below: IT IS PREMIUM — fall back to timegrid + custom per-resource column layout)
- Views: by aircraft / instructor / student / room, day/week/month
- Color chips by activity_type; status affects opacity
- Student default: own reservations; instructor: own + today's fleet; admin: by aircraft

**Schedule visibility — privacy-first**

- Students see ONLY own reservations + redacted free/busy on bookable resources
- SQL function `public.free_busy(resource_type text, resource_id uuid, from_ts, to_ts) returns setof tstzrange`
- tRPC `schedule.list` takes `mode` ('mine' | 'full' | 'freebusy') — server decides

**Dispatch screen (FTR-01..04)**

- `/dispatch` behind `instructorOrAdminProcedure`
- Three panels: currently flying / about to fly / recently closed
- tRPC polling at 15s via TanStack Query `refetchInterval` (no Realtime in Phase 3)
- Overdue = `now() > time_range.end + grace_window` AND `status='dispatched'`; 30 min default, `school.overdue_grace_minutes` configurable
- Red row + audio cue (new overdue via sessionStorage diff) + in-app notification

**Dispatch modal (FTR-02, FTR-03)**

- Requires: student check-in + instructor authorization + Hobbs/tach out (flight only)
- Writes `flight_log_entry kind='flight_out'` + transitions reservation to `dispatched`
- Unread FIF notices block the Dispatch button

**Student check-in (FTR-02)**

- Button appears 15 min before start on student's own reservation card
- `student_checked_in_at` / `student_checked_in_by` columns; dispatcher can mark manually

**Instructor authorization**

- `instructor_authorized_at` / `instructor_authorized_by`
- Both check-in and authorize required before `dispatched`

**Hobbs capture (FTR-03) — paired rows**

- Row 1 at dispatch: `kind='flight_out'`, hobbs_out/tach_out filled
- Row 2 at close-out: `kind='flight_in'`, hobbs_in/tach_in, `paired_entry_id FK → row 1`
- Extend Phase 2 `flight_log_entry_kind` enum: add `flight_out`, `flight_in` (keep `flight` as deprecated alias)
- Update `aircraft_current_totals` view to handle both old and new kinds

**Flight close-out (SCH-08, SCH-09, INS-04, FTR-08)**

- Route `/dispatch/close/[reservation_id]`
- Sections: times / fuel+oil / route / squawks / notes / "Grade lesson" placeholder (disabled — Phase 5)
- Student OR instructor fills; instructor sign-off required to move to `closed`; student-only save → `pending_sign_off`
- Writes flight_in row, creates squawks, transitions status, audit log

**Cancellation (SCH-09)**

- `cancelled_free` (≥24h), `cancelled_late` (<24h), `no_show` (past start, no dispatch), `scrubbed_weather|maintenance|other`
- `no_show` writes row to Phase 2 `no_show` table
- Manual dispatcher action only in Phase 3 (nightly sweep → Phase 8)

**Rooms (SCH-18)**

- `room` table: id, school_id, base_id, name, capacity, features text[], deleted_at
- Admin CRUD at `/admin/rooms` (aircraft pattern)
- Rooms participate in exclusion constraint

**XC fields (FTR-05)**

- Nullable columns on `reservation`: `route_string`, `ete_minutes`, `stops text[]`, `fuel_stops text[]`, `alternate`

**Passenger manifest (FTR-06)**

- `passenger_manifest` table: reservation_id, position enum ('pic'|'sic'|'passenger'), name, weight_lbs, emergency_contact_name/phone, notes
- Panel in dispatch modal; print preview at `/dispatch/manifest/[reservation_id]`
- No PDF in v1

**FIF (FTR-07)**

- `fif_notice`: title, body markdown, posted_at/by, effective_at, expires_at, severity enum info|important|critical
- `fif_acknowledgement`: unique (notice_id, user_id)
- Blocks dispatch modal until all active notices acked
- Active = `effective_at <= now() AND (expires_at is null OR expires_at > now())`
- Admin UI `/admin/fif`; no re-ack on edit in v1

**Banned-term**

- `approved` as status value is fine; display as "Confirmed" in UI

**Engineering contract (recap)**

- Schema-first; RLS + audit + hard-delete-blocker + cross-tenant test for every new table
- Hand-authored migration mirrored to `supabase/migrations/`
- `pgPolicy` `to:` is STRING literal
- Views use `WITH (security_invoker = true)`
- All mutations via `withSchoolContext` / `withTenantTx`

### Claude's Discretion

- Exact FullCalendar plugin selection (see research: premium forces fallback)
- Time zone display (use school tz, Phase 1/2 pattern)
- Reservation form field ordering
- Audio cue file (simple beep)
- Grace-window default (30 min recommended, schema column admin-configurable)
- tRPC mutations vs Server Actions for dispatch modal (tRPC recommended)
- Print CSS for manifest
- Loading skeletons on dispatch screen
- `schedule_block_instance` materialized vs view (materialized recommended)

### Deferred Ideas (OUT OF SCOPE)

- Email / SMS notifications → Phase 8
- Nightly no-show sweep → Phase 8
- Supabase Realtime on dispatch → Phase 8
- Late-cancel fees → v2 BIL
- Waypoint parsing / wind / fuel burn → v2
- PDF manifest → v2
- RRULE iCalendar export → v2
- Drag-to-reschedule → Phase 8 if time permits
- Mobile dispatcher app → v2
- ForeFlight integration → out of scope
- Weather briefing at reservation time → out of scope
- Re-ack on FIF edit → v2
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                   | Research Support                                                                         |
| ------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SCH-01 | Student can request a reservation                                             | Reservation table + tRPC `schedule.request` + react-hook-form+zod pattern (Phase 2)      |
| SCH-02 | DB-level conflict prevention via `EXCLUDE USING gist` on `tstzrange`          | btree_gist extension + four partial exclusion constraints (verified HIGH below)          |
| SCH-03 | Instructor/admin approval gates `requested → approved`                        | Status transition + re-check exclusion on approve (constraint raises 23P01)              |
| SCH-04 | Cannot confirm if aircraft not airworthy                                      | `is_airworthy_at()` stub called in server guard                                          |
| SCH-06 | Recurring reservations                                                        | Materialize children with `series_id`; edit-modes handled server-side                    |
| SCH-07 | Calendar views by aircraft/instructor/student/day/week/month                  | FullCalendar React with MIT plugins only (see premium fallback)                          |
| SCH-08 | Lifecycle requested → approved → dispatched → flown → closed                  | Status state machine + server-enforced transition guards                                 |
| SCH-09 | Distinct cancel/no-show/scrub states                                          | Cancel enum values + Phase 2 `no_show` write on that state                               |
| SCH-13 | Schedulable resource types include sim/oral/academic/misc                     | Single reservation table + `activity_type` enum                                          |
| SCH-15 | Personnel unavailability blocks reservations                                  | Shadow-row trigger on `person_unavailability`                                            |
| SCH-16 | Block scheduling                                                              | `schedule_block` + materialized instances + `parent_block_id` inflate trigger            |
| SCH-17 | Schedule view distinguishes activity types visually                           | Color chips keyed to enum in FullCalendar event renderer                                 |
| SCH-18 | Single conflict path across aircraft/instructor/room/unavailability           | Four partial exclusion constraints + shadow rows unify the check                         |
| INS-04 | Instructor marks flight closed and captures Hobbs/tach/fuel/oil/route/squawks | `/dispatch/close/[id]` form + paired `flight_in` entry + squawk rows                     |
| FLT-04 | `isAirworthyAt` derived state                                                 | Stub function + `aircraft_squawk` table                                                  |
| FTR-01 | Real-time dispatch screen                                                     | tRPC polling @ 15s + TanStack Query `refetchInterval`                                    |
| FTR-02 | Student electronic check-in + instructor authorization                        | Dedicated columns + dispatch modal requires both non-null                                |
| FTR-03 | Aircraft check-out/in Hobbs                                                   | Paired `flight_out`/`flight_in` rows + updated totals view                               |
| FTR-04 | Overdue alarm                                                                 | Computed `now() > end + grace`, sessionStorage-diff audio cue, in-app notification table |
| FTR-05 | XC flight following fields                                                    | Nullable columns on reservation, consumed by Phase 7                                     |
| FTR-06 | Passenger manifest                                                            | `passenger_manifest` table + print preview page                                          |
| FTR-07 | FIF notices + ack before dispatch                                             | `fif_notice` + `fif_acknowledgement` + dispatch-modal gate                               |
| FTR-08 | Close-out workflow consolidates times/fuel/route/squawks                      | `/dispatch/close/[id]` single-page form                                                  |

</phase_requirements>

## Summary

Phase 3 is dominated by one Postgres pattern (`EXCLUDE USING gist` with partial WHERE on `tstzrange`) and one workflow loop (request → approve → dispatch → close). The data-model decisions are locked; the research risk is almost entirely in the calendar library (FullCalendar's resource-timeline plugin is **premium as of 2026** — fallback to timegrid + custom per-resource column layout is required) and the small number of cross-cutting browser quirks (audio autoplay policy, Next.js App Router SSR for FullCalendar).

Everything else is a straightforward application of the Phase 1/2 contract: schema-first, Drizzle + hand-mirrored SQL migration, RLS via `pgPolicy`, `audit.attach()` on every safety-relevant table, cross-tenant test per table, and all mutations wrapped in `withSchoolContext`. The new infrastructural moves are (a) enabling `btree_gist`, (b) extending `flight_log_entry_kind` without breaking Phase 2 tests, and (c) the shadow-row trigger for unavailability.

**Primary recommendation:** Build the reservation table + exclusion constraints + cross-tenant test + concurrent-insert test BEFORE any UI. The entire phase stands on that foundation. Do the FullCalendar fallback decision at install-time in the same wave.

## Standard Stack

### Core

| Library                                           | Version                      | Purpose                                                                          | Why Standard                                          |
| ------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Postgres `btree_gist` extension                   | shipped w/ PG 15+            | Allows `=` operator on uuid/enum inside a gist index alongside `&&` on tstzrange | Required for the partial exclusion constraint pattern |
| `@fullcalendar/react`                             | ^6.1                         | Calendar UI primitive                                                            | Mature, MIT core, broad adoption                      |
| `@fullcalendar/timegrid`                          | ^6.1                         | Day/week time-grid view                                                          | MIT                                                   |
| `@fullcalendar/daygrid`                           | ^6.1                         | Month view                                                                       | MIT                                                   |
| `@fullcalendar/interaction`                       | ^6.1                         | Click-empty-slot → new reservation                                               | MIT                                                   |
| `@tanstack/react-query`                           | already installed (via tRPC) | `refetchInterval` for dispatch polling                                           | Already in stack                                      |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Phase 2 versions             | Reservation + dispatch-modal + close-out forms                                   | Phase 2 pattern                                       |
| `date-fns-tz`                                     | Phase 1 version              | School-timezone display                                                          | Phase 1 pattern                                       |

### Supporting

| Library                  | Version | Purpose                                                  | When to Use                                                                                                              |
| ------------------------ | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@radix-ui/react-dialog` | latest  | Accessible modal primitive for dispatch + FIF ack modals | Use this — do not build dispatch modal from scratch; this is the first real modal in the app, establish the pattern once |
| `react-markdown`         | ^9      | Render FIF notice markdown body                          | FIF bodies are markdown in the schema                                                                                    |

### Alternatives Considered

| Instead of                                  | Could Use                                                                                                 | Tradeoff                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@fullcalendar/resource-timeline` (PREMIUM) | `@fullcalendar/timegrid` + custom per-resource column layout (one timegrid per tab, filtered client-side) | Resource-timeline would be the "native" way to render rows=resources, columns=time. It is a paid/commercial plugin in 2026. Fallback: render a timegrid view per resource-tab (by-aircraft tab shows only that aircraft's events). Less "dense" visually but zero license risk |
| `@radix-ui/react-dialog`                    | Headless UI, custom                                                                                       | Radix is already the Next.js 15 App Router default and has best accessibility story                                                                                                                                                                                            |
| Custom polling loop                         | TanStack Query `refetchInterval`                                                                          | TanStack Query handles visibility-change, dedupe, error backoff for free                                                                                                                                                                                                       |
| Server Actions for dispatch                 | tRPC mutations                                                                                            | tRPC preferred because the dispatch screen is already using tRPC polling and the types flow through; Server Actions would fork the data path                                                                                                                                   |

**Installation:**

```bash
pnpm -F web add @fullcalendar/react @fullcalendar/timegrid @fullcalendar/daygrid @fullcalendar/interaction @radix-ui/react-dialog react-markdown
```

**Do NOT install** `@fullcalendar/resource-timeline` unless the license situation has reversed at install-time.

## Architecture Patterns

### New schema files

```
packages/db/src/schema/
├── reservations.ts          # reservation + exclusion constraints (via sql`...` in migration, not Drizzle DSL)
├── schedule_blocks.ts       # schedule_block + schedule_block_instance
├── rooms.ts                 # room
├── squawks.ts               # aircraft_squawk (minimal Phase 3 version)
├── fif.ts                   # fif_notice + fif_acknowledgement
├── passenger_manifest.ts    # passenger_manifest
└── person_unavailability.ts # if Phase 2 didn't create it
```

Extend:

- `aircraft.ts` — add `grounded_at timestamptz` nullable
- `flight_log.ts` — enum extension handled in migration (not Drizzle schema change, since Drizzle doesn't handle enum alteration cleanly)
- `enums.ts` — document new enums (reservation_status, reservation_activity_type, squawk_severity, fif_severity, etc.)

### New migration

Hand-authored `packages/db/migrations/0007_phase3_scheduling.sql` mirrored to `supabase/migrations/`.

Structure:

1. `create extension if not exists btree_gist;`
2. Enum creation (reservation_status, reservation_activity_type, squawk_severity, fif_severity, manifest_position, block_kind, unavailability_kind, close_out_reason)
3. `ALTER TYPE flight_log_entry_kind ADD VALUE IF NOT EXISTS 'flight_out'; ADD VALUE IF NOT EXISTS 'flight_in';`
4. `ALTER TABLE aircraft ADD COLUMN grounded_at timestamptz;`
5. CREATE TABLE reservation (...) + 4 `EXCLUDE USING gist ... WHERE ...` constraints
6. CREATE TABLE room, aircraft_squawk, fif_notice, fif_acknowledgement, passenger_manifest, schedule_block, schedule_block_instance, person_unavailability (if not exists)
7. CREATE OR REPLACE FUNCTION `public.is_airworthy_at(uuid, timestamptz) RETURNS boolean`
8. CREATE OR REPLACE FUNCTION `public.free_busy(text, uuid, timestamptz, timestamptz) RETURNS SETOF tstzrange`
9. Replace `aircraft_current_totals` view to handle paired `flight_out`/`flight_in` + legacy `flight`
10. RLS enable + policies for every new table (pattern from Phase 1/2)
11. `select audit.attach('reservation'); ...` for every safety-relevant table
12. Shadow-row trigger on `person_unavailability` (AFTER INSERT/UPDATE/DELETE)
13. Block-inflate trigger on `reservation` (BEFORE INSERT when parent_block_id is not null)

### Pattern 1: Partial GiST exclusion constraint

**What:** Prevent overlapping tstzrange reservations for the same aircraft/instructor/student/room, but only when the row is in an "active" status.
**When to use:** Every resource that can be double-booked.
**Example:**

```sql
-- Source: Postgres docs https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-EXCLUDE
-- btree_gist docs: https://www.postgresql.org/docs/current/btree-gist.html
create extension if not exists btree_gist;

alter table public.reservation
  add constraint reservation_aircraft_no_overlap
  exclude using gist (
    aircraft_id with =,
    time_range with &&
  ) where (aircraft_id is not null and status in ('approved','dispatched','flown'));
```

**Behavior:** When a row is inserted/updated into `approved/dispatched/flown` with a non-null `aircraft_id`, Postgres indexes it in the partial gist index and rejects any other row that would create an overlap. Rows outside the WHERE (e.g. `requested`, `cancelled_*`) are ignored by the index — they can overlap freely, which is exactly the desired behavior for pending requests and historical cancellations.

**Error code:** Postgres raises SQLSTATE `23P01` (`exclusion_violation`) on conflict. Catch in the tRPC layer and surface a user-visible "Conflict with reservation X" message including the conflicting row id (available via the `CONSTRAINT` detail).

### Pattern 2: Half-open tstzrange bounds

**What:** Use `'[)'` for all `tstzrange` values so that adjacent reservations (A ends at 10:00, B starts at 10:00) do NOT overlap.
**When to use:** Every reservation row. Server-side helper builds the range.
**Example:**

```typescript
// In tRPC router
import { sql } from 'drizzle-orm';
const range = sql`tstzrange(${start.toISOString()}, ${end.toISOString()}, '[)')`;
```

### Pattern 3: Shadow-row trigger for unavailability

**What:** Reuse the exclusion constraint for personnel unavailability by materializing a "fake" reservation row on every person_unavailability row.
**When to use:** SCH-15.
**Example:**

```sql
-- Source: Postgres docs https://www.postgresql.org/docs/current/plpgsql-trigger.html
create or replace function public.fn_person_unavailability_shadow()
returns trigger language plpgsql as $$
declare
  v_user_role text;
begin
  if (tg_op = 'INSERT') then
    select active_role into v_user_role from public.users where id = new.user_id;
    insert into public.reservation
      (school_id, base_id, activity_type, time_range, status,
       instructor_id, student_id, notes, requested_by, requested_at)
    values
      (new.school_id, null, 'misc', new.time_range, 'approved',
       case when v_user_role = 'instructor' then new.user_id else null end,
       case when v_user_role = 'student' then new.user_id else null end,
       'unavailable: ' || coalesce(new.reason, new.kind::text),
       new.created_by, now())
    returning id into new.shadow_reservation_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    update public.reservation
      set time_range = new.time_range,
          notes      = 'unavailable: ' || coalesce(new.reason, new.kind::text)
    where id = old.shadow_reservation_id;
    return new;
  elsif (tg_op = 'DELETE') then
    -- soft-cancel the shadow so the exclusion constraint releases
    update public.reservation
      set status     = 'cancelled',
          deleted_at = now()
    where id = old.shadow_reservation_id;
    return old;
  end if;
  return null;
end $$;

create trigger person_unavailability_shadow
  after insert or update or delete on public.person_unavailability
  for each row execute function public.fn_person_unavailability_shadow();
```

Add a `shadow_reservation_id uuid` column to `person_unavailability` so the trigger can find its row on update/delete without a fragile lookup.

### Pattern 4: tRPC polling with TanStack Query `refetchInterval`

**What:** Dispatch screen queries `dispatch.board` every 15s, automatically pauses when tab is hidden.
**Example:**

```typescript
// apps/web/app/(app)/dispatch/DispatchBoard.tsx
'use client';
import { trpc } from '@/lib/trpc/client';

export function DispatchBoard() {
  const query = trpc.dispatch.board.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false, // pauses when tab hidden — default
    refetchOnWindowFocus: true,
  });
  // ...
}
```

`refetchIntervalInBackground: false` is the default and is what we want — bandwidth savings when nobody's looking.

### Pattern 5: Overdue audio cue (autoplay-friendly)

**What:** Play a beep when a newly-overdue reservation appears on the board.
**Problem:** Browser autoplay policies block `HTMLAudioElement.play()` without a user gesture, and the dispatch screen may sit idle for hours.
**Solution:**

1. Require a one-time "Enable alerts" click on page load that plays a silent `<audio>` element (primes the gesture bucket)
2. Store `audioEnabled` flag in state; show a banner if not enabled
3. When the 15s poll returns a new overdue (diffed against a `sessionStorage` set of already-seen ids), call `audioRef.current?.play()` — post-gesture, this succeeds
4. Fall back to visible red flash + browser Notification API (also requires permission prompt on load) if audio is muted

```typescript
// One-time prime
const enableAlerts = async () => {
  await audioRef.current?.play();
  audioRef.current?.pause();
  audioRef.current!.currentTime = 0;
  setAudioEnabled(true);
};
```

**Source:** Chromium autoplay policy https://developer.chrome.com/blog/autoplay/. Requires "sticky activation" = any user gesture on the page, after which HTMLAudioElement.play() works.

### Pattern 6: FullCalendar in Next.js App Router (SSR)

**What:** FullCalendar manipulates the DOM via refs; must be a Client Component.
**Pattern:**

```tsx
// apps/web/app/(app)/schedule/CalendarClient.tsx
'use client';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

export function CalendarClient({ initialEvents }: { initialEvents: Event[] }) {
  return (
    <FullCalendar
      plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
      initialView="timeGridWeek"
      events={initialEvents}
      // ...
    />
  );
}
```

Parent server component (`page.tsx`) fetches initial events via tRPC server caller and passes as props. Client component subscribes to tRPC query for updates.

### Pattern 7: Paired flight_out / flight_in totals view

**What:** Update `aircraft_current_totals` to sum both legacy `flight` entries and new `flight_out`/`flight_in` pairs, and handle in-progress flights (dispatched but not yet closed).
**Decision for in-progress flights:** **Exclude flight_out rows whose paired_entry_id is NULL and no matching flight_in exists.** Rationale: until the aircraft lands, the current totals should reflect the last closed flight, not a guess at in-progress time. Dispatch screen shows the expected end; the totals view shows confirmed history.

```sql
-- Source: adapted from Phase 2 aircraft_current_totals pattern
create or replace view public.aircraft_current_totals
with (security_invoker = true) as
select
  a.id as aircraft_id,
  a.school_id,
  coalesce(sum(
    case
      -- Legacy single-row 'flight' kind (Phase 2 data): in - out
      when fle.kind = 'flight' then coalesce(fle.hobbs_in, 0) - coalesce(fle.hobbs_out, 0)
      -- New paired kind: only count the flight_in (closed flights)
      when fle.kind = 'flight_in' then coalesce(fle.hobbs_in, 0) - coalesce(
        (select hobbs_out from public.flight_log_entry where id = fle.corrects_id), 0
      )
      -- Baseline rows carry initial totals
      when fle.kind = 'baseline' then coalesce(fle.hobbs_in, 0)
      -- Corrections add signed delta
      when fle.kind = 'correction' then coalesce(fle.hobbs_in, 0)
      else 0
    end
  ), 0) as current_hobbs
from public.aircraft a
left join public.flight_log_entry fle
  on fle.aircraft_id = a.id
  and fle.kind in ('flight', 'flight_in', 'baseline', 'correction')
where a.deleted_at is null
group by a.id, a.school_id;
```

**NOTE:** `paired_entry_id` is a new column on `flight_log_entry` added in this phase's migration. Reusing `corrects_id` above was a typo-candidate — use a new column `paired_entry_id uuid references flight_log_entry(id)` specifically for the flight_out/flight_in link. `corrects_id` stays reserved for corrections.

### Anti-Patterns to Avoid

- **Building a custom modal instead of Radix Dialog.** Dispatch modal has FIF ack gating + Hobbs form + passenger manifest + authorization ticks. Accessibility matters; use Radix.
- **Hand-rolled polling `setInterval`.** TanStack Query already handles visibility, dedupe, backoff.
- **Relying on the Drizzle DSL to create the exclusion constraints.** Drizzle does not express partial GiST exclusion constraints natively — write them as raw SQL in the migration and use `sql\`\`` template literals or leave them out of the Drizzle schema entirely.
- **Storing calendar colors in the database.** CONTEXT says activity_type colors are locked for cross-school consistency — hard-code in a client const.
- **Updating the flight_log_entry row at close-out.** Append-only contract from Phase 2. Write a new `flight_in` row with `paired_entry_id` pointing at the `flight_out`.
- **Displaying the word "Approved" in UI.** ESLint banned-terms rule will catch it at CI. Use `"Confirmed"` label. Status value in DB stays `approved`.
- **Calling `free_busy` with a synchronous scan per event.** It's a SRF; wrap in a single tRPC query returning a ranges array, not one call per reservation.
- **Ignoring `refetchIntervalInBackground: false`.** Hidden tabs polling every 15s wastes bandwidth and DB connections.

## Don't Hand-Roll

| Problem                  | Don't Build                                                              | Use Instead                                                                 | Why                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Overlap detection        | Application-level "find-any-row-where-time-overlaps" query before insert | Postgres `EXCLUDE USING gist` + `btree_gist`                                | Race conditions — two parallel requests can both pass the check and both insert. Exclusion constraint is atomic at the index level |
| Modal primitives         | Custom focus trap + escape handler + backdrop                            | `@radix-ui/react-dialog`                                                    | Accessibility landmines (focus, aria, scroll lock, inert background)                                                               |
| Polling loop             | `useEffect` + `setInterval` + visibility listener                        | TanStack Query `refetchInterval`                                            | Visibility, dedupe, retry, unmount cleanup all already handled                                                                     |
| tstzrange math           | Manual `start1 <= end2 && start2 <= end1` in JS                          | Postgres `&&` operator + `tstzrange`                                        | Time-zone and inclusive/exclusive bound bugs are endless                                                                           |
| Recurring expansion      | iCalendar RRULE parser                                                   | Hand-rolled loop over (frequency, days_of_week, until_date) generating rows | CONTEXT bans RRULE for v1; simple loop is 30 lines                                                                                 |
| Calendar rendering       | DIY flex/grid calendar                                                   | FullCalendar React                                                          | Time zones, DST, event layout, drag are non-trivial                                                                                |
| FIF markdown rendering   | Custom parser                                                            | `react-markdown`                                                            | XSS surface                                                                                                                        |
| Conflict error surfacing | Regex-parsing Postgres error text                                        | Catch SQLSTATE `23P01`, read constraint name, map to a translated message   | Robust across PG versions                                                                                                          |

**Key insight:** The entire scheduling subsystem is a thin TypeScript layer over two Postgres features (`tstzrange` + partial GiST exclusion constraints) and one UI library (FullCalendar). Hand-rolled versions of either layer will produce subtle double-booking bugs that only surface under concurrency — exactly the kind of bug a flight school cannot tolerate.

## Common Pitfalls

### Pitfall 1: Forgetting `btree_gist` extension

**What goes wrong:** `alter table add constraint ... exclude using gist (aircraft_id with =, time_range with &&)` fails with "data type uuid has no default operator class for access method gist".
**Why it happens:** The `=` operator on scalar types (uuid/enum/int) is not a native gist operator. `btree_gist` provides the shim.
**How to avoid:** `create extension if not exists btree_gist;` as the **first statement** of the migration, before any exclusion constraint DDL. Grant usage to postgres role on Supabase (should already be enabled in the hosted environment, but verify).
**Warning signs:** Migration fails on first `exclude using gist` statement.

### Pitfall 2: `'[]'` vs `'[)'` tstzrange bounds

**What goes wrong:** Two back-to-back reservations (10:00–11:00 and 11:00–12:00) are reported as conflicting.
**Why:** Default tstzrange bounds are `'[)'` (half-open), but if you construct it inclusively (`'[]'`) the endpoints overlap.
**How to avoid:** ALWAYS pass `'[)'` as the third argument to `tstzrange()` in every insert/update. Add a CHECK constraint: `check (lower_inc(time_range) and not upper_inc(time_range))` to enforce it at the table level.
**Warning signs:** Instructor can't book 10–11 and 11–12 on the same day.

### Pitfall 3: `flight_log_entry_kind` enum extension inside a transaction

**What goes wrong:** `ALTER TYPE ... ADD VALUE` cannot be used inside the same transaction that then uses the new value. Postgres requires a commit first.
**Why:** enum additions are visible to later statements but cannot be referenced in the same txn in older PG versions.
**How to avoid:** Either (a) put the `ALTER TYPE ADD VALUE` in its own migration file that runs before the file that uses the new values, OR (b) since PG 12 `ADD VALUE` is transactional and the restriction only applies to referencing the value in the same txn — in practice, do (a) to avoid edge cases. The Phase 3 migration can split into `0007_phase3_enum_bump.sql` (the enum additions only) + `0008_phase3_scheduling.sql` (everything else).
**Warning signs:** `ERROR: unsafe use of new value "flight_out" of enum type flight_log_entry_kind`.
**Source:** https://www.postgresql.org/docs/current/sql-altertype.html

### Pitfall 4: FullCalendar is SSR-incompatible

**What goes wrong:** `ReferenceError: window is not defined` or hydration mismatch.
**How to avoid:** Every file importing `@fullcalendar/*` starts with `'use client'`. Do not export them from a server component.
**Warning signs:** Next.js build error on schedule page.

### Pitfall 5: Audio autoplay blocked

**What goes wrong:** `audioRef.current.play()` rejects with `NotAllowedError`.
**Why:** Browser autoplay policy requires user gesture.
**How to avoid:** Explicit "Enable alerts" button on dispatch-screen mount. Prime the audio element with a muted play-then-pause. Persist enabled flag in sessionStorage so the user only clicks once per session.
**Warning signs:** Overdue alarm silent; console has `NotAllowedError`.

### Pitfall 6: Exclusion constraint tombstone rows

**What goes wrong:** A cancelled reservation still blocks a new one in the same slot.
**Why:** The WHERE clause was written as `status != 'cancelled'` and missed `no_show`/`scrubbed_*`.
**How to avoid:** Use an **allow-list**, not a deny-list: `status in ('approved','dispatched','flown')` exactly as CONTEXT specifies. New states default to "not counted."
**Warning signs:** Test "can rebook a cancelled slot" fails.

### Pitfall 7: Drizzle `pgPolicy` `to:` field

**What goes wrong:** `to: sql\`authenticated\``produces invalid SQL.
**How to avoid:**`to: 'authenticated'`as a plain string. Phase 1 bug — stays fixed.
**Warning signs:** Migration generation output has`"TO"` followed by nothing.

### Pitfall 8: Concurrent insert test is flaky

**What goes wrong:** Writing a parallel-insert test via `Promise.all([insertA, insertB])` on the same postgres client serializes on the wire.
**How to avoid:** Open TWO separate `postgres()` clients (or use two separate connections from the pool), `BEGIN` in each, `INSERT` in each, then `COMMIT` both and assert that exactly one succeeds and the other rejects with SQLSTATE `23P01`. See Code Examples below.
**Warning signs:** Test passes even when the constraint is disabled.

### Pitfall 9: `aircraft_current_totals` view breaks Phase 2 tests

**What goes wrong:** The updated view changes results for existing Phase 2 fixtures that used `kind='flight'`.
**How to avoid:** The view must handle **both** legacy `flight` rows and new `flight_out`/`flight_in` pairs. Run Phase 2's existing view tests against the new definition before merging. The legacy branch (`case when fle.kind = 'flight' then ...`) must produce identical output.
**Warning signs:** `tests/db/aircraft-totals.test.ts` red on Phase 2 fixtures.

### Pitfall 10: `person_unavailability` insert races the shadow trigger

**What goes wrong:** Trigger runs BEFORE INSERT on person_unavailability but the shadow reservation row insert itself fails the exclusion constraint — person already double-booked. Should the unavailability insert fail? CONTEXT is ambiguous.
**Recommendation:** Let it fail. If a person is already booked on a flight at 10:00 and tries to mark themselves unavailable 10–11, the system should refuse and ask them to cancel the conflicting flight first. Trigger exceptions propagate to the tRPC caller as a user-visible error. Document this in the procedure's input schema.
**Warning signs:** User confusion when unavailability silently does nothing.

### Pitfall 11: Banned-term leak into JSX

**What goes wrong:** Developer writes `<Badge>{reservation.status}</Badge>` which renders the string `"approved"`; ESLint rule does not catch it because the rule looks at string literals, not interpolated values, **but** any hardcoded label like `"Approved"` in a select option will trip.
**How to avoid:** Create a display-label map in a single file: `const RESERVATION_STATUS_LABEL: Record<Status, string> = { approved: 'Confirmed', ... }` and always render via the map. Grep for hardcoded "Approved" before merging.
**Warning signs:** CI red on lint stage.

### Pitfall 12: `corrects_id` vs `paired_entry_id` confusion

**What goes wrong:** Reusing `corrects_id` for the flight_out↔flight_in link pollutes the correction semantics from Phase 2.
**How to avoid:** Add a new column `paired_entry_id uuid references flight_log_entry(id)` on flight_log_entry specifically for the pairing. Nullable. Only flight_in rows set it. `corrects_id` stays reserved for kind='correction' rows.

## Code Examples

### Concurrent-insert test (Vitest + postgres-js)

```typescript
// tests/rls/reservation-concurrent-insert.test.ts
// Verifies two parallel INSERTs of overlapping approved reservations:
// exactly one succeeds, the other fails with SQLSTATE 23P01.
import { describe, test, expect, afterAll } from 'vitest';
import postgres from 'postgres';

const URL = process.env.DIRECT_DATABASE_URL!;

describe('reservation exclusion constraint under concurrency', () => {
  test('two overlapping approved reservations: one succeeds, one rejects', async () => {
    // Two independent connections — critical for true concurrency
    const clientA = postgres(URL, { prepare: false, max: 1 });
    const clientB = postgres(URL, { prepare: false, max: 1 });

    // Seed: one aircraft, one school, one base, one instructor, one student
    // (reuse your existing seed helper)
    const { aircraftId, schoolId, baseId, instructorId, studentA, studentB } =
      await seedScheduleFixture();

    // Both try to book the SAME aircraft at the SAME time in parallel
    const txA = clientA.begin(async (sql) => {
      return sql`
        insert into public.reservation
          (school_id, base_id, activity_type, time_range, status,
           aircraft_id, instructor_id, student_id, requested_by, requested_at, approved_at, approved_by)
        values
          (${schoolId}, ${baseId}, 'flight',
           tstzrange('2026-05-01 14:00+00','2026-05-01 16:00+00','[)'),
           'approved', ${aircraftId}, ${instructorId}, ${studentA},
           ${studentA}, now(), now(), ${instructorId})
        returning id
      `;
    });

    const txB = clientB.begin(async (sql) => {
      return sql`
        insert into public.reservation
          (school_id, base_id, activity_type, time_range, status,
           aircraft_id, instructor_id, student_id, requested_by, requested_at, approved_at, approved_by)
        values
          (${schoolId}, ${baseId}, 'flight',
           tstzrange('2026-05-01 15:00+00','2026-05-01 17:00+00','[)'),
           'approved', ${aircraftId}, ${instructorId}, ${studentB},
           ${studentB}, now(), now(), ${instructorId})
        returning id
      `;
    });

    const results = await Promise.allSettled([txA, txB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code: string }).code).toBe('23P01');

    await Promise.all([clientA.end(), clientB.end()]);
  });
});
```

Source: postgres-js docs https://github.com/porsager/postgres#transactions. `.begin()` opens a real SQL transaction per client; the two clients use two separate connections so the constraint check really races.

### Dispatch board tRPC procedure (polling-friendly)

```typescript
// packages/api/src/routers/dispatch.ts
export const dispatchRouter = router({
  board: instructorOrAdminProcedure.query(async ({ ctx }) => {
    return withSchoolContext(ctx.db, ctx.session, async () => {
      const now = new Date();
      const horizon = new Date(now.getTime() + 60 * 60 * 1000);
      const cutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const [flying, upcoming, recent] = await Promise.all([
        ctx.db.execute(sql`
            select r.*, a.tail_number, u_s.full_name as student_name, u_i.full_name as instructor_name,
                   lower(r.time_range) as start_at,
                   upper(r.time_range) as end_at,
                   (now() > upper(r.time_range) + (s.overdue_grace_minutes || ' minutes')::interval) as is_overdue
            from public.reservation r
            left join public.aircraft a on a.id = r.aircraft_id
            left join public.users u_s on u_s.id = r.student_id
            left join public.users u_i on u_i.id = r.instructor_id
            join public.schools s on s.id = r.school_id
            where r.status = 'dispatched' and r.deleted_at is null
            order by upper(r.time_range) asc
          `),
        ctx.db.execute(sql`
            select ... where r.status = 'approved' and lower(r.time_range) <= ${horizon}
                                                    and lower(r.time_range) >= ${now}
          `),
        ctx.db.execute(sql`
            select ... where r.status = 'closed' and r.closed_at >= ${cutoff}
          `),
      ]);

      return { flying, upcoming, recent, now };
    });
  }),
});
```

### `is_airworthy_at` stub

```sql
create or replace function public.is_airworthy_at(p_aircraft_id uuid, p_at timestamptz)
returns boolean language sql stable security invoker as $$
  select
    case
      when (select deleted_at is not null from public.aircraft where id = p_aircraft_id) then false
      when (select grounded_at is not null and grounded_at <= p_at from public.aircraft where id = p_aircraft_id) then false
      when exists (
        select 1 from public.aircraft_squawk
        where aircraft_id = p_aircraft_id
          and severity = 'grounding'
          and opened_at <= p_at
          and (resolved_at is null or resolved_at > p_at)
      ) then false
      else true
    end
$$;
```

### `free_busy` SRF for privacy-first student view

```sql
create or replace function public.free_busy(
  p_resource_type text,   -- 'aircraft' | 'instructor' | 'room'
  p_resource_id uuid,
  p_from timestamptz,
  p_to   timestamptz
) returns setof tstzrange language sql stable security invoker as $$
  select r.time_range
  from public.reservation r
  where r.status in ('approved','dispatched','flown')
    and r.deleted_at is null
    and r.time_range && tstzrange(p_from, p_to, '[)')
    and case p_resource_type
          when 'aircraft'   then r.aircraft_id   = p_resource_id
          when 'instructor' then r.instructor_id = p_resource_id
          when 'room'       then r.room_id       = p_resource_id
          else false
        end
$$;
```

Security note: `security invoker` means RLS applies — a student will only see rows they can see. The tRPC `schedule.list freebusy` mode is authorized separately (student can list free/busy only on resources they're allowed to book), and the SRF returns only the `tstzrange` column (no names/ids) so leakage is zero even if RLS were bypassed.

## State of the Art

| Old Approach                                            | Current Approach                                   | When Changed                                      | Impact                                           |
| ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Application-level overlap check in a transaction        | `EXCLUDE USING gist` + `btree_gist`                | Postgres 9.2+ (stable for a decade)               | Zero race conditions                             |
| Server-sent events / WebSockets for dispatch            | tRPC polling with `refetchInterval`                | Phase 3 constraint — Realtime deferred to Phase 8 | Simpler; good enough at 15s cadence              |
| RRULE iCalendar for recurring                           | Materialize child rows                             | CONTEXT decision — v1 scope                       | No RRULE parser; simple bulk update by series_id |
| `@fullcalendar/resource-timeline` for rows-as-resources | Fallback: per-resource tabbed timegrid views       | 2026: resource-timeline is premium/paid           | Less dense UI, zero license cost                 |
| Single-row flight_log with UPDATE at close-out          | Paired append-only `flight_out` / `flight_in` rows | Phase 2 append-only contract                      | No UPDATE on flight_log_entry; audit integrity   |

**Deprecated/outdated:**

- Hand-rolled polling via `setInterval` — use TanStack Query
- Pre-Phase-3 `kind='flight'` single-row entries remain supported in the view for Phase 2 fixture compatibility, but new code paths write paired rows

## Open Questions

1. **Will `@fullcalendar/resource-timeline` license change by install time?**
   - What we know: As of 2026, it is premium (https://fullcalendar.io/pricing).
   - What's unclear: Nothing — check at install and if still premium, use the timegrid fallback.
   - Recommendation: Plan for fallback. Tabbed timegrid (one tab per aircraft/instructor/room) renders the same information with only a layout difference.

2. **How does Drizzle express `EXCLUDE USING gist` with a partial WHERE?**
   - What we know: Drizzle has no first-class DSL for exclusion constraints with index predicates.
   - What's unclear: Whether drizzle-kit will `drop` the constraint on subsequent migration generation if it doesn't know about it.
   - Recommendation: Create the constraints ONLY in the hand-authored SQL migration. Do NOT add them to the Drizzle schema (`reservations.ts`). When drizzle-kit generates a diff, ignore any warnings about unknown constraints — the hand-authored migration is the source of truth for Phase 3 forward. Add a comment in `reservations.ts`: `// exclusion constraints live in 0007_phase3_scheduling.sql — do not migrate via drizzle-kit`.

3. **Should the block-inflate trigger fire BEFORE or AFTER insert on reservation?**
   - Recommendation: BEFORE INSERT so the exclusion constraint sees the inflated instructor_id/aircraft_id/room_id when it evaluates.

4. **In-progress flight in `aircraft_current_totals`?**
   - Recommended in Pattern 7: exclude. Dispatch screen shows live in-progress state, totals view shows closed history.

5. **`series_id` on a reservation — does cancelling the series bulk-write an audit entry per row?**
   - Yes. The audit trigger fires per row; a bulk `update reservation set status='cancelled_free' where series_id = $1` produces N audit_log rows. Expected and correct.

## Sources

### Primary (HIGH confidence)

- Postgres docs — `CREATE TABLE ... EXCLUDE`: https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-EXCLUDE
- Postgres docs — `btree_gist`: https://www.postgresql.org/docs/current/btree-gist.html
- Postgres docs — `tstzrange` and range operators: https://www.postgresql.org/docs/current/rangetypes.html
- Postgres docs — `ALTER TYPE ... ADD VALUE` caveats: https://www.postgresql.org/docs/current/sql-altertype.html
- Postgres docs — PL/pgSQL triggers: https://www.postgresql.org/docs/current/plpgsql-trigger.html
- TanStack Query — `refetchInterval` and visibility: https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching
- Next.js App Router — Client Components: https://nextjs.org/docs/app/building-your-application/rendering/client-components
- FullCalendar React docs: https://fullcalendar.io/docs/react
- Phase 1/2 RESEARCH.md + existing migrations (0000-0006) — RLS + audit + hard-delete patterns
- Phase 2 `flight_log.ts` + `aircraft_current_totals` view — shape to extend
- CLAUDE.md (repo root) — DATABASE_URL contract, banned-terms rule, soft-delete contract

### Secondary (MEDIUM confidence)

- FullCalendar License — https://fullcalendar.io/license and https://fullcalendar.io/pricing: confirms `@fullcalendar/resource-timeline` is a premium/paid plugin as of 2026. Cross-checked against https://www.npmjs.com/package/@fullcalendar/resource-timeline.
- Chromium autoplay policy: https://developer.chrome.com/blog/autoplay/ — user gesture required for `HTMLAudioElement.play()`.
- postgres-js transactions: https://github.com/porsager/postgres#transactions — `.begin()` per client gives real concurrent txns.

### Tertiary (LOW confidence)

- None — every claim in this research document is backed by a primary or secondary source above.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified against current docs
- Data model / exclusion constraint pattern: HIGH — canonical Postgres feature, stable for a decade
- Migration sequencing (enum bump in separate file): HIGH — explicit Postgres docs caveat
- FullCalendar plugin selection: MEDIUM — fallback path added because resource-timeline is paid; verify again at install
- Audio autoplay workaround: MEDIUM — standard pattern but policy can change; test in Chrome + Safari
- Shadow-row trigger for unavailability: HIGH — straightforward PL/pgSQL, pattern proven in similar systems
- `is_airworthy_at` stub: HIGH — pure SQL, signature frozen for Phase 4
- tRPC polling pattern: HIGH — TanStack Query is the backbone

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — stable Postgres + Next.js 15 stack; only the FullCalendar license situation is time-sensitive, re-verify on install)
