/**
 * Community sample loadouts.
 *
 * Generated dynamically from game data so they stay current when
 * operator stats, weapons, or gear pieces change.
 */

import { SheetData, serializeSheet } from '../utils/sheetStorage';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { DEFAULT_ENEMY } from '../utils/enemies';
import { EMPTY_LOADOUT, OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { DEFAULT_LOADOUT_PROPERTIES, getDefaultLoadoutProperties, LoadoutProperties } from '../view/InformationPane';
import { SLOT_IDS, INITIAL_VISIBLE } from './sheetDefaults';
import { getDefaultEnemyStats } from '../controller/appStateController';

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveOperator(id: string) {
  return ALL_OPERATORS.find((op) => op.id === id) ?? null;
}

function maxedProperties(op: { rarity: number; maxTalentOneLevel: number; maxTalentTwoLevel: number }): LoadoutProperties {
  return getDefaultLoadoutProperties(op);
}

function maxedPropertiesWithPotential(
  op: { rarity: number; maxTalentOneLevel: number; maxTalentTwoLevel: number },
  potential: number,
): LoadoutProperties {
  const base = maxedProperties(op);
  return { ...base, operator: { ...base.operator, potential } };
}

// ── Community loadout definitions ───────────────────────────────────────────

export interface CommunityLoadout {
  id: string;
  name: string;
}

export interface CommunityFolder {
  id: string;
  name: string;
  loadouts: CommunityLoadout[];
}

function buildSheetForOperators(
  opConfigs: {
    id: string;
    potential?: number;
    loadout?: Partial<OperatorLoadoutState>;
    weaponSkills?: { skill1Level?: number; skill2Level?: number; skill3Level?: number };
  }[],
): SheetData {
  const operatorIds: (string | null)[] = [null, null, null, null];
  const loadouts: Record<string, OperatorLoadoutState> = {};
  const loadoutProperties: Record<string, LoadoutProperties> = {};

  for (let i = 0; i < opConfigs.length && i < 4; i++) {
    const cfg = opConfigs[i];
    const op = resolveOperator(cfg.id);
    if (!op) continue;

    const slotId = SLOT_IDS[i];
    operatorIds[i] = cfg.id;
    loadouts[slotId] = { ...EMPTY_LOADOUT, ...cfg.loadout };

    const potential = cfg.potential ?? (op.rarity >= 6 ? 0 : 5);
    const props = maxedPropertiesWithPotential(op, potential);
    if (cfg.weaponSkills) {
      props.weapon = {
        ...props.weapon,
        ...(cfg.weaponSkills.skill1Level != null ? { skill1Level: cfg.weaponSkills.skill1Level } : {}),
        ...(cfg.weaponSkills.skill2Level != null ? { skill2Level: cfg.weaponSkills.skill2Level } : {}),
        ...(cfg.weaponSkills.skill3Level != null ? { skill3Level: cfg.weaponSkills.skill3Level } : {}),
      };
    }
    loadoutProperties[slotId] = props;
  }

  // Fill remaining slots with defaults
  for (let i = 0; i < 4; i++) {
    const slotId = SLOT_IDS[i];
    if (!loadouts[slotId]) loadouts[slotId] = EMPTY_LOADOUT;
    if (!loadoutProperties[slotId]) loadoutProperties[slotId] = DEFAULT_LOADOUT_PROPERTIES;
  }

  return serializeSheet(
    operatorIds,
    DEFAULT_ENEMY.id,
    getDefaultEnemyStats(DEFAULT_ENEMY.id),
    [],
    loadouts,
    loadoutProperties,
    INITIAL_VISIBLE,
    1,
  );
}

// ── Laevatain P5 ────────────────────────────────────────────────────────────

function buildLaevatainP5(): SheetData {
  return buildSheetForOperators([
    { id: 'LAEVATAIN', potential: 5 },
  ]);
}

// ── Rossi team ──────────────────────────────────────────────────────────────

function buildRossiTeam(): SheetData {
  return buildSheetForOperators([
    {
      id: 'ROSSI',
      potential: 0,
      loadout: {
        weaponId: 'LUPINE_SCARLET',
        armorId: 'MI_SECURITY_ARMOR_T1',
        glovesId: 'MI_SECURITY_GLOVES_T1',
        kit1Id: 'MI_SECURITY_SCOPE_T1',
        kit2Id: 'MI_SECURITY_SCOPE_T1',
      },
      weaponSkills: { skill1Level: 9, skill2Level: 9, skill3Level: 4 },
    },
    { id: 'AKEKURI' },       // 4* → P5 by default
    { id: 'GILBERTA' },      // 6* → P0 by default
    { id: 'POGRANICHNIK' },  // 6* → P0 by default
  ]);
}

// ── Public API ──────────────────────────────────────────────────────────────

export const COMMUNITY_FOLDERS: CommunityFolder[] = [
  {
    id: 'community-laevatain',
    name: 'Laevatain',
    loadouts: [
      { id: 'community-laevatain-p5', name: 'Laevatain P5' },
    ],
  },
  {
    id: 'community-rossi',
    name: 'Rossi',
    loadouts: [
      { id: 'community-rossi-team', name: 'Rossi / Akekuri / Gilberta / Pogranichnik' },
    ],
  },
];

const COMMUNITY_PREFIX = 'community-';

export function isCommunityLoadoutId(id: string | null): boolean {
  return id != null && id.startsWith(COMMUNITY_PREFIX);
}

export function getCommunityLoadoutName(loadoutId: string): string | null {
  for (const folder of COMMUNITY_FOLDERS) {
    for (const loadout of folder.loadouts) {
      if (loadout.id === loadoutId) return loadout.name;
    }
  }
  return null;
}

const GENERATORS: Record<string, () => SheetData> = {
  'community-laevatain-p5': buildLaevatainP5,
  'community-rossi-team': buildRossiTeam,
};

/** Generate fresh SheetData for a community loadout. */
export function generateCommunityLoadout(loadoutId: string): SheetData | null {
  const gen = GENERATORS[loadoutId];
  return gen ? gen() : null;
}
