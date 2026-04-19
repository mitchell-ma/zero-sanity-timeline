/**
 * Runtime frame shape — unit tests.
 *
 * Pins the **unified frame shape** that runtime builders emit. After the
 * clause-shape refactor, runtime-built frames must match the JSON-authored
 * shape so JSON-authored skills, runtime-built reactions (Combustion /
 * Corrosion), synthetic shatter/crush damage frames, and parser-wrapped
 * clauses all flow through one info-pane / damage-calc path.
 *
 * Specifically, this test asserts:
 *
 *   1. Effects are **raw `Effect` objects**, never wrapped as
 *      `{ type: 'dsl', dslEffect: Effect }` (the old shape).
 *   2. Frame clauses live on **`clause`** (singular), never `clauses` (plural).
 *   3. Runtime frames carry **`properties.offset: { value, unit }`** alongside
 *      the engine-convenience `offsetFrame: number`.
 *
 * A regression on any of these three axes re-introduces a shape divergence
 * that forces the info-pane to reintroduce a translation shim — exactly the
 * "one path for everything" invariant we set out to preserve.
 */
import { buildReactionSegment, buildCorrosionSegments } from '../../controller/timeline/processInfliction';
import {
  buildDealDamageClause,
  buildDealStaggerClause,
  buildSkillPointRecoveryClause,
  parseJsonClauseArray,
} from '../../controller/timeline/clauseQueries';
import { DataDrivenSkillEventFrame } from '../../model/event-frames/dataDrivenEventFrames';
import { TimelineEvent } from '../../consts/viewTypes';
import { ENEMY_ID, REACTION_COLUMNS } from '../../model/channels';
import { ElementType, UnitType } from '../../consts/enums';
import { VerbType, NounType, AdjectiveType } from '../../dsl/semantics';
import type { StatusLevel } from '../../consts/types';

jest.mock('../../model/game-data/weaponGameData', () => ({
  getSkillValues: () => [], getConditionalValues: () => [],
  getConditionalScalar: () => null, getBaseAttackForLevel: () => 0,
}));
jest.mock('../../view/InformationPane', () => ({
  DEFAULT_LOADOUT_PROPERTIES: {},
  getDefaultLoadoutProperties: () => ({}),
}));

const FPS = 120;

function reactionEvent(columnId: string, durationSeconds = 10, statusLevel: StatusLevel = 2): TimelineEvent {
  return {
    uid: `${columnId}-1`,
    id: columnId,
    name: columnId,
    ownerEntityId: ENEMY_ID,
    columnId,
    startFrame: 0,
    statusLevel,
    segments: [{ properties: { duration: durationSeconds * FPS } }],
  };
}

/** Walk a plain object tree, collecting every string key encountered. */
function collectKeys(obj: unknown, keys: Set<string> = new Set()): Set<string> {
  if (obj == null || typeof obj !== 'object') return keys;
  if (Array.isArray(obj)) {
    for (const el of obj) collectKeys(el, keys);
    return keys;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    keys.add(k);
    collectKeys(v, keys);
  }
  return keys;
}

