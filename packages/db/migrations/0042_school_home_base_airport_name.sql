-- =============================================================================
-- Migration: 0042_school_home_base_airport_name.sql
-- =============================================================================
-- Adds public.schools.home_base_airport_name — the resolved display name
-- of the home airport (e.g. 'Birmingham-Shuttsworth Intl') so the top
-- header pill can show the name rather than the ICAO identifier that
-- schools.home_base_airport (migration 0041) stores.
--
-- The admin form's autocomplete populates both fields in a single save:
--   home_base_airport       → ICAO / ident ('KBHM')
--   home_base_airport_name  → full airport name
-- Legacy rows that only have the ICAO continue to work; the header
-- falls back: name → ICAO → legacy user_base.name.
-- =============================================================================

alter table public.schools
  add column if not exists home_base_airport_name text;
