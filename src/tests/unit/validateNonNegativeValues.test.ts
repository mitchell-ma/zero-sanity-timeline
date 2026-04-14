import { validateNonNegativeValues } from '../../model/game-data/validationUtils';
import { PERMANENT_DURATION } from '../../consts/enums';

describe('validateNonNegativeValues', () => {
  it('passes a permanent-duration status (99999 is allowed)', () => {
    const json = {
      properties: {
        id: 'FOO',
        duration: { value: { verb: 'IS', value: PERMANENT_DURATION }, unit: 'SECOND' },
        stacks: { limit: { verb: 'IS', value: 1 } },
      },
    };
    expect(validateNonNegativeValues(json)).toEqual([]);
  });

  it('flags negative duration.value (flat IS form)', () => {
    const json = {
      properties: {
        duration: { value: { verb: 'IS', value: -1 }, unit: 'SECOND' },
      },
    };
    const errors = validateNonNegativeValues(json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/duration.*-1.*cannot be negative/);
  });

  it('flags negative stacks.limit (flat IS form)', () => {
    const json = {
      properties: {
        stacks: { limit: { verb: 'IS', value: -3 }, interactionType: 'RESET' },
      },
    };
    const errors = validateNonNegativeValues(json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/stacks\.limit.*-3/);
  });

  it('flags negative stacks.value (used by APPLY/CONSUME effects)', () => {
    const effect = {
      verb: 'APPLY', object: 'STATUS', objectId: 'FOO',
      with: { stacks: { verb: 'IS', value: -2 } },
    };
    const errors = validateNonNegativeValues(effect);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/stacks.*-2/);
  });

  it('flags negative entries in VARY_BY arrays', () => {
    const json = {
      properties: {
        duration: {
          value: { verb: 'VARY_BY', object: 'TALENT_LEVEL', value: [0, 5, -1] },
          unit: 'SECOND',
        },
      },
    };
    const errors = validateNonNegativeValues(json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/value\[2\].*-1/);
  });

  it('walks into nested segments/frames', () => {
    const json = {
      segments: [
        {
          properties: {
            duration: { value: { verb: 'IS', value: -5 }, unit: 'SECOND' },
          },
        },
      ],
    };
    const errors = validateNonNegativeValues(json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/segments\[0\]\.properties\.duration/);
  });

  it('does not flag unrelated negative numbers (e.g. stat modifiers)', () => {
    const json = {
      clause: [
        {
          effects: [
            { verb: 'APPLY', object: 'STAT', objectId: 'ATTACK',
              with: { value: { verb: 'IS', value: -10 } } },
          ],
        },
      ],
    };
    expect(validateNonNegativeValues(json)).toEqual([]);
  });
});
