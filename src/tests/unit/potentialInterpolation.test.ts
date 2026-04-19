/**
 * Regression coverage for potential `{param:format}` interpolation —
 * ensures that (a) the Warfarin-ingested `descriptionParams` reach
 * `loadPotentialsFromFiles`, and (b) tokens in the locale template are
 * resolved against those params when a consumer reads a potential.
 *
 * This test is declarative: it picks Da Pan P3 (known attribute-delta
 * template: `Strength +{Str:0}, Physical DMG Dealt +{PhysicalDamageIncrease:0%}.`)
 * and asserts the ingested params produce the expected display text.
 */
import { getOperatorPotentialRaw, getOperatorBase } from '../../model/game-data/operatorsStore';
import { LocaleKey, resolveEventDescription } from '../../locales/gameDataLocale';

describe('potential descriptionParams interpolation', () => {
  it('Da Pan P3 template interpolates against the ingested params', () => {
    const base = getOperatorBase('DA_PAN');
    expect(base).toBeDefined();
    const raws = getOperatorPotentialRaw('DA_PAN');
    const p3 = raws.find(
      p => ((p.properties as Record<string, unknown>)?.level as number) === 3,
    );
    expect(p3).toBeDefined();
    const params = (p3!.properties as Record<string, unknown>).descriptionParams as
      | Record<string, number> | undefined;
    expect(params).toBeDefined();
    expect(params!.Str).toBe(15);
    expect(params!.PhysicalDamageIncrease).toBeCloseTo(0.08, 4);

    const rendered = resolveEventDescription(
      LocaleKey.operatorPotential('DA_PAN', 3),
      params,
    );
    // Template: "Strength +{Str:0}, Physical DMG Dealt +{PhysicalDamageIncrease:0%}."
    expect(rendered).toBe('Strength +15, Physical DMG Dealt +8%.');
  });
});
