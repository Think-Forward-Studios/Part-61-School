-- =============================================================================
-- Migration: 0045_aircraft_home_airport.sql
-- =============================================================================
-- Adds public.aircraft.home_airport — optional ICAO / display string for
-- the specific airfield this aircraft lives at. When null the UI falls
-- back to the school's home_base_airport (schools.home_base_airport,
-- migration 0041). When set it overrides for this single tail.
--
-- Aircraft still have base_id pointing at bases(id) for scheduling /
-- dispatch scoping — that's unchanged. This column is purely about
-- the human-readable airport identifier that gets surfaced in the
-- fleet list, flight-log exports, etc.
-- =============================================================================

alter table public.aircraft
  add column if not exists home_airport text;
