-- 0019_phase5_seed_endorsements.sql
-- Phase 5 Plan 02 — seed the AC 61-65K standard endorsement catalog.
--
-- Derived from Advisory Circular 61-65K (current revision; 61-65J is
-- cancelled). This is the canonical FAA-published endorsement language
-- every CFI in the US uses. Schools fork NOTHING here — the catalog is
-- global and read-only to tenants (SELECT-only RLS on endorsement_template;
-- writes only through the migration path).
--
-- The literal FAA text in `title` and `body_template` contains terms that
-- the `part61/no-banned-terms` ESLint rule flags in .ts/.tsx source files
-- ("approved"). That rule deliberately does NOT scan .sql — canonical
-- regulatory text is data, not source code. Do NOT copy these strings
-- into TypeScript files: keep them in the database and fetch at runtime.
--
-- Placeholder tokens in `body_template` are double-curly handlebars that
-- the `student_endorsement` rendering step substitutes at sign time:
--   {{student_name}}           {{instructor_name}}
--   {{student_cert_number}}    {{instructor_cfi_number}}
--   {{aircraft_make_model}}    {{instructor_cfi_expiration}}
--   {{date}}
--
-- NOTE on re-seed: endorsement_template has NO foreign key to
-- public.schools, so `TRUNCATE public.schools CASCADE` in supabase/seed.sql
-- does not touch this table. These rows survive `supabase db reset`
-- without any re-seed block in seed.sql — see that file for a comment.

begin;

insert into public.endorsement_template (code, title, body_template, category, ac_reference) values

-- ============================================================================
-- Appendix A — Student pilot / solo endorsements
-- ============================================================================

