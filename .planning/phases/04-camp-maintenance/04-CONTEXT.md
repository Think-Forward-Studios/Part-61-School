# Phase 4: CAMP Maintenance - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Phase 3 `is_airworthy_at(aircraft_id, ts)` stub with a real CAMP (Continuous Airworthiness Maintenance Program) engine. Every claim the scheduler makes about an aircraft being flyable must be backed by deterministic inspection status + AD compliance + component lifing + squawk lifecycle — records an FAA inspector can read and trust.

Phase 4 ships: typed maintenance items with interval rules, ADs as first-class entities with applicability + compliance history, component life limits per part, hard auto-ground with IA-only §91.409 10-hour overrun path, full squawk lifecycle (open → triaged → deferred|in_work → fixed → returned_to_service) with A&P/IA cert-number snapshots, work orders with parts inventory (lot/serial tracking), digital logbook PDF export per book (airframe/engine/prop), rule-based downtime prediction.

Phase 4 does NOT ship: syllabus rule gates on currencies/qualifications (Phase 6), ADS-B fleet overlay (Phase 7), email/SMS notification sweeps (Phase 8), automated FAA-ADs-feed ingestion (v2), mechanic labor billing (out of scope per PROJECT.md), parts purchasing/reordering workflow (v2).

Covers requirements: MNT-01, MNT-02, MNT-03, MNT-04, MNT-05, MNT-06, MNT-07, MNT-08, MNT-09, MNT-10, MNT-11.

</domain>

<decisions>
## Implementation Decisions

### Maintenance item model (MNT-01, MNT-02)

- **Typed items with interval rules.** One `maintenance_item` table, not one-per-kind. Columns: `id`, `school_id`, `base_id`, `aircraft_id` (FK), `engine_id` (FK, nullable — for per-engine items like mag timing), `component_id` (FK, nullable — for life-limited parts), `kind` enum, `title`, `description`, `interval_rule jsonb`, `last_completed_at`, `last_completed_hours` (jsonb snapshot of hobbs/tach/airframe/engine at completion), `last_completed_by_user_id`, `last_work_order_id`, `next_due_at` (generated), `next_due_hours` (generated), `status` enum (`current | due_soon | overdue | grounding`), `notes`, `deleted_at`, audit columns.
- **`maintenance_item_kind` enum:** `annual_inspection`, `hundred_hour_inspection`, `airworthiness_directive`, `oil_change`, `transponder_91_413`, `pitot_static_91_411`, `elt_battery`, `elt_91_207`, `vor_check`, `component_life`, `manufacturer_service_bulletin`, `custom`.
- **`interval_rule` JSONB shape:**
  ```json
  { "clock": "tach", "hours": 100, "calendar": null }
  { "clock": "calendar", "hours": null, "months": 12 }
  { "clock": "combined", "hours": 100, "months": 12, "mode": "whichever_first" }
  { "clock": "airframe", "hours": 50 }
  { "clock": "engine", "hours": 50 }
  ```
- **Clock enum:** `hobbs | tach | airframe | engine | calendar | combined`. `combined` means "whichever is sooner." Each clock's `now` value is read from the Phase 2 `aircraft_current_totals` view (for airframe/engine) or from the most recent `flight_log_entry` (for hobbs/tach).
- **Next due derivation:** a `maintenance_next_due(item_id) returns record(next_due_at timestamptz, next_due_hours numeric, status maintenance_item_status)` SQL function reads the item + current aircraft totals + last*completed*\* and computes the next due point. Surface via the generated columns or a `maintenance_item_status` view.
- **Status enum:** `current` (not due), `due_soon` (within warning window — configurable per kind, default 10hr / 30 days), `overdue` (past limit — would auto-ground), `grounding` (past limit AND currently grounding the aircraft — i.e. not eligible for §91.409 overrun).
- Audit trigger attached. Hard-delete blocker attached (CAMP data is retention-critical). RLS on school_id + base_id.

### Airworthiness Directives (MNT-07)

- **`airworthiness_directive` table** (catalog of ADs): `id`, `school_id` (nullable — null = global catalog, non-null = school-custom override), `ad_number` (e.g. `2021-15-03`), `title`, `summary markdown`, `effective_date`, `compliance_method`, `applicability jsonb`, `superseded_by_ad_id` (nullable FK), `created_at`, `created_by`.
- **`applicability jsonb` shape:** rules that match an aircraft/engine/prop. Initial shape:
  ```json
  {
    "aircraft_make": "Cessna",
    "aircraft_model": "172",
    "year_range": [1968, 2005],
    "serial_range": ["17250001", "17299999"],
    "engine_make": null,
    "engine_model": null,
    "prop_make": null,
    "prop_model": null
  }
  ```
  All fields optional — missing means "any."
