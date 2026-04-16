/**
 * Unit tests for `translateCondition` — the DSL → natural-language renderer
 * used by the info-pane clause card.
 *
 * Regression coverage for the "threshold value dropped for with-based
 * conditions" bug: `HAVE POTENTIAL GREATER_THAN_EQUAL with.value = 5`
 * used to render as "source Operator Have Potential at least" (no number)
 * because the translator only read `c.value` and missed `c.with.value`.
 */
import { translateCondition } from '../../dsl/semanticsTranslation';

describe('translateCondition — threshold value resolution', () => {
  it('renders direct `value` threshold', () => {
    const out = translateCondition({
      subjectDeterminer: 'THIS',
      subject: 'OPERATOR',
      verb: 'HAVE',
      object: 'POTENTIAL',
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
      value: { verb: 'IS', value: 5 },
    });
    expect(out).toContain('at least');
    expect(out).toContain('5');
  });

  it('renders `with.value` threshold (ValueNode form)', () => {
    const out = translateCondition({
      subjectDeterminer: 'SOURCE',
      subject: 'OPERATOR',
      verb: 'HAVE',
      object: 'POTENTIAL',
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
      with: {
        value: { verb: 'IS', value: 5 },
      },
    });
    expect(out).toContain('at least');
    expect(out).toContain('5');
  });

  it('renders `with.stacks` threshold with "stack" label (CONSUME stacks form)', () => {
    const out = translateCondition({
      subjectDeterminer: 'THIS',
      subject: 'OPERATOR',
      verb: 'CONSUME',
      object: 'STATUS',
      objectId: 'INFLICTION',
      objectQualifier: 'VULNERABLE',
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
      with: {
        stacks: { verb: 'IS', value: 1 },
      },
    });
    expect(out).toContain('at least');
    expect(out).toContain('1 stack');
    expect(out).not.toContain('1 stacks');
  });

  it('pluralizes "stacks" for values greater than 1', () => {
    const out = translateCondition({
      subjectDeterminer: 'THIS',
      subject: 'OPERATOR',
      verb: 'CONSUME',
      object: 'STATUS',
      objectQualifier: 'VULNERABLE',
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
      with: {
        stacks: { verb: 'IS', value: 3 },
      },
    });
    expect(out).toContain('3 stacks');
  });

  it('renders cardinality without value when neither is provided', () => {
    const out = translateCondition({
      subjectDeterminer: 'THIS',
      subject: 'OPERATOR',
      verb: 'HAVE',
      object: 'POTENTIAL',
      cardinalityConstraint: 'GREATER_THAN_EQUAL',
    });
    expect(out).toContain('at least');
    expect(out).not.toContain('?');
  });
});