('A.1',
 'Pre-solo aeronautical knowledge test — §61.87(b)',
 E'I certify that {{student_name}} has satisfactorily completed the pre-solo knowledge test of §61.87(b) for the {{aircraft_make_model}}.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'student_pilot', 'AC 61-65K, A.1'),

('A.2',
 'Pre-solo flight training — §61.87(c)(1) and (2)',
 E'I certify that {{student_name}} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the {{aircraft_make_model}}. I have determined that {{student_name}} has demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by §61.87 in this or similar make and model of aircraft to be flown.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'student_pilot', 'AC 61-65K, A.2'),

('A.3',
 'Solo flight (first 90-calendar-day period) — §61.87(n)',
 E'I certify that {{student_name}} has received the required training to qualify for solo flying. I have determined he/she meets the applicable requirements of §61.87(n) and is proficient to make solo flights in the {{aircraft_make_model}}.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, A.3'),

('A.4',
 'Solo takeoffs and landings at another airport — §61.93(b)(1)',
 E'I certify that {{student_name}} has received the required training of §61.93(b)(1). I have determined that he/she is proficient to practice solo takeoffs and landings at [airport name]. The takeoffs and landings at [airport name] are subject to the following conditions: [conditions].\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, A.4'),

('A.5',
 'Initial solo cross-country flight — §61.93(c)(1) and (2)',
 E'I certify that {{student_name}} has received the required solo cross-country training. I find he/she has met the applicable requirements of §61.93, and is proficient to make solo cross-country flights in the {{aircraft_make_model}}.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'xc', 'AC 61-65K, A.5'),

('A.6',
 'Solo cross-country flight (each flight) — §61.93(c)(3)',
 E'I have reviewed the cross-country planning of {{student_name}}. I find the planning and preparation to be correct to make the solo flight from [origin] to [destination] via [route] on [date] in the {{aircraft_make_model}}. [List any conditions/limitations.]\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'xc', 'AC 61-65K, A.6'),

('A.7',
 'Repeated solo cross-country flights not more than 50 NM from the point of departure — §61.93(b)(2)',
 E'I certify that {{student_name}} has received the required training in both directions between and at both [airport names]. I have determined that he/she is proficient of §61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: [conditions].\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'xc', 'AC 61-65K, A.7'),

('A.8',
 'Solo flight in Class B airspace — §61.95(a)',
 E'I certify that {{student_name}} has received the required training of §61.95(a). I have determined he/she is proficient to conduct solo flights in [name of Class B] airspace. [List any applicable conditions or limitations.]\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, A.8'),

('A.9',
 'Solo flight to, from, or at an airport located within Class B airspace — §61.95(b) and §91.131(b)(1)',
 E'I certify that {{student_name}} has received the required training of §61.95(b)(1). I have determined that he/she is proficient to conduct solo flight operations at [name of airport in Class B].\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, A.9'),

-- ============================================================================
-- Appendix B — Additional endorsements
-- ============================================================================

('B.1',
 'Completion of a flight review — §61.56(a) and (c)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has satisfactorily completed a flight review of §61.56(a) on {{date}}.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'flight_review', 'AC 61-65K, B.1'),

('B.2',
 'Completion of an instrument proficiency check — §61.57(d)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has satisfactorily completed the instrument proficiency check of §61.57(d) in the {{aircraft_make_model}} on {{date}}.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'ipc', 'AC 61-65K, B.2'),

('B.3',
 'To act as pilot in command in a complex airplane — §61.31(e)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training of §61.31(e) in a {{aircraft_make_model}} (complex airplane). I have determined that he/she is proficient in the operation and systems of a complex airplane.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'aircraft_class_rating', 'AC 61-65K, B.3'),

('B.4',
 'To act as pilot in command in a high-performance airplane — §61.31(f)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training of §61.31(f) in a {{aircraft_make_model}} (high-performance airplane). I have determined that he/she is proficient in the operation and systems of a high-performance airplane.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'aircraft_class_rating', 'AC 61-65K, B.4'),

('B.5',
 'To act as pilot in command of a pressurized aircraft capable of operating above 25,000 feet MSL — §61.31(g)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training of §61.31(g) in a {{aircraft_make_model}}. I have determined that he/she is proficient in the operation of a pressurized aircraft.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'aircraft_class_rating', 'AC 61-65K, B.5'),

('B.6',
 'To act as pilot in command in a tailwheel airplane — §61.31(i)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training of §61.31(i) in a {{aircraft_make_model}} (tailwheel airplane). I have determined that he/she is proficient in the operation of a tailwheel airplane.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'aircraft_class_rating', 'AC 61-65K, B.6'),

('B.7',
 'Retesting after failure of a knowledge or practical test — §61.49',
 E'I certify that {{student_name}} has received the additional training as required by §61.49 and has been found competent to pass the [knowledge/practical] test.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'other', 'AC 61-65K, B.7'),

('B.8',
 'Completion of prerequisites for a practical test — §61.39(a)(6)(i) and (ii)',
 E'I certify that {{student_name}} has received and logged training time within 2 calendar-months preceding the month of application in preparation for the practical test and is prepared for the required practical test for the issuance of the [certificate/rating] sought.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'practical_test', 'AC 61-65K, B.8'),

('B.9',
 'Aeronautical knowledge test recommendation — §61.35(a)(1), §61.103(d), and §61.105',
 E'I certify that {{student_name}} has received the required training of §61.105. I have determined that he/she is prepared for the [name of] knowledge test.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'knowledge_test', 'AC 61-65K, B.9'),

('B.10',
 'Practical test recommendation — §61.103(f), §61.107(b), and §61.109',
 E'I certify that {{student_name}} has received the required training of §61.107 and §61.109. I have determined he/she is prepared for the [name of] practical test.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'practical_test', 'AC 61-65K, B.10'),

('B.11',
 'Launch procedures for a glider towing operation — §61.69(a)(2) and (c)(2)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training of §61.69(a) or (c). I have determined he/she is proficient in towing gliders or unpowered ultralight vehicles.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'other', 'AC 61-65K, B.11'),

-- A couple of frequently-used extras from AC 61-65K Appendix A/B continuation
-- that every Part 61 school needs in practice:

('A.10',
 'Solo takeoffs and landings at an airport within Class B airspace — §61.95(a)(1)',
 E'I certify that {{student_name}} has received the required training of §61.95(a)(1). I have determined he/she is proficient to conduct solo takeoffs and landings at [airport name] located in [name of Class B] airspace.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, A.10'),

('B.12',
 'To act as pilot in command of an aircraft in solo operations (sport pilot) — §61.31(d)(2)',
 E'I certify that {{student_name}}, holder of pilot certificate {{student_cert_number}}, has received the required training to serve as pilot in command in a {{aircraft_make_model}}. I have determined that he/she is prepared to solo that make and model of aircraft.\n\n/s/ {{instructor_name}}    {{date}}    CFI No. {{instructor_cfi_number}}    Exp. {{instructor_cfi_expiration}}',
 'solo', 'AC 61-65K, B.12');

commit;
