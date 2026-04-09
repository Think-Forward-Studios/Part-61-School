-- Phase 5 migration (part 2 of 5): extend currency_kind enum with student kinds.
-- Mirror of packages/db/migrations/0015_phase5_currency_kinds.sql.

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
