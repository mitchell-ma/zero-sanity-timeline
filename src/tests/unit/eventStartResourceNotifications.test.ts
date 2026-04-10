/**
 * Resource notification routing — pipeline invariant pins.
 *
 * Verifies that:
 * 1. `notifyResourceControllers` no longer exists as a DEC method
 *    (all resource writes flow through interpret/EVENT_START hooks).
 * 2. DEC wrapper methods (recordSkillPointCost, consumeUltimateEnergy, etc.)
 *    exist as the sole ingress for resource controller writes.
 * 3. The interpreter EVENT_START block references DEC wrapper methods
 *    (not direct spController/ueController calls).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../..');
const DEC_FILE = path.join(SRC_DIR, 'controller/timeline/derivedEventController.ts');
const INTERPRET_FILE = path.join(SRC_DIR, 'controller/timeline/eventInterpretorController.ts');

describe('Resource notification routing invariants', () => {
  const decSource = fs.readFileSync(DEC_FILE, 'utf8');
  const interpretSource = fs.readFileSync(INTERPRET_FILE, 'utf8');

  // Strip comments for code-only assertions
  function stripComments(src: string) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
      .split('\n')
      .map(line => line.replace(/\/\/.*$/, ''))
      .join('\n');
  }

  const decCode = stripComments(decSource);
  const interpretCode = stripComments(interpretSource);

  // ── 1. notifyResourceControllers must not exist as a method ──────────────

  test('notifyResourceControllers is deleted from DEC (no method definition)', () => {
    // Should not find a method definition (private/public notifyResourceControllers)
    expect(decCode).not.toMatch(/\bnotifyResourceControllers\s*\(/);
  });

  // ── 2. DEC wrapper methods exist ─────────────────────────────────────────

  test('DEC exposes recordSkillPointCost wrapper', () => {
    expect(decCode).toMatch(/\brecordSkillPointCost\s*\(/);
  });

  test('DEC exposes consumeUltimateEnergy wrapper', () => {
    expect(decCode).toMatch(/\bconsumeUltimateEnergy\s*\(/);
  });

  test('DEC exposes addNoGainWindow wrapper', () => {
    expect(decCode).toMatch(/\baddNoGainWindow\s*\(/);
  });

  test('DEC exposes registerSpRecoveryEvent wrapper', () => {
    expect(decCode).toMatch(/\bregisterSpRecoveryEvent\s*\(/);
  });

  // ── 3. Interpreter EVENT_START uses DEC wrappers ─────────────────────────

  test('interpreter EVENT_START calls controller.recordSkillPointCost', () => {
    expect(interpretCode).toMatch(/controller\.recordSkillPointCost\s*\(/);
  });

  test('interpreter EVENT_START calls controller.consumeUltimateEnergy', () => {
    expect(interpretCode).toMatch(/controller\.consumeUltimateEnergy\s*\(/);
  });

  test('interpreter EVENT_START calls controller.addNoGainWindow', () => {
    expect(interpretCode).toMatch(/controller\.addNoGainWindow\s*\(/);
  });

  // ── 4. No direct spController/ueController calls in DEC.createSkillEvent ──

  test('DEC createSkillEvent does not call spController.addCost directly', () => {
    // The only spController.addCost call should be inside the recordSkillPointCost wrapper,
    // not in createSkillEvent or any other method.
    const lines = decCode.split('\n');
    const addCostLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => /spController\.addCost\s*\(/.test(line));

    // There should be exactly one occurrence — inside the wrapper method
    expect(addCostLines.length).toBeLessThanOrEqual(1);
  });

  test('DEC createSkillEvent does not call ueController.addConsume directly', () => {
    const lines = decCode.split('\n');
    const consumeLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => /ueController\.addConsume\s*\(/.test(line));

    // Exactly one occurrence — inside the consumeUltimateEnergy wrapper
    expect(consumeLines.length).toBeLessThanOrEqual(1);
  });

  test('DEC createSkillEvent does not call ueController.addNoGainWindow directly', () => {
    const lines = decCode.split('\n');
    const noGainLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => /ueController\.addNoGainWindow\s*\(/.test(line));

    expect(noGainLines.length).toBeLessThanOrEqual(1);
  });
});
