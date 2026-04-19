import { ElementType } from '../consts/enums';
import { OperatorClassType } from '../model/enums/operators';

import physicalIcon from '../assets/elements/physical.jpg';
import heatIcon from '../assets/elements/heat.jpg';
import cryoIcon from '../assets/elements/cryo.jpg';
import natureIcon from '../assets/elements/nature.jpg';
import electricIcon from '../assets/elements/electric.jpg';

import strikerIcon from '../assets/classes/striker.jpg';
import casterIcon from '../assets/classes/caster.jpg';
import guardIcon from '../assets/classes/guard.jpg';
import vanguardIcon from '../assets/classes/vanguard.jpg';
import defenderIcon from '../assets/classes/defender.jpg';
import supporterIcon from '../assets/classes/supporter.jpg';

import p0Icon from '../assets/potentials/p0.png';
import p1Icon from '../assets/potentials/p1.png';
import p2Icon from '../assets/potentials/p2.png';
import p3Icon from '../assets/potentials/p3.png';
import p4Icon from '../assets/potentials/p4.png';
import p5Icon from '../assets/potentials/p5.png';

/** Element badge icons (white glyph on element-color bg). ARTS has no official icon. */
export const ELEMENT_ICONS: Partial<Record<ElementType, string>> = {
  [ElementType.PHYSICAL]: physicalIcon,
  [ElementType.HEAT]:     heatIcon,
  [ElementType.CRYO]:     cryoIcon,
  [ElementType.NATURE]:   natureIcon,
  [ElementType.ELECTRIC]: electricIcon,
};

/** Class badge icons (white glyph on dark bg). */
export const CLASS_ICONS: Record<OperatorClassType, string> = {
  [OperatorClassType.STRIKER]:   strikerIcon,
  [OperatorClassType.CASTER]:    casterIcon,
  [OperatorClassType.GUARD]:     guardIcon,
  [OperatorClassType.VANGUARD]:  vanguardIcon,
  [OperatorClassType.DEFENDER]:  defenderIcon,
  [OperatorClassType.SUPPORTER]: supporterIcon,
};

/** Potential rank icons P0..P5 (yellow band rises with rank). Indexed by rank. */
export const POTENTIAL_ICONS: readonly string[] = [p0Icon, p1Icon, p2Icon, p3Icon, p4Icon, p5Icon];

/** Weapon potential is derived from the third-skill level: L4→P0, L9→P5. */
export function weaponSkillLevelToPotential(skill3Level: number): number {
  return Math.max(0, Math.min(5, skill3Level - 4));
}

/** Clamp a potential rank to the valid 0..5 range for icon lookup. */
export function getPotentialIcon(rank: number): string {
  const clamped = Math.max(0, Math.min(5, rank | 0));
  return POTENTIAL_ICONS[clamped];
}
