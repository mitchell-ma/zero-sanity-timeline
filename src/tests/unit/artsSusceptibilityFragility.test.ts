/**
 * Arts susceptibility / fragility — reader expansion
 *
 * An event with columnId `ARTS_SUSCEPTIBILITY` (or `ARTS_FRAGILITY`) applies
 * uniformly to all four arts damage types (HEAT/CRYO/NATURE/ELECTRIC) — that's
 * the in-game semantic of "Arts Susceptibility / Fragility". The engine stores
 * one event on the `ARTS_*` column (with `ev.susceptibility = {ARTS: v}` for
 * the susceptibility variant); the damage-calc readers must expand that one
 * event to match against any queried arts element.
 */
import { DerivedEventController } from '../../controller/timeline/derivedEventController';
import { EventsQueryService } from '../../controller/timeline/eventsQueryService';
import { ENEMY_ID } from '../../model/channels';
import { ElementType, StatType } from '../../consts/enums';
import { DEFAULT_STATS } from '../../consts/stats';
import { TimelineEvent } from '../../consts/viewTypes';

jest.mock('../../controller/operators/operatorRegistry', () => ({
  getOperatorConfig: () => undefined,
  ALL_OPERATORS: [],
}));
jest.mock('../../utils/loadoutRegistry', () => ({
  WEAPON_REGISTRY: [],
  GEAR_REGISTRY: [],
  CONSUMABLE_REGISTRY: [],
  TACTICAL_REGISTRY: [],
}));

const ARTS_ELEMENTS = [ElementType.HEAT, ElementType.CRYO, ElementType.NATURE, ElementType.ELECTRIC];
// Query frame inside the event's [0, 5*FPS) window.
const FRAME = 60;

function seedEvent(ctrl: DerivedEventController, ev: TimelineEvent) {
  // DerivedEventController.addEvent routes through pushEvent for duration>0.
  ctrl.addEvent(ev);
}

function susceptibilityEvent(value: number): TimelineEvent {
  return {
    uid: 'arts-susc-1',
    id: 'ARTS_SUSCEPTIBILITY',
    name: 'Arts Susceptibility',
    ownerEntityId: ENEMY_ID,
    columnId: 'ARTS_SUSCEPTIBILITY',
    startFrame: 0,
    segments: [{ properties: { duration: 5 * 30 } }],
    susceptibility: { [ElementType.ARTS]: value },
    dslObjectId: 'SUSCEPTIBILITY',
    dslObjectQualifier: ElementType.ARTS,
  };
}

function fragilityEvent(value: number): TimelineEvent {
  return {
    uid: 'arts-frag-1',
    id: 'ARTS_FRAGILITY',
    name: 'Arts Fragility',
    ownerEntityId: ENEMY_ID,
    columnId: 'ARTS_FRAGILITY',
    startFrame: 0,
    segments: [{ properties: { duration: 5 * 30 } }],
    statusValue: value,
    dslObjectId: 'FRAGILITY',
    dslObjectQualifier: ElementType.ARTS,
  };
}

describe('Arts susceptibility — reader expansion across arts elements', () => {
  it('getSusceptibilityBonus returns the ARTS value for each arts element', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, susceptibilityEvent(0.3));
    const svc = new EventsQueryService(ctrl, []);
    for (const el of ARTS_ELEMENTS) {
      expect(svc.getSusceptibilityBonus(FRAME, el)).toBeCloseTo(0.3, 10);
    }
  });

  it('getSusceptibilityBonus returns 0 for PHYSICAL (arts susc doesn\'t apply to physical)', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, susceptibilityEvent(0.3));
    const svc = new EventsQueryService(ctrl, []);
    expect(svc.getSusceptibilityBonus(FRAME, ElementType.PHYSICAL)).toBe(0);
  });

  it('getSusceptibilitySources is strict: ARTS event appears only under ARTS, not under each arts element', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, susceptibilityEvent(0.3));
    const svc = new EventsQueryService(ctrl, []);
    // Breakdown grouping: arts events show up in the ARTS row only.
    const artsSources = svc.getSusceptibilitySources(FRAME, ElementType.ARTS);
    expect(artsSources).toHaveLength(1);
    expect(artsSources[0].value).toBeCloseTo(0.3, 10);
    // Not duplicated under individual arts elements.
    for (const el of ARTS_ELEMENTS) {
      expect(svc.getSusceptibilitySources(FRAME, el)).toHaveLength(0);
    }
  });

  it('getActiveSusceptibilityStacks counts an ARTS event under each arts element', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, { ...susceptibilityEvent(0.3), stacks: 1 });
    const svc = new EventsQueryService(ctrl, []);
    for (const el of ARTS_ELEMENTS) {
      expect(svc.getActiveSusceptibilityStacks(FRAME, el)).toBe(1);
    }
    expect(svc.getActiveSusceptibilityStacks(FRAME, ElementType.PHYSICAL)).toBe(0);
  });
});

describe('ARTS_* is a first-class StatType, not display-only', () => {
  it('exposes ARTS_SUSCEPTIBILITY, ARTS_AMP, ARTS_FRAGILITY, ARTS_DAMAGE_BONUS enum keys', () => {
    expect(StatType.ARTS_SUSCEPTIBILITY).toBe('ARTS_SUSCEPTIBILITY');
    expect(StatType.ARTS_AMP).toBe('ARTS_AMP');
    expect(StatType.ARTS_FRAGILITY).toBe('ARTS_FRAGILITY');
    expect(StatType.ARTS_DAMAGE_BONUS).toBe('ARTS_DAMAGE_BONUS');
  });

  it('registers ARTS_SUSCEPTIBILITY and ARTS_AMP in DEFAULT_STATS (so the accumulator tracks them)', () => {
    expect(DEFAULT_STATS[StatType.ARTS_SUSCEPTIBILITY]).toBe(0);
    expect(DEFAULT_STATS[StatType.ARTS_AMP]).toBe(0);
  });
});

describe('Arts fragility — reader expansion across arts elements', () => {
  it('getFragilityBonus returns the ARTS value for each arts element', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, fragilityEvent(0.2));
    const svc = new EventsQueryService(ctrl, []);
    for (const el of ARTS_ELEMENTS) {
      expect(svc.getFragilityBonus(FRAME, el)).toBeCloseTo(0.2, 10);
    }
  });

  it('getFragilityBonus returns 0 for PHYSICAL', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, fragilityEvent(0.2));
    const svc = new EventsQueryService(ctrl, []);
    expect(svc.getFragilityBonus(FRAME, ElementType.PHYSICAL)).toBe(0);
  });

  it('getFragilitySources is strict: ARTS event appears only under ARTS, not under each arts element', () => {
    const ctrl = new DerivedEventController();
    seedEvent(ctrl, fragilityEvent(0.2));
    const svc = new EventsQueryService(ctrl, []);
    const artsSources = svc.getFragilitySources(FRAME, ElementType.ARTS);
    expect(artsSources.some(s => Math.abs(s.value - 0.2) < 1e-9)).toBe(true);
    for (const el of ARTS_ELEMENTS) {
      const sources = svc.getFragilitySources(FRAME, el);
      expect(sources.some(s => s.label.includes('ARTS') || s.category === 'Arts Fragility')).toBe(false);
    }
  });
});
