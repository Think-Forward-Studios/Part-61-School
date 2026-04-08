-- Phase 4 migration (part 1 of 2): CAMP enums.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000002_phase4_enums.sql.
--
-- This file ONLY creates / extends enum types. No tables, no columns,
-- no triggers — because Postgres forbids referencing a newly-added enum
-- value in the SAME transaction it was added in (the same caveat we
-- already worked around in Phase 3 split 0007/0008). Migration 0010
-- creates the tables that USE these values.

-- ============================================================================
-- 1. New enums (Phase 4 CAMP)
-- ============================================================================

create type public.maintenance_item_kind as enum (
  'annual_inspection',
  'hundred_hour_inspection',
  'airworthiness_directive',
  'oil_change',
  'transponder_91_413',
  'pitot_static_91_411',
  'elt_battery',
  'elt_91_207',
  'vor_check',
  'component_life',
  'manufacturer_service_bulletin',
  'custom'
);

create type public.maintenance_item_status as enum (
  'current',
  'due_soon',
  'overdue',
  'grounding'
);

create type public.maintenance_item_clock as enum (
  'hobbs',
  'tach',
  'airframe',
  'engine',
  'calendar',
  'combined'
);

-- mechanic_authority_kind already exists as `mechanic_authority` (Phase 1
-- enum, values 'none','a_and_p','ia'). We do NOT recreate it here. Plan
-- 04-01 references it directly in column types.

create type public.aircraft_component_kind as enum (
  'magneto',
  'prop',
  'vacuum_pump',
  'alternator',
  'elt',
  'elt_battery',
  'starter',
  'mag_points',
  'spark_plug',
  'custom'
);

create type public.component_status as enum (
  'current',
  'due_soon',
  'overdue',
  'grounding'
);

create type public.work_order_status as enum (
  'draft',
  'open',
  'in_progress',
  'pending_signoff',
  'closed',
  'cancelled'
);

create type public.work_order_kind as enum (
  'annual',
  '100_hour',
  'ad_compliance',
  'squawk_repair',
  'component_replacement',
  'oil_change',
  'custom'
);

create type public.ad_compliance_status as enum (
  'not_applicable',
  'current',
  'due_soon',
  'overdue',
  'grounding'
);

create type public.logbook_book_kind as enum (
  'airframe',
  'engine',
  'prop'
);

create type public.part_kind as enum (
  'consumable',
  'overhaul_item',
  'life_limited',
  'hardware'
);

create type public.part_unit as enum (
  'each',
  'qt',
  'gal',
  'ft',
  'oz',
  'lb'
);

-- ============================================================================
-- 2. Extend Phase 3 squawk_status enum
-- ============================================================================
-- Phase 3 only had ('open','in_work','resolved')-equivalent values? Actually
-- Phase 3 created `squawk_severity` but did NOT create a `squawk_status`
-- enum — the aircraft_squawk table tracked open/resolved via the
-- nullable resolved_at column. Phase 4 introduces an explicit
-- squawk_status enum (no Phase 3 enum to extend), so we CREATE it here.
create type public.squawk_status as enum (
  'open',
  'triaged',
  'deferred',
  'in_work',
  'fixed',
  'returned_to_service',
  'cancelled'
);
