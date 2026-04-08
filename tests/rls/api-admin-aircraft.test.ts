/**
 * admin/aircraft router integration test (FLT-01/05/06, ADM-05).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, seedTwoSchools, type SeedResult } from './harness';
import { adminCaller } from './api-caller';

let seed: SeedResult;

beforeAll(async () => {
  seed = await seedTwoSchools();
});

afterAll(async () => {
  await closeAdmin();
});

describe('admin.aircraft router', () => {
  let aircraftId: string;

  it('create inserts an aircraft in the active base', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const created = await caller.admin.aircraft.create({
      tailNumber: 'N-TEST1',
      make: 'Cessna',
      model: '172S',
      year: 2012,
    });
    expect(created.schoolId).toBe(seed.schoolA);
    expect(created.baseId).toBe(seed.baseA);
    aircraftId = created.id;
  });

  it('addEngine adds a single engine', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const engine = await caller.admin.aircraft.addEngine({
      aircraftId,
      position: 'single',
      serialNumber: 'SN-TEST',
    });
    expect(engine.aircraftId).toBe(aircraftId);
  });

  it('setEquipment replaces the tag set', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.aircraft.setEquipment({
      aircraftId,
      tags: ['ifr_equipped', 'glass_panel', 'g1000'],
    });
    expect(result.count).toBe(3);
    const detail = await caller.admin.aircraft.getById({ aircraftId });
    expect(detail.equipment.map((e) => e.tag).sort()).toEqual(
      ['g1000', 'glass_panel', 'ifr_equipped'],
    );
  });

  it('list returns the new aircraft', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const rows = await caller.admin.aircraft.list({ limit: 100, offset: 0 });
    expect(rows.some((r) => r.id === aircraftId)).toBe(true);
  });

  it('recentFlights returns empty for brand-new aircraft', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const rows = await caller.admin.aircraft.recentFlights({ aircraftId, limit: 25 });
    expect(rows).toEqual([]);
  });

  it('softDelete marks the aircraft deleted', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.aircraft.softDelete({ aircraftId });
    expect(result.ok).toBe(true);
  });
});
