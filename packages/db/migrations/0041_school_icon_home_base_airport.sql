-- =============================================================================
-- Migration: 0041_school_icon_home_base_airport.sql
-- =============================================================================
-- Adds two user-visible branding columns to public.schools:
--
--   * icon_url            — the school's logo. Stored as a data URL (image/png
--                           or image/jpeg, base64-encoded) so we don't need a
--                           separate storage bucket for a single admin-owned
--                           asset. Capped by the zod input at ~300 KB; anything
--                           larger is rejected client-side (the SchoolSettings
--                           form downscales to 256×256 before encoding).
--   * home_base_airport   — ICAO / display string of the airport the school
--                           operates from (e.g. 'KBHM'). Shown in the top
--                           header pill instead of the generic base name.
--
-- Both are nullable — existing schools continue to work without being forced
-- to fill them in.
-- =============================================================================

alter table public.schools
  add column if not exists icon_url text;

alter table public.schools
  add column if not exists home_base_airport text;
