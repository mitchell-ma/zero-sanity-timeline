/**
 * End-to-end check: skill + talent `{param}` tokens interpolate against
 * `descriptionParams` ingested from the Warfarin skill/talent blackboards
 * and reach the view-facing `skill.description` / `TalentEntry.description`.
 */
import { getOperatorSkill } from '../../controller/gameDataStore';
import { getOperatorBase } from '../../model/game-data/operatorsStore';

describe('skill + talent descriptionParams interpolation', () => {
  it('Akekuri basic attack interpolates the `poise` blackboard value', () => {
    // SWORD_OF_ASPIRATION_BATK template: "...Final Strike also deals {poise:0} Stagger."
    // Warfarin attack4.blackboard.poise = 17 (level 12).
    const skill = getOperatorSkill('AKEKURI', 'SWORD_OF_ASPIRATION_BATK');
    expect(skill).toBeDefined();
    expect(skill!.description).toContain('17 Stagger');
    expect(skill!.description).not.toMatch(/\{poise[:}]/);
  });

  it('Akekuri Cheer of Victory talent interpolates the sp_rate / sp_cap aliases', () => {
    // Template: "...SP Recovery +{sp_rate:0%} (max: {sp_cap:0%})."
    // Warfarin blackboard: sub_ratio=0.015 → sp_rate; max_ratio=0.75 → sp_cap.
    const op = getOperatorBase('AKEKURI');
    expect(op).toBeDefined();
    const talent = op!.talents?.one as { name: string; description?: string; maxLevel: number } | undefined;
    expect(talent).toBeDefined();
    expect(talent!.description).toBeDefined();
    expect(talent!.description).toContain('+2%');
    expect(talent!.description).toContain('max: 75%');
    expect(talent!.description).not.toMatch(/\{sp_rate[:}]/);
    expect(talent!.description).not.toMatch(/\{sp_cap[:}]/);
  });

  it('Ember "Pay the Ferric Price" talent interpolates attachSkill.blackboard values', () => {
    // Template: "...+{attack:0%} ATK for {duration:0s}..."
    // Warfarin attachSkill.blackboard: attack=0.09, duration=7 (level 2).
    const op = getOperatorBase('EMBER');
    expect(op).toBeDefined();
    // Find the Pay the Ferric Price talent — walk either slot.
    const talents = [op!.talents?.one, op!.talents?.two] as Array<
      { name?: string; description?: string } | undefined
    >;
    const pftp = talents.find(t => t?.name?.startsWith('Pay the Ferric Price'));
    expect(pftp).toBeDefined();
    expect(pftp!.description).toBeDefined();
    expect(pftp!.description).not.toMatch(/\{attack[:}]/);
    expect(pftp!.description).not.toMatch(/\{duration[:}]/);
  });
});