- **`aircraft_ad_compliance` join** (per-aircraft compliance state): `id`, `school_id`, `base_id`, `aircraft_id`, `ad_id`, `applicable` (boolean — result of applicability check at the time; admin can manually override), `first_due_at`, `first_due_hours`, `recurrence_rule jsonb` (some ADs are one-time, some are recurring — same shape as maintenance_item.interval_rule), `status` (`not_applicable | current | due_soon | overdue | grounding`), `notes`, audit columns.
- **`ad_compliance_history`** rows: one per compliance event. `id`, `compliance_record_id`, `complied_at`, `complied_at_hours jsonb`, `method_used`, `work_order_id` (FK, nullable), `signer_snapshot jsonb` (see sign-off snapshot section), `notes`.
- **Applicability check:** when an aircraft is created or its make/model/engine/prop changes, run `apply_ads_to_aircraft(aircraft_id)` which loops the AD catalog, evaluates applicability, and inserts `aircraft_ad_compliance` rows for any new matches. Admin can toggle `applicable=false` with reason.
- **Manual entry in v1.** No FAA feed. Admin posts an AD once, applies to fleet once, done.
- **ADs bridge into maintenance_items:** each `aircraft_ad_compliance` row creates a corresponding `maintenance_item` row with `kind='airworthiness_directive'` and `ad_compliance_id` FK set, so the unified "what's due?" queries don't need two code paths. Trigger keeps them in sync.

### Component life limits (MNT-06)

- **`aircraft_component` table:** `id`, `school_id`, `base_id`, `aircraft_id`, `engine_id` (nullable — component may be attached to an engine rather than directly to the airframe), `kind` enum (`magneto | prop | vacuum_pump | alternator | elt | elt_battery | starter | mag_points | spark_plug | custom`), `serial_number`, `part_number`, `manufacturer`, `installed_at_hours jsonb` (`{"airframe": 4500.0, "engine_1": 1200.0}`), `installed_at_date`, `life_limit_hours` (nullable — null means calendar-only), `life_limit_months` (nullable), `overhaul_interval_hours`, `last_overhaul_at_hours`, `removed_at` (nullable — when null, component is installed), `removed_reason`, audit columns.
- **Current life remaining:** computed by a SQL function `component_life_remaining(component_id) returns record(hours_remaining numeric, days_remaining int, status component_status)`. Reads current aircraft/engine totals from `aircraft_current_totals`.
- **Component bridges into maintenance_item:** a trigger creates a `maintenance_item` row with `kind='component_life'` and `component_id` FK whenever a component with non-null life limit is installed. Due is computed from the component's limits.
- **Overhaul vs replacement:** overhauling a component (mag point, vacuum pump) creates a new `aircraft_component_overhaul` event row — component stays the same, life clock resets.
- **Removal:** setting `removed_at` closes the component. Its bridged `maintenance_item` row is soft-deleted via trigger.

### Auto-ground + §91.409 10-hour overrun (MNT-03, FLT-04)

- **Hard ground.** When any `maintenance_item` crosses its limit AND is not eligible for overrun (non-overfly items like ADs, some component-life), the row's trigger sets `aircraft.grounded_at = now()` and `aircraft.grounded_reason = 'Maintenance: <item title> overdue'`. A sibling column `aircraft.grounded_by_item_id` points back to the causing item.
- **Grounding triggered by:** (a) time/hours passing — evaluated on every `flight_log_entry` insert via a trigger that re-runs `maintenance_next_due` and updates statuses, AND on a scheduled check the dispatch screen fires (via tRPC query polling, not a cron); (b) squawk with severity='grounding' being opened (already handled from Phase 3, re-verified here); (c) AD compliance moving to 'overdue'; (d) component life hitting zero.
- **is_airworthy_at real implementation:** replace the Phase 3 stub body. Returns false if ANY of:
  - `aircraft.grounded_at is not null AND aircraft.grounded_at <= at`
  - Any `aircraft_squawk` row with `severity='grounding'` AND `opened_at <= at` AND (`returned_to_service_at is null OR returned_to_service_at > at`)
  - Any `maintenance_item` where `status in ('overdue','grounding')` AND `last_completed_at <= at` — and there is no active overrun consuming it
  - Any `aircraft_ad_compliance` where `status in ('overdue','grounding')` AND `first_due_at <= at`
  - Any `aircraft_component` where `life_remaining(component) <= 0` at that time
