-- Phase 5 migration (part 2 of 5): extend currency_kind enum with student kinds.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000002_phase5_currency_kinds.sql.
--
-- MUST be a separate migration file from 0014 AND from 0016+ because
-- Postgres forbids using a newly-added enum value in the SAME transaction
-- that added it. Each migration runs in its own transaction in our
-- runner, so isolating the ADD VALUE statements in their own file is the
-- reliable pattern (mirrors Phase 3 0007/0008 + Phase 4 0009/0010 splits).
--
-- SYL-12: these kinds power the student currency dashboard, student
-- self-service training record, and the SCH-12 pre-approve currency check.

alter type public.currency_kind add value if not exists 'medical_class_1';
alter type public.currency_kind add value if not exists 'medical_class_2';
alter type public.currency_kind add value if not exists 'medical_class_3';
alter type public.currency_kind add value if not exists 'basicmed';
alter type public.currency_kind add value if not exists 'flight_review';
alter type public.currency_kind add value if not exists 'solo_endorsement_scope';
alter type public.currency_kind add value if not exists 'day_passenger_currency';
alter type public.currency_kind add value if not exists 'night_passenger_currency';
alter type public.currency_kind add value if not exists 'instrument_currency';
alter type public.currency_kind add value if not exists 'tailwheel_currency';
alter type public.currency_kind add value if not exists 'high_performance_currency';
alter type public.currency_kind add value if not exists 'complex_currency';
-- ipc already exists in Phase 2 enum; no duplicate add needed.