describe('Runtime frame shape — unified with JSON', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // A. Clause-builder helpers emit raw Effect[] (no dslEffect wrapper)
  // ─────────────────────────────────────────────────────────────────────────

  describe('A. Clause builders emit raw Effect[] (no dslEffect wrapper)', () => {
    it('A1: buildDealDamageClause → raw DEAL DAMAGE Effect', () => {
      const pred = buildDealDamageClause({ multiplier: 1.5, element: ElementType.PHYSICAL });
      expect(pred.effects).toHaveLength(1);
      const e = pred.effects[0] as unknown as Record<string, unknown>;
      expect(e.verb).toBe(VerbType.DEAL);
      expect(e.object).toBe(NounType.DAMAGE);
      expect(e.objectQualifier).toBe(ElementType.PHYSICAL);
      // Critical: the old wrapped shape must be gone.
      expect('dslEffect' in e).toBe(false);
      expect('type' in e).toBe(false);
    });

    it('A2: buildDealStaggerClause → raw DEAL STAGGER Effect', () => {
      const pred = buildDealStaggerClause(25);
      const e = pred.effects[0] as unknown as Record<string, unknown>;
      expect(e.verb).toBe(VerbType.DEAL);
      expect(e.object).toBe(NounType.STAGGER);
      expect('dslEffect' in e).toBe(false);
    });

    it('A3: buildSkillPointRecoveryClause → raw RECOVER SKILL_POINT Effect', () => {
      const pred = buildSkillPointRecoveryClause(5);
      const e = pred.effects[0] as unknown as Record<string, unknown>;
      expect(e.verb).toBe(VerbType.RECOVER);
      expect(e.object).toBe(NounType.SKILL_POINT);
      expect('dslEffect' in e).toBe(false);
    });

    it('A4: parseJsonClauseArray passes raw JSON effects through unchanged', () => {
      const parsed = parseJsonClauseArray([{
        conditions: [],
        effects: [{ verb: VerbType.APPLY, object: NounType.STATUS, objectId: 'X' }],
      }]);
      expect(parsed).toHaveLength(1);
      const e = parsed[0].effects[0] as unknown as Record<string, unknown>;
      expect(e.verb).toBe(VerbType.APPLY);
      expect(e.object).toBe(NounType.STATUS);
      expect(e.objectId).toBe('X');
      expect('dslEffect' in e).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. buildReactionSegment — Combustion frames carry unified shape
  // ─────────────────────────────────────────────────────────────────────────

  describe('B. buildReactionSegment (Combustion)', () => {
    it('B1: produces 1 initial + 10 DoT frames over 10s, each with unified shape', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 2);
      const seg = buildReactionSegment(ev);
      expect(seg).not.toBeNull();
      const frames = seg!.frames ?? [];
      // Initial (forced=false) + 10 DoT ticks = 11 frames
      expect(frames).toHaveLength(11);

      for (const f of frames) {
        // Offset: both convenience frame count AND authored properties.offset
        expect(typeof f.offsetFrame).toBe('number');
        expect(f.properties?.offset).toBeDefined();
        expect(f.properties!.offset!.unit).toBe(UnitType.SECOND);
        // offsetFrame === properties.offset.value * FPS (roundtrip)
        expect(f.offsetFrame).toBe(f.properties!.offset!.value * FPS);

        // Clause: singular `clause`, each predicate has raw Effect[]
        expect(f.clause).toBeDefined();
        expect(Array.isArray(f.clause)).toBe(true);
        const effects = f.clause![0].effects as unknown as Record<string, unknown>[];
        expect(effects).toHaveLength(1);
        const e = effects[0];
        expect(e.verb).toBe(VerbType.DEAL);
        expect(e.object).toBe(NounType.DAMAGE);
        expect(e.objectQualifier).toBe(AdjectiveType.HEAT);
        expect('dslEffect' in e).toBe(false);
        expect('type' in e).toBe(false);
      }
    });

    it('B2: initial frame at offset 0, DoT frames at offsets 1..10 seconds', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 1);
      const seg = buildReactionSegment(ev)!;
      const offsets = seg.frames!.map(f => f.properties!.offset!.value);
      expect(offsets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. buildCorrosionSegments — segment-0 frame carries unified shape
  // ─────────────────────────────────────────────────────────────────────────

  describe('C. buildCorrosionSegments', () => {
    it('C1: segment 0 initial damage frame has properties.offset + raw DEAL DAMAGE clause', () => {
      const ev = reactionEvent(REACTION_COLUMNS.CORROSION, 15, 3);
      const segs = buildCorrosionSegments(ev);
      expect(segs).not.toBeNull();
      const f0 = segs![0].frames?.[0];
      expect(f0).toBeDefined();
      expect(f0!.properties?.offset).toEqual({ value: 0, unit: UnitType.SECOND });
      expect(f0!.offsetFrame).toBe(0);
      const effects = f0!.clause![0].effects as unknown as Record<string, unknown>[];
      expect(effects[0].verb).toBe(VerbType.DEAL);
      expect(effects[0].object).toBe(NounType.DAMAGE);
      expect('dslEffect' in effects[0]).toBe(false);
    });

    it('C2: segment-level clause carries raw APPLY STAT effect (no wrapper)', () => {
      const ev = reactionEvent(REACTION_COLUMNS.CORROSION, 15, 3);
      const segs = buildCorrosionSegments(ev)!;
      // Every segment has a clause applying ARTS RESISTANCE_REDUCTION to ENEMY
      for (const seg of segs) {
        expect(seg.clause).toBeDefined();
        const e = seg.clause![0].effects[0] as unknown as Record<string, unknown>;
        expect(e.verb).toBe(VerbType.APPLY);
        expect(e.object).toBe(NounType.STAT);
        expect('dslEffect' in e).toBe(false);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. DataDrivenSkillEventFrame — JSON-authored frames also unified
  // ─────────────────────────────────────────────────────────────────────────

  describe('D. DataDrivenSkillEventFrame (JSON parse path)', () => {
    it('D1: parsed frame emits raw Effect[] — no dslEffect wrapper', () => {
      const jsonFrame = {
        properties: { offset: { value: 0.5, unit: UnitType.SECOND } },
        clause: [{
          conditions: [],
          effects: [{
            verb: VerbType.DEAL,
            object: NounType.DAMAGE,
            objectQualifier: AdjectiveType.PHYSICAL,
            to: NounType.ENEMY,
            with: { value: { verb: VerbType.IS, value: 1 } },
          }],
        }],
      };
      const parsed = new DataDrivenSkillEventFrame(jsonFrame as never);
      const clauses = parsed.getClauses();
      expect(clauses).toHaveLength(1);
      const e = clauses[0].effects[0] as unknown as Record<string, unknown>;
      expect(e.verb).toBe(VerbType.DEAL);
      expect(e.object).toBe(NounType.DAMAGE);
      expect('dslEffect' in e).toBe(false);
      expect('type' in e).toBe(false);
    });

    it('D2: toMarker populates offsetFrame AND properties.offset from the parsed frame', () => {
      const jsonFrame = {
        properties: { offset: { value: 0.25, unit: UnitType.SECOND } },
        clause: [{ conditions: [], effects: [] }],
      };
      const parsed = new DataDrivenSkillEventFrame(jsonFrame as never);
      const marker = parsed.toMarker(FPS);
      expect(marker.offsetFrame).toBe(30);  // 0.25s × 120 FPS = 30
      expect(marker.properties?.offset).toEqual({ value: 0.25, unit: UnitType.SECOND });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. Global invariant — zero `dslEffect` / zero `clauses` in runtime output
  // ─────────────────────────────────────────────────────────────────────────

  describe('E. Runtime builder output contains no old-shape keys', () => {
    it('E1: Combustion segment tree has no dslEffect and no clauses (plural)', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 2);
      const seg = buildReactionSegment(ev)!;
      const keys = collectKeys(seg);
      expect(keys.has('dslEffect')).toBe(false);
      expect(keys.has('clauses')).toBe(false);
      expect(keys.has('clause')).toBe(true);
    });

    it('E2: Corrosion segment tree has no dslEffect and no clauses (plural)', () => {
      const ev = reactionEvent(REACTION_COLUMNS.CORROSION, 15, 3);
      const segs = buildCorrosionSegments(ev)!;
      const keys = collectKeys(segs);
      expect(keys.has('dslEffect')).toBe(false);
      expect(keys.has('clauses')).toBe(false);
      expect(keys.has('clause')).toBe(true);
    });
  });
});