- Signature unchanged so every Phase 3 caller keeps working. Phase 3 tests must still pass.
- **§91.409 10-hour overrun UI:** when an aircraft is grounded by a 100-hour inspection (and ONLY a 100-hour — §91.409(b) only permits 10-hour overrun on the 100-hour inspection to reach a place where the inspection can be done), and the current user has `mechanic_authority='ia'`, an "IA: Request §91.409 overrun" button appears on the aircraft profile. Clicking opens a modal with:
  - Justification text (required, min 20 chars)
  - Max hours (1-10, integer)
  - Confirms IA cert snapshot
- Submitting creates a `maintenance_overrun` row: `id`, `school_id`, `base_id`, `aircraft_id`, `item_id`, `authority_cfr_cite` ('§91.409(b)'), `justification`, `max_additional_hours`, `granted_at`, `granted_by_user_id`, `signer_snapshot jsonb`, `consumed_hours` (updated on every flight), `expires_at` (calendar hard limit — 10 days from grant default, configurable), `revoked_at` (nullable).
- **`is_airworthy_at` respects active overruns:** if a grounding was caused by the 100-hour inspection AND there's an unexpired, unconsumed `maintenance_overrun` row, the function returns `true` — but only for up to `max_additional_hours` more Hobbs. When `consumed_hours >= max_additional_hours`, the overrun auto-revokes and the aircraft re-grounds.
- **Overrun is once-only per compliance cycle:** a DB constraint prevents creating a second overrun on the same maintenance_item until that item is completed and a new compliance cycle starts.
- **All overrun events** logged in audit_log via trigger and displayed prominently on the aircraft profile with a red countdown banner.

### Squawk lifecycle (MNT-04, MNT-05)

- **Five states** added to the Phase 3 `aircraft_squawk` table: extend existing enum from `open | in_work | resolved` to `open | triaged | deferred | in_work | fixed | returned_to_service`. Migration `ALTER TYPE squawk_status ADD VALUE ...` in a separate migration file per the Phase 2 enum caveat.
- **Transitions:**
  - `open` → `triaged` (mechanic reviews, adds severity if not set, decides deferred vs in_work)
  - `triaged` → `deferred` (MEL-style — aircraft can fly with it; requires deferral justification + mechanic sign-off, goes in a `mel_deferrals` panel on the aircraft profile)
  - `triaged` → `in_work` (work order created, aircraft usually grounded if severity='grounding')
  - `deferred` → `in_work` (deferred item finally being fixed)
  - `in_work` → `fixed` (mechanic records work done)
  - `fixed` → `returned_to_service` (A&P or IA signs with cert snapshot; this is the moment the ground clears)
  - Any state → `cancelled` (duplicate, not-an-issue — requires reason)
- **Grounding severity** (already from Phase 3) still auto-grounds the aircraft on `open` + `severity='grounding'`. Aircraft un-grounds when ALL grounding squawks reach `returned_to_service`.
- **`aircraft_squawk` extended columns:** `triaged_at`, `triaged_by`, `deferred_until` (nullable date), `deferral_justification`, `work_order_id` (nullable FK), `returned_to_service_at`, `returned_to_service_signer_snapshot jsonb`.
- **Anyone opens, mechanics triage/sign.** Students + instructors can open squawks (already from Phase 3 close-out form). Only `mechanic_authority in ('a_and_p','ia')` can triage and sign return-to-service.

### Work orders (MNT-09)

