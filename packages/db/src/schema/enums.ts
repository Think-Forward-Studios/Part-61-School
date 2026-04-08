import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Shared enums for the schema. Phase 1 introduced the first block;
 * Phase 2 extends two enums (role, document_kind) and adds ten new
 * ones covering personnel, fleet, and flight-log primitives.
 */

// AUTH-06 + PER-08: five-role system (rental_customer added in Phase 2)
export const roleEnum = pgEnum('role', [
  'student',
  'instructor',
  'mechanic',
  'admin',
  'rental_customer',
]);

// AUTH-07: mechanic sub-authority
export const mechanicAuthorityEnum = pgEnum('mechanic_authority', ['none', 'a_and_p', 'ia']);

// FND-01 + FLT-06: document kinds (aircraft_photo added in Phase 2)
export const documentKindEnum = pgEnum('document_kind', [
  'medical',
  'pilot_license',
  'government_id',
  'insurance',
  'aircraft_photo',
]);

// FND-03: audit action enum
export const auditActionEnum = pgEnum('audit_action', ['insert', 'update', 'soft_delete']);

// ============================================================================
// Phase 2 new enums
// ============================================================================

// PER-02: self-registration + account lifecycle status
export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'inactive', 'rejected']);

// PER-05/06: holds vs groundings share one table
export const holdKindEnum = pgEnum('hold_kind', ['hold', 'grounding']);

// IPF-01: instructor currency categories
export const currencyKindEnum = pgEnum('currency_kind', [
  'cfi',
  'cfii',
  'mei',
  'medical',
  'bfr',
  'ipc',
]);

// IPF-02: instructor qualification categories
export const qualificationKindEnum = pgEnum('qualification_kind', [
  'aircraft_type',
  'sim_authorization',
  'course_authorization',
]);

// FLT-02: flight log entry kind (append-only with baseline + correction)
// Phase 3 extends with `flight_out` / `flight_in` paired rows. The
// legacy `flight` kind stays as a deprecated alias so Phase 2 fixtures
// continue to work — see `aircraft_current_totals` view for the math.
export const flightLogEntryKindEnum = pgEnum('flight_log_entry_kind', [
  'flight',
  'baseline',
  'correction',
  'flight_out',
  'flight_in',
]);

// FLT-01: engine position labels (N1..N4 for >2-engine aircraft)
export const enginePositionEnum = pgEnum('engine_position', [
  'single',
  'left',
  'right',
  'center',
  'n1',
  'n2',
  'n3',
  'n4',
]);

// PER-01: FAA citizenship status (nullable in v1)
export const citizenshipStatusEnum = pgEnum('citizenship_status', [
  'us_citizen',
  'us_national',
  'foreign_national',
  'unknown',
]);

// PER-01: TSA AFSP status (nullable in v1)
export const tsaAfspStatusEnum = pgEnum('tsa_afsp_status', [
  'not_required',
  'pending',
  'approved',
  'expired',
]);

// PER-10: instructor experience snapshot source
export const experienceSourceEnum = pgEnum('experience_source', [
  'self_reported',
  'imported',
  'derived',
]);

// ============================================================================
// Phase 3 new enums (scheduling + dispatch)
// ============================================================================

// SCH-01: reservation activity types
export const reservationActivityTypeEnum = pgEnum('reservation_activity_type', [
  'flight',
  'simulator',
  'oral',
  'academic',
  'misc',
]);

// SCH-08: reservation lifecycle status
export const reservationStatusEnum = pgEnum('reservation_status', [
  'requested',
  'approved',
  'dispatched',
  'flown',
  'pending_sign_off',
  'closed',
  'cancelled',
  'no_show',
  'scrubbed',
]);

// SCH-09: cancellation / scrub close-out reasons
export const closeOutReasonEnum = pgEnum('close_out_reason', [
  'cancelled_free',
  'cancelled_late',
  'no_show',
  'scrubbed_weather',
  'scrubbed_maintenance',
  'scrubbed_other',
]);

// FLT-04: aircraft squawk severity
export const squawkSeverityEnum = pgEnum('squawk_severity', ['info', 'watch', 'grounding']);

// FTR-07: FIF notice severity
export const fifSeverityEnum = pgEnum('fif_severity', ['info', 'important', 'critical']);

// FTR-06: passenger manifest position
export const manifestPositionEnum = pgEnum('manifest_position', ['pic', 'sic', 'passenger']);

// SCH-16: schedule block kind
export const blockKindEnum = pgEnum('block_kind', [
  'instructor_block',
  'aircraft_block',
  'room_block',
  'combo',
]);

// SCH-15: personnel unavailability kind
export const unavailabilityKindEnum = pgEnum('unavailability_kind', [
  'vacation',
  'sick',
  'personal',
  'training',
  'other',
]);

// ============================================================================
// Phase 4 new enums (CAMP)
// ============================================================================

export const maintenanceItemKindEnum = pgEnum('maintenance_item_kind', [
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
  'custom',
]);

export const maintenanceItemStatusEnum = pgEnum('maintenance_item_status', [
  'current',
  'due_soon',
  'overdue',
  'grounding',
]);

export const maintenanceItemClockEnum = pgEnum('maintenance_item_clock', [
  'hobbs',
  'tach',
  'airframe',
  'engine',
  'calendar',
  'combined',
]);

export const aircraftComponentKindEnum = pgEnum('aircraft_component_kind', [
  'magneto',
  'prop',
  'vacuum_pump',
  'alternator',
  'elt',
  'elt_battery',
  'starter',
  'mag_points',
  'spark_plug',
  'custom',
]);

export const componentStatusEnum = pgEnum('component_status', [
  'current',
  'due_soon',
  'overdue',
  'grounding',
]);

export const workOrderStatusEnum = pgEnum('work_order_status', [
  'draft',
  'open',
  'in_progress',
  'pending_signoff',
  'closed',
  'cancelled',
]);

export const workOrderKindEnum = pgEnum('work_order_kind', [
  'annual',
  '100_hour',
  'ad_compliance',
  'squawk_repair',
  'component_replacement',
  'oil_change',
  'custom',
]);

export const adComplianceStatusEnum = pgEnum('ad_compliance_status', [
  'not_applicable',
  'current',
  'due_soon',
  'overdue',
  'grounding',
]);

export const logbookBookKindEnum = pgEnum('logbook_book_kind', ['airframe', 'engine', 'prop']);

export const partKindEnum = pgEnum('part_kind', [
  'consumable',
  'overhaul_item',
  'life_limited',
  'hardware',
]);

export const partUnitEnum = pgEnum('part_unit', ['each', 'qt', 'gal', 'ft', 'oz', 'lb']);

export const squawkStatusEnum = pgEnum('squawk_status', [
  'open',
  'triaged',
  'deferred',
  'in_work',
  'fixed',
  'returned_to_service',
  'cancelled',
]);

// FLT-05: aircraft equipment tag enum (locked list in CONTEXT)
export const aircraftEquipmentTagEnum = pgEnum('aircraft_equipment_tag', [
  'ifr_equipped',
  'complex',
  'high_performance',
  'glass_panel',
  'autopilot',
  'ads_b_out',
  'ads_b_in',
  'gtn_650',
  'gtn_750',
  'g1000',
  'g3x',
  'garmin_530',
  'kln_94',
  'tail_dragger',
  'retractable_gear',
]);
