/**
 * Info-pane card shape — unified across JSON-authored and runtime-built frames.
 *
 * The info pane's FrameDetail view consumes one frame shape:
 *   `frame.properties.offset: { value, unit }`  (authoring form)
 *   `frame.clause: Predicate[]` with raw `Effect[]` inside.
 *
 * Before this refactor there were two shapes:
 *   - JSON-authored:  frame.properties.offset + frame.clause + raw Effect[]
 *   - Runtime-built:  frame.offsetFrame + frame.clauses (plural) + { type: 'dsl', dslEffect }
 *
 * The EventPane maintained a translation shim that converted the runtime shape
 * into the JSON shape before rendering. After unification the shim is gone —
 * runtime builders emit the JSON shape directly. This test locks that in:
 * given a JSON-authored skill frame and a runtime-built reaction frame, the
 * shape fields the info-pane reads are identical.
 */
import { buildReactionSegment, buildCorrosionSegments } from '../../controller/timeline/processInfliction';
import { DataDrivenSkillEventFrame, DataDrivenSkillEventSequence } from '../../model/event-frames/dataDrivenEventFrames';
import { TimelineEvent } from '../../consts/viewTypes';
import { ENEMY_ID, REACTION_COLUMNS } from '../../model/channels';
import { UnitType } from '../../consts/enums';
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

/** Returns the set of top-level keys on a frame-shape object, excluding internal
 *  runtime-derived fields that the info pane doesn't read. */
function frameShapeKeys(frame: Record<string, unknown>): string[] {
  const shapeKeys = ['properties', 'clause', 'clauseType', 'offsetFrame'];
  return shapeKeys.filter(k => k in frame).sort();
}

/** Extract the info-pane-visible shape of a frame: properties.offset + clause. */
function infoPaneShape(frame: Record<string, unknown>) {
  const props = frame.properties as Record<string, unknown> | undefined;
  return {
    hasPropertiesOffset: props != null && 'offset' in props,
    offsetUnit: (props?.offset as { unit?: string } | undefined)?.unit,
    hasClauseSingular: 'clause' in frame,
    hasClausesPlural: 'clauses' in frame,
    clauseLength: Array.isArray(frame.clause) ? (frame.clause as unknown[]).length : 0,
  };
}

