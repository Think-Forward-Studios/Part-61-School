/**
 * Map maintenance_item_kind → required mechanic authority for work
 * order tasks and direct sign-off. IA is strictly higher than A&P —
 * an IA satisfies A&P requirements but not vice-versa.
 */
import type { MaintenanceItemKind } from '@part61/domain';
import type { RequiredMechanicAuthority } from './signerSnapshot';

export function taskKindRequiredAuthority(
  kind: MaintenanceItemKind,
): RequiredMechanicAuthority {
  switch (kind) {
    case 'annual_inspection':
      return 'ia';
    case 'hundred_hour_inspection':
    case 'oil_change':
    case 'airworthiness_directive':
    case 'component_life':
    case 'transponder_91_413':
    case 'pitot_static_91_411':
    case 'elt_battery':
    case 'elt_91_207':
    case 'vor_check':
    case 'manufacturer_service_bulletin':
    case 'custom':
    default:
      return 'a_and_p';
  }
}

export function highestAuthority(
  authorities: ReadonlyArray<RequiredMechanicAuthority>,
): RequiredMechanicAuthority {
  return authorities.some((a) => a === 'ia') ? 'ia' : 'a_and_p';
}
