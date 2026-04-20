/**
 * Zhuang Fangyi — Enhanced Combo Skill (Breath of Transformation Enhanced) config invariants.
 *
 * The enhanced CS is swapped in during the ultimate (Smiting Tempest). By
 * design it mirrors the regular CS's effects but:
 *   (a) scales the ELECTRIC damage multiplier to 240%–540% across skill
 *       levels 1–12 (vs. 160%–360% on the regular variant), and
 *   (b) its cooldown is 25% of the regular CS cooldown, expressed as
 *       MULT(0.25, VARY_BY SKILL_LEVEL [18,18,18,18,18,18,18,18,18,18,18,17]).
 *
 * These tests pin both the raw multipliers and the cooldown expression
 * shape, and verify the rest of the effect graph matches the regular CS
 * (same verbs/objects/targets on both the unconditional and conditional
 * frame clauses).
 */

import { VerbType, NounType, AdjectiveType, ValueOperation, DeterminerType } from '../../dsl/semantics';
import { SegmentType } from '../../consts/enums';

/* eslint-disable @typescript-eslint/no-require-imports */
const regularCs = require(
  '../../model/game-data/operators/zhuang-fangyi/skills/combo-skill-breath-of-transformation.json',
);
const enhancedCs = require(
  '../../model/game-data/operators/zhuang-fangyi/skills/combo-skill-breath-of-transformation-enhanced.json',
);
/* eslint-enable @typescript-eslint/no-require-imports */

type DslEffect = {
  verb: string;
  object?: string;
  objectId?: string;
  objectQualifier?: string;
  to?: string;
  from?: string;
};

type DslCondition = {
  subject: string;
  verb: string;
  object?: string;
  objectId?: string;
  objectQualifier?: string;
};

function effectShape(e: DslEffect) {
  return {
    verb: e.verb,
    object: e.object,
    objectId: e.objectId,
    objectQualifier: e.objectQualifier,
    to: e.to,
    from: e.from,
  };
}

function conditionShape(c: DslCondition) {
  return {
    subject: c.subject,
    verb: c.verb,
    object: c.object,
    objectId: c.objectId,
    objectQualifier: c.objectQualifier,
  };
}

function findFrameSegment(skill: { segments: Array<Record<string, unknown>> }) {
  return skill.segments.find(
    (s) => Array.isArray((s as { frames?: unknown[] }).frames)
      && ((s as { frames: unknown[] }).frames.length > 0),
  ) as { frames: Array<{ clause: Array<{ conditions: DslCondition[]; effects: DslEffect[] }> }> };
}

function findCooldownSegment(skill: { segments: Array<{ properties: { segmentTypes?: string[] } }> }) {
  return skill.segments.find(
    (s) => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN),
  );
}

function findDamageEffect(effects: DslEffect[]) {
  return effects.find(
    (e) => e.verb === VerbType.DEAL
      && e.object === NounType.DAMAGE
      && e.objectQualifier === AdjectiveType.ELECTRIC,
  ) as (DslEffect & { with: { value: { value: number[] } } }) | undefined;
}

describe('Zhuang Fangyi — Breath of Transformation Enhanced: damage multipliers', () => {
  it('scales ELECTRIC damage to 240%–540% across skill levels 1–12', () => {
    const frame = findFrameSegment(enhancedCs).frames[0];
    const unconditional = frame.clause.find((c) => c.conditions.length === 0);
    expect(unconditional).toBeDefined();
    const dmg = findDamageEffect(unconditional!.effects);
    expect(dmg).toBeDefined();
    expect(dmg!.with.value.value).toEqual(
      [2.4, 2.64, 2.88, 3.12, 3.36, 3.6, 3.84, 4.08, 4.32, 4.62, 4.98, 5.4],
    );
  });

  it('SL12 multiplier = 540%', () => {
    const frame = findFrameSegment(enhancedCs).frames[0];
    const unconditional = frame.clause.find((c) => c.conditions.length === 0);
    const dmg = findDamageEffect(unconditional!.effects);
    expect(dmg!.with.value.value[11]).toBe(5.4);
  });

  it('SL1 multiplier = 240% (1.5× the regular CS SL1 of 160%)', () => {
    const regFrame = findFrameSegment(regularCs).frames[0];
    const regUncond = regFrame.clause.find((c) => c.conditions.length === 0);
    const regDmg = findDamageEffect(regUncond!.effects);
    const regSl1 = regDmg!.with.value.value[0];

    const enhFrame = findFrameSegment(enhancedCs).frames[0];
    const enhUncond = enhFrame.clause.find((c) => c.conditions.length === 0);
    const enhDmg = findDamageEffect(enhUncond!.effects);
    const enhSl1 = enhDmg!.with.value.value[0];

    expect(regSl1).toBe(1.6);
    expect(enhSl1).toBe(2.4);
    expect(enhSl1 / regSl1).toBeCloseTo(1.5, 6);
  });
});