- **`work_order` table:** `id`, `school_id`, `base_id`, `aircraft_id`, `status` enum (`draft | open | in_progress | pending_signoff | closed | cancelled`), `kind` enum (`annual | 100_hour | ad_compliance | squawk_repair | component_replacement | oil_change | custom`), `title`, `description`, `created_at`, `created_by`, `assigned_to_user_id` (mechanic), `source_squawk_id` (nullable), `source_maintenance_item_id` (nullable), `started_at`, `completed_at`, `signed_off_at`, `signed_off_by`, `signer_snapshot jsonb`, `return_to_service_time jsonb` (hobbs/tach/airframe at sign-off), `deleted_at`, audit columns.
- **`work_order_task` table:** `id`, `work_order_id`, `position`, `description`, `required_authority` enum (`a_and_p | ia`), `completed_at`, `completed_by_user_id`, `completion_signer_snapshot jsonb`, `notes`.
- **`work_order_part_consumption`** table: `id`, `work_order_id`, `part_id`, `part_lot_id` (nullable), `quantity`, `consumed_at`, `consumed_by`.
- **Required authority by task type:** `annual_inspection` tasks REQUIRE IA. `100_hour_inspection` tasks accept A&P or IA. `ad_compliance` tasks vary by the AD's compliance_method (some require IA, most accept A&P). `squawk_repair` accepts A&P. `component_replacement` accepts A&P. This mapping lives in `domain/maintenance.ts`.
- **Sign-off ceremony:** to transition `pending_signoff → closed`, the signer (a user whose `mechanic_authority` matches the highest task requirement in the WO) clicks "Sign off and return to service" which:
  - Captures their identity snapshot
  - Writes one logbook entry per applicable book (airframe / engine(s) / prop) via a `logbook_entry` table
  - Updates the source `maintenance_item.last_completed_*` OR `aircraft_ad_compliance` OR `aircraft_component` depending on the source
  - Unlocks the aircraft if this was the last grounding item (`aircraft.grounded_at = null`)
  - Emits audit entries
- **Parts consumption** decrements `part.on_hand_qty` (atomic, transaction-scoped) and, for lot-tracked parts, decrements `part_lot.qty_remaining`. If lot-tracked and no lot specified, the mutation fails with a helpful error.
- **Can't hard-delete.** Work orders use soft-delete. Only `draft` status can be hard-deleted (by creator, before any tasks are completed).

### Parts inventory (MNT-08)

- **`part` table:** `id`, `school_id`, `base_id`, `part_number`, `description`, `manufacturer`, `kind` enum (`consumable | overhaul_item | life_limited | hardware`), `unit` (`each | qt | gal | ft | oz | lb`), `on_hand_qty numeric`, `min_reorder_qty numeric` (nullable), `preferred_supplier`, `notes`, `deleted_at`, audit columns.
- **`part_lot` table:** `id`, `part_id`, `lot_number`, `serial_number` (nullable — for individual-serial items), `received_at`, `received_by`, `received_qty`, `qty_remaining`, `expires_at` (nullable — for shelf-life items), `supplier`, `invoice_ref`, `notes`, `deleted_at`.
- **UI:** `/admin/parts` table + detail page. `/admin/parts/[id]` shows lots + consumption history.
- **On-hand computation:** for non-lot parts, read `part.on_hand_qty` directly. For lot-tracked, `sum(part_lot.qty_remaining)` is authoritative and `part.on_hand_qty` is kept in sync by trigger.
- **No purchase orders, no reordering automation in v1.** Admin enters received lots manually.

### Signer snapshot contract

Any time a mechanic signs a record (squawk return-to-service, work order closure, AD compliance, 91.409 overrun grant, logbook entry), a `signer_snapshot jsonb` is captured:

```json
{
  "user_id": "584890de-...",
  "full_name": "Jane Q. Mechanic",
  "certificate_type": "ia",
  "certificate_number": "3001234567",
  "signed_at": "2026-04-08T14:32:10Z"
}
```

- **Copied, not referenced.** These fields exist on the user's person_profile but are COPIED into the snapshot at sign-time. Changing the user's cert number later does NOT retroactively change old signatures. This is the integrity contract for FAA inspection.
- **Source:** a server-side helper `buildSignerSnapshot(userId, requiredAuthority)` runs at sign time, validates `mechanic_authority >= requiredAuthority`, pulls `person_profile.first_name/last_name/faa_airman_cert_number` + `users.mechanic_authority`, and returns the snapshot. Refuses if user lacks required authority.

### Digital logbook PDF (MNT-10)

