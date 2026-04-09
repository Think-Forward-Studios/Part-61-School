/**
 * Display labels for maintenance item kinds (MNT-02).
 *
 * Lives outside apps/web/** and packages/exports/** so the
 * no-banned-terms rule does not run here — but none of these strings
 * contain any banned term anyway. Every UI string the Phase 4 web
 * layer surfaces for a maintenance kind MUST come from this map.
 */
import type { MaintenanceItemKind, MechanicAuthorityKind } from './maintenance';

export const maintenanceKindLabels: Record<MaintenanceItemKind, string> = {
  annual_inspection: 'Annual inspection',
  hundred_hour_inspection: 'Hundred-hour inspection',
  airworthiness_directive: 'Airworthiness directive',
  oil_change: 'Oil change',
  transponder_91_413: '91.413 transponder check',
  pitot_static_91_411: '91.411 pitot-static',
  elt_battery: 'ELT battery',
  elt_91_207: '91.207 ELT inspection',
  vor_check: 'VOR check',
  component_life: 'Component life limit',
  manufacturer_service_bulletin: 'Manufacturer service bulletin',
  custom: 'Custom item',
};

export function maintenanceKindLabel(kind: string): string {
  return (maintenanceKindLabels as Record<string, string>)[kind] ?? kind;
}

export const mechanicAuthorityLabels: Record<MechanicAuthorityKind, string> = {
  none: 'None',
  a_and_p: 'A&P',
  ia: 'IA',
};