describe('Zhuang Fangyi — Breath of Transformation Enhanced: cooldown expression', () => {
  type CdDuration = {
    value: {
      operation?: string;
      left?: { verb: string; value: number };
      right?: { verb: string; object: string; value: number[]; of?: { object: string; determiner: string } };
    };
    unit: string;
  };

  it('is MULT(0.25, <base cooldown>) — preserved as a structured expression, not flattened', () => {
    const cd = findCooldownSegment(enhancedCs) as { properties: { duration: CdDuration } } | undefined;
    expect(cd).toBeDefined();

    const dur = cd!.properties.duration;
    expect(dur.value.operation).toBe(ValueOperation.MULT);
    expect(dur.value.left).toEqual({ verb: VerbType.IS, value: 0.25 });
    expect(dur.value.right?.verb).toBe(VerbType.VARY_BY);
    expect(dur.value.right?.object).toBe(NounType.SKILL_LEVEL);
    expect(dur.value.right?.of).toEqual({
      object: NounType.OPERATOR,
      determiner: DeterminerType.THIS,
    });
  });

  it('base cooldown table is [18,18,18,18,18,18,18,18,18,18,18,17] (SL12 drops to 17s)', () => {
    const cd = findCooldownSegment(enhancedCs) as { properties: { duration: CdDuration } };
    expect(cd.properties.duration.value.right?.value).toEqual(
      [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 17],
    );
  });

  it('effective cooldown per skill level = 0.25 × base ⇒ [4.5×11, 4.25]', () => {
    const cd = findCooldownSegment(enhancedCs) as { properties: { duration: CdDuration } };
    const base = cd.properties.duration.value.right!.value;
    const scale = cd.properties.duration.value.left!.value;
    const effective = base.map((v) => v * scale);
    expect(effective).toEqual([4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.25]);
  });
});

describe('Zhuang Fangyi — Breath of Transformation Enhanced: effect parity with regular CS', () => {
  it('unconditional clause has the same effect shapes (verb/object/to) as the regular CS', () => {
    const regUncond = findFrameSegment(regularCs).frames[0].clause.find((c) => c.conditions.length === 0);
    const enhUncond = findFrameSegment(enhancedCs).frames[0].clause.find((c) => c.conditions.length === 0);
    expect(regUncond).toBeDefined();
    expect(enhUncond).toBeDefined();
    expect(enhUncond!.effects.map(effectShape)).toEqual(regUncond!.effects.map(effectShape));
  });

  it('conditional clause (ENEMY HAVE ELECTRIC INFLICTION) is preserved verbatim — same conditions, same effects', () => {
    const regCond = findFrameSegment(regularCs).frames[0].clause.find((c) => c.conditions.length > 0);
    const enhCond = findFrameSegment(enhancedCs).frames[0].clause.find((c) => c.conditions.length > 0);
    expect(regCond).toBeDefined();
    expect(enhCond).toBeDefined();

    expect(enhCond!.conditions.map(conditionShape)).toEqual(regCond!.conditions.map(conditionShape));
    expect(enhCond!.effects.map(effectShape)).toEqual(regCond!.effects.map(effectShape));
  });

  it('gate is specifically ENEMY HAVE INFLICTION/ELECTRIC', () => {
    const enhCond = findFrameSegment(enhancedCs).frames[0].clause.find((c) => c.conditions.length > 0);
    expect(enhCond!.conditions).toHaveLength(1);
    const gate = enhCond!.conditions[0];
    expect(gate.subject).toBe(NounType.ENEMY);
    expect(gate.verb).toBe(VerbType.HAVE);
    expect(gate.object).toBe(NounType.STATUS);
    expect(gate.objectId).toBe(NounType.INFLICTION);
    expect(gate.objectQualifier).toBe(AdjectiveType.ELECTRIC);
  });
});
