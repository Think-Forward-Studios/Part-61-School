/**
 * Map of maintenance_item_kind → set of logbooks touched when signed
 * off. Annual touches all three books; oil change touches engine only;
 * 100-hour touches airframe + engine. component_life is resolved at
 * call-site (needs the component.kind).
 */
import type {
  AircraftComponentKind,
  LogbookBook,
  MaintenanceItemKind,
} from '@part61/domain';

export function booksTouchedByTaskKinds(
  kinds: ReadonlyArray<MaintenanceItemKind>,
): Set<LogbookBook> {
  const out = new Set<LogbookBook>();
  for (const k of kinds) {
    switch (k) {
      case 'annual_inspection':
        out.add('airframe');
        out.add('engine');
        out.add('prop');
        break;
      case 'hundred_hour_inspection':
        out.add('airframe');
        out.add('engine');
        break;
      case 'oil_change':
        out.add('engine');
        break;
      case 'airworthiness_directive':
      case 'manufacturer_service_bulletin':
      case 'custom':
      case 'transponder_91_413':
      case 'pitot_static_91_411':
      case 'elt_battery':
      case 'elt_91_207':
      case 'vor_check':
      case 'component_life':
        out.add('airframe');
        break;
    }
  }
  return out;
}

export function bookForComponentKind(kind: AircraftComponentKind): LogbookBook {
  switch (kind) {
    case 'magneto':
    case 'vacuum_pump':
    case 'spark_plug':
    case 'mag_points':
      return 'engine';
    case 'prop':
      return 'prop';
    case 'alternator':
    case 'elt':
    case 'elt_battery':
    case 'starter':
    case 'custom':
    default:
      return 'airframe';
  }
}
