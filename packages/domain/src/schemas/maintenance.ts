/**
 * Phase 4 shared TS types (enum mirrors).
 *
 * These mirror the pgEnum values in packages/db/src/schema/enums.ts.
 * They live here so the API layer and UI layer can refer to them
 * without importing drizzle.
 */

export type MaintenanceItemKind =
  | 'annual_inspection'
  | 'hundred_hour_inspection'
  | 'airworthiness_directive'
  | 'oil_change'
  | 'transponder_91_413'
  | 'pitot_static_91_411'
  | 'elt_battery'
  | 'elt_91_207'
  | 'vor_check'
  | 'component_life'
  | 'manufacturer_service_bulletin'
  | 'custom';

export type MaintenanceItemStatus = 'current' | 'due_soon' | 'overdue' | 'grounding';

export type MechanicAuthorityKind = 'none' | 'a_and_p' | 'ia';

export type LogbookBook = 'airframe' | 'engine' | 'prop';

export type WorkOrderStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'pending_signoff'
  | 'closed'
  | 'cancelled';

export type WorkOrderKind =
  | 'annual'
  | '100_hour'
  | 'ad_compliance'
  | 'squawk_repair'
  | 'component_replacement'
  | 'oil_change'
  | 'custom';

export type SquawkStatus =
  | 'open'
  | 'triaged'
  | 'deferred'
  | 'in_work'
  | 'fixed'
  | 'returned_to_service'
  | 'cancelled';

export type AircraftComponentKind =
  | 'magneto'
  | 'prop'
  | 'vacuum_pump'
  | 'alternator'
  | 'elt'
  | 'elt_battery'
  | 'starter'
  | 'mag_points'
  | 'spark_plug'
  | 'custom';
