import { ShieldController } from '../../controller/calculation/shieldController';

describe('ShieldController', () => {
  let controller: ShieldController;

  beforeEach(() => {
    controller = new ShieldController();
  });

  it('applyShield stores tick and getShieldValue returns it', () => {
    controller.applyShield('op1', 100, 500, 1300);
    expect(controller.getShieldValue('op1', 100)).toBe(500);
    expect(controller.getShieldValue('op1', 500)).toBe(500);
    expect(controller.getShieldValue('op1', 1299)).toBe(500);
  });

  it('getShieldValue returns 0 before start frame', () => {
    controller.applyShield('op1', 100, 500, 1300);
    expect(controller.getShieldValue('op1', 99)).toBe(0);
  });

  it('getShieldValue returns 0 at or after expiration frame', () => {
    controller.applyShield('op1', 100, 500, 1300);
    expect(controller.getShieldValue('op1', 1300)).toBe(0);
    expect(controller.getShieldValue('op1', 2000)).toBe(0);
  });

  it('multiple shields from different sources stack additively', () => {
    controller.applyShield('op1', 100, 500, 1300);
    controller.applyShield('op1', 200, 300, 1400);
    // Both active at frame 500
    expect(controller.getShieldValue('op1', 500)).toBe(800);
    // Only second active after first expires
    expect(controller.getShieldValue('op1', 1300)).toBe(300);
  });

  it('shields are per-operator', () => {
    controller.applyShield('op1', 100, 500, 1300);
    controller.applyShield('op2', 100, 300, 1300);
    expect(controller.getShieldValue('op1', 500)).toBe(500);
    expect(controller.getShieldValue('op2', 500)).toBe(300);
    expect(controller.getShieldValue('op3', 500)).toBe(0);
  });

  it('getOperatorIds returns all operators with shields', () => {
    controller.applyShield('op1', 0, 100, 1000);
    controller.applyShield('op2', 0, 200, 1000);
    const ids = controller.getOperatorIds();
    expect(ids).toContain('op1');
    expect(ids).toContain('op2');
    expect(ids).toHaveLength(2);
  });

  it('clear resets all state', () => {
    controller.applyShield('op1', 0, 500, 1000);
    controller.clear();
    expect(controller.getShieldValue('op1', 500)).toBe(0);
    expect(controller.getOperatorIds()).toHaveLength(0);
  });

  it('queries work after applyShield without any post-pass', () => {
    // Phase 9d: shieldController.finalize deleted
    controller.applyShield('op1', 100, 500, 1300);
    expect(controller.getShieldValue('op1', 500)).toBe(500);
    expect(controller.getShieldValue('op1', 1300)).toBe(0);
  });
});