- **Three separate PDFs per aircraft:** airframe, engine (one per engine for ME), prop. Matches physical logbook structure.
- **`logbook_entry` table:** `id`, `school_id`, `base_id`, `aircraft_id`, `engine_id` (nullable — present for engine book), `book_kind` enum (`airframe | engine | prop`), `entry_date`, `hobbs`, `tach`, `airframe_time`, `engine_time` (nullable), `description markdown`, `work_order_id` (nullable FK), `maintenance_item_id` (nullable FK), `signer_snapshot jsonb`, `created_at`, `created_by_user_id` (who typed it, may differ from signer for draft flow), `signed_at`, `sealed` (boolean — true = finalized, immutable).
- **Append-only contract:** once `sealed = true`, the row cannot be UPDATEd (enforced by trigger). Corrections are new entries that reference the original via `corrects_entry_id`.
- **Auto-generation:** closing a work order auto-creates a logbook entry per applicable book. Admin can also manually add entries (e.g. for pre-system history import).
- **PDF export:** `/admin/aircraft/[id]/logbook/[book]/export.pdf` route generates the PDF server-side. Renders:
  - Header: aircraft tail, make/model/year/serial, book type
  - Table: date, description, Hobbs/tach/airframe time, signer name + cert type + cert number
  - Footer: generated-at timestamp, page numbering, "This export is a true copy of entries sealed on the dates shown"
- **Library choice:** server-side PDF via `@react-pdf/renderer` (React-based, Next.js compatible) or `pdfkit` (streams). Planner picks — research should recommend.
- **Retention:** logbook entries are retained forever (audit contract). Soft-delete forbidden.

### Downtime prediction (MNT-11)

- **Rule-based forecast, no ML.** SQL function `aircraft_next_grounding_forecast(aircraft_id) returns record(next_event_at timestamptz, next_event_hours numeric, reason text, confidence text)`:
  1. Query all `maintenance_item` for the aircraft with status in ('current', 'due_soon')
  2. Query all `aircraft_ad_compliance` with status in ('current', 'due_soon')
  3. Query all `aircraft_component` with life remaining > 0
  4. For each: compute "hours from now until due" using the aircraft's forward reservation schedule (sum of upcoming `reservation` Hobbs estimates from the next 90 days) plus calendar due date
  5. Pick the EARLIEST (shortest time or lowest hours)
  6. Add mean squawk-repair duration for this aircraft (rolling 90 days) as a downtime buffer
  7. Return the first triggering item + the projected date
- **Confidence levels:** `high` (known fixed-interval item), `medium` (estimated from schedule), `low` (historical-squawk-based).
- **Surfaces on:**
  - Aircraft profile: "Next grounding: ~14 days (100-hour @ 4617.5 hrs)"
  - Admin dashboard fleet panel: sorted list of aircraft by soonest grounding
- **Updated on:** every `flight_log_entry` insert (via trigger calling a refresh function), every `maintenance_item` completion, every new `reservation` affecting hours. Cached in a `aircraft_downtime_forecast` table that the view reads from — avoids re-computing on every page load.

### Maintenance item templates

- **`maintenance_item_template` table:** catalog of reusable item bundles. Columns: `id`, `school_id` (nullable — null = system template), `name` (e.g. "Cessna 172 for-hire standard"), `aircraft_make`, `aircraft_model_pattern`, `description`.
- **`maintenance_item_template_line`**: the individual items in the template. Columns: `id`, `template_id`, `kind`, `title`, `interval_rule jsonb`, `required_authority`, `default_warning_days`.
- **Seed system templates** in migration 0012 (Phase 4 migrations start at 0010):
  - C172 for-hire standard (annual, 100hr, ELT 91.207, transponder 91.413, pitot-static 91.411 IFR, oil 50hr, VOR 30-day IFR)
  - C152 standard (similar, no pitot-static)
  - PA-28 standard
  - Generic single-engine (minimal: annual + ELT)
- **`/admin/aircraft/new` extension:** after creation, if an applicable template exists, prompt "Apply template 'C172 for-hire standard' — creates X maintenance items?" Admin can accept, skip, or pick a different template. If accepted, copies template lines into `maintenance_item` rows with this aircraft_id.
- Admin can edit intervals on the aircraft's copy without affecting the template — the copy is detached once created.
- **School-custom templates:** admins can create their own templates in `/admin/maintenance-templates` for fleet-wide patterns they reuse.

### Admin UI pages