describe('Info-pane card shape unification', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // A. JSON-authored skill frame
  // ─────────────────────────────────────────────────────────────────────────

  describe('A. JSON-authored skill frame', () => {
    it('A1: has properties.offset + clause (singular) + raw Effect[]', () => {
      const jsonFrame = {
        properties: { offset: { value: 0.3, unit: UnitType.SECOND } },
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
      const marker = parsed.toMarker(FPS) as unknown as Record<string, unknown>;

      const shape = infoPaneShape(marker);
      expect(shape.hasPropertiesOffset).toBe(true);
      expect(shape.offsetUnit).toBe(UnitType.SECOND);
      expect(shape.hasClauseSingular).toBe(true);
      expect(shape.hasClausesPlural).toBe(false);
      expect(shape.clauseLength).toBe(1);

      // The effect is a raw Effect, not { type, dslEffect }
      const clause = marker.clause as Array<{ effects: Array<Record<string, unknown>> }>;
      const effect = clause[0].effects[0];
      expect(effect.verb).toBe(VerbType.DEAL);
      expect('dslEffect' in effect).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. Runtime-built Combustion frame
  // ─────────────────────────────────────────────────────────────────────────

  describe('B. Runtime-built Combustion frame', () => {
    it('B1: has identical top-level shape keys as JSON-authored frame', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 2);
      const seg = buildReactionSegment(ev)!;
      const runtimeFrame = seg.frames![0] as unknown as Record<string, unknown>;

      const jsonFrame = {
        properties: { offset: { value: 0.3, unit: UnitType.SECOND } },
        clause: [{ conditions: [], effects: [] }],
      };
      const jsonMarker = new DataDrivenSkillEventFrame(jsonFrame as never)
        .toMarker(FPS) as unknown as Record<string, unknown>;

      // Both frames carry the same info-pane-visible keys (properties, clause,
      // offsetFrame). Runtime may carry additional engine metadata (damageElement,
      // frameTypes) — those don't affect the info-pane shape contract.
      const runtimeKeys = frameShapeKeys(runtimeFrame);
      const jsonKeys = frameShapeKeys(jsonMarker);
      // Both must have properties, clause, offsetFrame at minimum
      for (const k of ['properties', 'clause', 'offsetFrame']) {
        expect(runtimeKeys).toContain(k);
        expect(jsonKeys).toContain(k);
      }

      // Neither may have the plural `clauses` — that would signal regression.
      expect('clauses' in runtimeFrame).toBe(false);
      expect('clauses' in jsonMarker).toBe(false);
    });

    it('B2: shape is identical across all 11 Combustion frames', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 2);
      const seg = buildReactionSegment(ev)!;
      const shapes = seg.frames!.map(f => infoPaneShape(f as unknown as Record<string, unknown>));

      // Every frame must be uniformly shaped for the info pane
      for (const s of shapes) {
        expect(s.hasPropertiesOffset).toBe(true);
        expect(s.offsetUnit).toBe(UnitType.SECOND);
        expect(s.hasClauseSingular).toBe(true);
        expect(s.hasClausesPlural).toBe(false);
        expect(s.clauseLength).toBeGreaterThan(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. Runtime-built Corrosion frame
  // ─────────────────────────────────────────────────────────────────────────

  describe('C. Runtime-built Corrosion frame', () => {
    it('C1: segment-0 initial damage frame matches the unified shape', () => {
      const ev = reactionEvent(REACTION_COLUMNS.CORROSION, 15, 3);
      const segs = buildCorrosionSegments(ev)!;
      const f0 = segs[0].frames?.[0] as unknown as Record<string, unknown>;
      expect(f0).toBeDefined();

      const shape = infoPaneShape(f0);
      expect(shape.hasPropertiesOffset).toBe(true);
      expect(shape.offsetUnit).toBe(UnitType.SECOND);
      expect(shape.hasClauseSingular).toBe(true);
      expect(shape.hasClausesPlural).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. Global invariant — zero wrapper keys across all builder outputs
  // ─────────────────────────────────────────────────────────────────────────

  describe('D. Zero `dslEffect` wrappers anywhere in the unified output', () => {
    it('D1: every Combustion frame carries raw Effect[] — no `dslEffect` key', () => {
      const ev = reactionEvent(REACTION_COLUMNS.COMBUSTION, 10, 2);
      const seg = buildReactionSegment(ev)!;
      const json = JSON.stringify(seg);
      expect(json).not.toContain('dslEffect');
      expect(json).not.toContain('"type":"dsl"');
    });

    it('D2: every Corrosion segment + frame tree carries raw Effect[] — no `dslEffect` key', () => {
      const ev = reactionEvent(REACTION_COLUMNS.CORROSION, 15, 3);
      const segs = buildCorrosionSegments(ev)!;
      const json = JSON.stringify(segs);
      expect(json).not.toContain('dslEffect');
      expect(json).not.toContain('"type":"dsl"');
    });

    it('D3: JSON-authored skill frames also carry raw Effect[] after toMarker', () => {
      const jsonFrame = {
        properties: { offset: { value: 0.3, unit: UnitType.SECOND } },
        clause: [{
          conditions: [],
          effects: [{ verb: VerbType.DEAL, object: NounType.DAMAGE }],
        }],
      };
      const marker = new DataDrivenSkillEventFrame(jsonFrame as never).toMarker(FPS);
      const json = JSON.stringify(marker);
      expect(json).not.toContain('dslEffect');
    });

    // Exported type reference — prevents accidental re-introduction of the
    // abstract class being removed from module exports.
    it('D4: DataDrivenSkillEventSequence remains exported', () => {
      expect(DataDrivenSkillEventSequence).toBeDefined();
    });
  });
});
