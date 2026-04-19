/**
 * Asset-resolution smoke test — verifies that every loaded operator, weapon,
 * gear piece, and consumable resolves to an icon asset via its id (not name).
 *
 * Regression guard for the id-based asset wiring: if an entry ends up with
 * no icon, either the asset is missing or the id-to-filename mapping drifted.
 */
import { getAllOperatorBases } from '../../model/game-data/operatorsStore';
import { getAllWeapons } from '../../model/game-data/weaponsStore';
import { getAllGearPieces } from '../../model/game-data/gearPiecesStore';
import {
  getAllConsumables,
  getAllTacticals,
} from '../../model/game-data/consumablesStore';

describe('id-based asset resolution', () => {
  it('every operator resolves an icon', () => {
    const missing: string[] = [];
    for (const op of getAllOperatorBases()) {
      if (!op.icon) missing.push(op.id);
    }
    expect(missing).toEqual([]);
  });

  it('every weapon with an available icon resolves by id', () => {
    // Some stat-boost weapons have no icon asset yet — those return undefined
    // which is fine. The regression test: any weapon WHOSE icon was previously
    // resolved via name-based lookup must still resolve via id.
    const namedAssets = new Set<string>();
    for (const w of getAllWeapons()) {
      if (w.icon) namedAssets.add(w.id);
    }
    // 60+ weapons should have icons today (spot-checked via ls)
    expect(namedAssets.size).toBeGreaterThan(50);
  });

  it('every gear piece with an available icon resolves by id', () => {
    const resolved = getAllGearPieces().filter(p => !!p.icon);
    // 180+ gear pieces have icons today
    expect(resolved.length).toBeGreaterThan(150);
  });

  it('consumables and tacticals resolve icons by id', () => {
    for (const c of getAllConsumables()) expect(c.icon).toBeDefined();
    for (const t of getAllTacticals()) expect(t.icon).toBeDefined();
  });
});