- `/admin/maintenance` — cross-fleet dashboard: "everything coming due in 30 days," sortable by aircraft + due date
- `/admin/aircraft/[id]/maintenance` — per-aircraft tab showing all maintenance_items + ADs + components, grouped by status
- `/admin/aircraft/[id]/logbook/[book]` — per-book logbook view (airframe / engine / prop), with an "Export PDF" button
- `/admin/squawks` — fleet-wide squawk board (open / triaged / in_work / deferred), filterable
- `/admin/squawks/[id]` — squawk detail with triage actions, work order link, return-to-service
- `/admin/work-orders` — list of work orders, filterable by status/aircraft/assigned
- `/admin/work-orders/[id]` — work order detail with tasks, parts, sign-off
- `/admin/ads` — AD catalog + "Apply to fleet" button
- `/admin/ads/[id]` — AD detail + per-aircraft compliance grid
- `/admin/parts` — parts inventory list
- `/admin/parts/[id]` — part detail + lots + consumption history
- `/admin/maintenance-templates` — template manager

All gated by `mechanicOrAdminProcedure` server-side (except templates/catalog which are admin-only).

### Role extensions

- **New composed procedure:** `mechanicOrAdminProcedure` — requires `active_role in ('mechanic','admin')`. Many CAMP actions need it. Place in `packages/api/src/procedures.ts`.
- **Mechanic-authority gating:** within procedures that require a specific `mechanic_authority`, use a helper `requireMechanicAuthority(ctx, 'ia')` that throws if the active user's mechanic_authority is insufficient.

### Banned-term caveat

- `maintenance_item.kind` values like `'annual_inspection'` are internal data — fine.
- Display labels must NOT use any banned term. Acknowledged risk: FAA docs use "approved" constantly (e.g. "approved parts"). Source-code strings must use "authorized" or "compliant." User-entered text in `maintenance_item.description` or `work_order.notes` is user data, not source code, so it's exempt from the banned-term lint.
- Add `maintenanceKindLabels.ts` to `packages/domain/src/schemas/` (outside the lint glob) for display strings.

### Claude's Discretion

- Exact library for PDF generation (@react-pdf/renderer vs pdfkit — research should recommend based on Next.js App Router compatibility)
- Color palette for status chips on the maintenance dashboard
- Exact JSONB schema validation approach for interval_rule / applicability (zod discriminated union recommended)
- Pagination strategy on `/admin/squawks` and `/admin/work-orders` (cursor recommended given potential volume)
- Whether `aircraft_downtime_forecast` refresh runs as a Postgres trigger or a tRPC server-side job (trigger recommended for determinism)
- How to show deferred MEL items on the dispatch screen (small yellow badge recommended)
- Whether to add an "import CSV" helper for parts inventory (defer to v2)
- Rich text editing in squawk descriptions (plain textarea fine for v1)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets (from Phases 1 + 2 + 3)

- **`packages/db/src/schema/aircraft.ts`** — add `grounded_reason text nullable` and `grounded_by_item_id uuid nullable FK` columns to the existing aircraft table
- **`packages/db/src/schema/flight_log.ts`** — already has paired flight_out/flight_in. Phase 4 reads from `aircraft_current_totals` view
- **`packages/db/src/schema/personnel.ts` (or wherever users/person_profile live)** — `mechanic_authority` enum already exists. Phase 4 uses it in every signer snapshot
- **Phase 3 `aircraft_squawk`** — extend status enum via ALTER TYPE in a new migration file (separate from any usage per Postgres enum caveat)
- **Phase 3 `is_airworthy_at(aircraft_id, ts)`** — REPLACE the function body in migration 0010 (or later). Keep signature. Phase 3 tests must continue to pass.
- **`withTenantTx` middleware** — every CAMP mutation runs through this. `app.school_id` and `app.base_id` GUCs set for RLS
- **`audit.attach('table')` + `fn_block_hard_delete` attach** — apply to every new CAMP table (maintenance_item, aircraft_ad_compliance, ad_compliance_history, work_order, work_order_task, work_order_part_consumption, logbook_entry, maintenance_overrun, aircraft_component, part, part_lot). Logbook entries additionally have a `sealed` flag + trigger forbidding UPDATE once sealed.
- **RLS pattern from Phase 1-3** — `auth.jwt() ->> 'school_id'` + `current_setting('app.base_id', true)` combined policies. `pgPolicy(... to: 'authenticated')` string literal (NOT sql`authenticated` — Phase 1 bug stays fixed).
- **Cross-tenant test harness** — every new CAMP table gets a test in `tests/rls/phase4-camp.test.ts`
- **tRPC pattern** — mirror Phase 3's `admin.squawks.ts` expansion + new routers for `admin.maintenance`, `admin.workOrders`, `admin.ads`, `admin.parts`, `admin.logbook`
- **`packages/domain/src/schemas/` banned-term workaround** — mirror `scheduleLabels.ts` pattern with a `maintenanceKindLabels.ts` file
- **`apps/web/app/(app)/admin/aircraft/[id]/` panel pattern** — add a new MaintenancePanel that drops into the existing detail page alongside EnginesPanel + RecentFlightsPanel
- **`packages/api/src/procedures.ts`** — add `mechanicOrAdminProcedure` composed procedure
- **Phase 3 `FlightLogEntryForm`** — close-out already creates squawks. Phase 4 extends the squawk form with severity + triage notes

### Established Patterns

- **Schema-first, RLS-first.** Every new table gets RLS + audit + hard-delete blocker + cross-tenant test in the same migration PR
- **Migration files hand-authored and mirrored to `supabase/migrations/`** — file number continuing from 0009 (last Phase 3 migration)
- **Postgres enum extension isolated** in its own migration file — can't USE a new enum value in the same transaction it's created in
- **Server-side enforcement first.** All CAMP writes go through `mechanicOrAdminProcedure` + `requireMechanicAuthority` helper. UI hiding is cosmetic
- **SQL functions over application code** for anything RLS-sensitive (is_airworthy_at, maintenance_next_due, component_life_remaining, aircraft_next_grounding_forecast). Keeps the policy surface in SQL where RLS can reason about it
- **Views that flow RLS through** use `WITH (security_invoker = true)`
- **Signer snapshots copied into JSONB** to preserve historical integrity
- **User-facing strings centralized** in `packages/domain/src/schemas/*Labels.ts` outside the banned-term lint glob

### Integration Points

- Phase 3 `is_airworthy_at` is REPLACED in-place. Every Phase 3 call site keeps working
- Phase 3 dispatch screen's airworthiness gate automatically upgrades from stub to real rules
- Phase 3 close-out form's "squawks observed" panel feeds the full Phase 4 squawk lifecycle
- Phase 3 `aircraft_current_totals` view is the source of truth for "current hours" in every Phase 4 calculation
- Phase 2 `FlightLogEntryForm` already emits Hobbs/tach/airframe updates — Phase 4 triggers fire off those inserts to refresh `aircraft_downtime_forecast`
- Phase 5 syllabus (next phase) will surface medicals on the student side the same way Phase 4 surfaces ADs on the aircraft side — consistent mental model
- Phase 7 ADS-B will read `aircraft.grounded_at` to distinguish downlink-silent from grounded on the map

</code_context>

<specifics>
## Specific Ideas

- The maintenance dashboard should feel like a pilot's cockpit preflight — critical items big and red, secondary items small and green, nothing hidden
- The return-to-service ceremony should feel ceremonial — a signature moment, not a casual button click. Big "Sign and return to service" button, cert number confirmation, explicit "this is legally binding" language
- The §91.409 overrun modal should look and feel cautious — orange banner, "This overrides the airworthiness gate" warning, countdown prominently displayed after grant
- MEL (deferred squawk) items should surface on dispatch with a yellow badge so pilots are aware before takeoff — not a block, just a reminder
- Logbook PDFs should be printable (ink-friendly, narrow margins) and also look right on screen. Include aircraft reg + total times at the top of every page
- Every grounding event should be explicit on the aircraft profile with a red banner naming the cause

</specifics>

<deferred>
## Deferred Ideas

- **Automated FAA AD feed ingestion** — v2 (manual entry is fine for v1)
- **Parts purchasing / PO workflow / reorder automation** — v2
- **Mechanic labor tracking / hours billing** — explicitly out of scope per PROJECT.md
- **Barcode scanning for parts** — v2
- **Maintenance item import from existing CAMP software (Aircraft Flight Maintenance Log, EBIS, etc.)** — v2
- **Photo attachments on squawks** — v2 (reuse Phase 1 documents flow)
- **Squawk comments/discussion thread** — v2
- **Auto-order parts when below reorder threshold** — v2
- **ML-based downtime prediction** — v2
- **Pilot-reported maintenance from mobile app** — mobile is v2
- **Inspection deferral approval workflow (chief instructor authorizes)** — v2
- **Regulatory change log / AD alert emails** — Phase 8 (notifications) + v2 feed
- **Photo/video on work orders** — v2
- **CAMP audit report for FAA surveillance** — v2

</deferred>

---

_Phase: 04-camp-maintenance_
_Context gathered: 2026-04-08_
