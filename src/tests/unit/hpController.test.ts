/**
 * HPController — unit tests for HP tracking, healing, overhealing, and enemy HP%.
 */
import { HPController } from '../../controller/calculation/hpController';

describe('HPController', () => {
  describe('enemy HP tracking', () => {
    it('returns null when no boss HP configured', () => {
      const hp = new HPController();
      expect(hp.getEnemyHpPercentage(0)).toBeNull();
    });

    it('returns 100% with no damage ticks', () => {
      const hp = new HPController();
      hp.initEnemyHp(10000);
      expect(hp.getEnemyHpPercentage(0)).toBe(100);
    });

    it('computes HP% from cumulative damage', () => {
      const hp = new HPController();
      hp.initEnemyHp(10000);
      hp.setEnemyDamageTicks([
        { frame: 100, damage: 2000 },
        { frame: 200, damage: 3000 },
      ]);
      // After frame 100: 2000 damage → 80%
      expect(hp.getEnemyHpPercentage(100)).toBe(80);
      // After frame 200: 5000 cumulative → 50%
      expect(hp.getEnemyHpPercentage(200)).toBe(50);
    });

    it('binary search finds correct tick for in-between frames', () => {
      const hp = new HPController();
      hp.initEnemyHp(10000);
      hp.setEnemyDamageTicks([
        { frame: 100, damage: 1000 },
        { frame: 300, damage: 2000 },
      ]);
      // Frame 150: only first tick applies → 9000/10000 = 90%
      expect(hp.getEnemyHpPercentage(150)).toBe(90);
      // Frame 50: no ticks yet → 100%
      expect(hp.getEnemyHpPercentage(50)).toBe(100);
    });

    it('clamps to 0% when damage exceeds max HP', () => {
      const hp = new HPController();
      hp.initEnemyHp(1000);
      hp.setEnemyDamageTicks([{ frame: 10, damage: 5000 }]);
      expect(hp.getEnemyHpPercentage(10)).toBe(0);
    });

    it('sorts unsorted ticks correctly', () => {
      const hp = new HPController();
      hp.initEnemyHp(10000);
      hp.setEnemyDamageTicks([
        { frame: 300, damage: 1000 },
        { frame: 100, damage: 2000 },
      ]);
      // Frame 100: 2000 → 80%
      expect(hp.getEnemyHpPercentage(100)).toBe(80);
      // Frame 300: 3000 cumulative → 70%
      expect(hp.getEnemyHpPercentage(300)).toBe(70);
    });
  });

  describe('operator HP tracking — healing', () => {
    it('tracks a single heal within max HP', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 1000);
      hp.addHeal({ frame: 120, targetSlotId: 'slot-0', sourceSlotId: 'slot-0', amount: 200 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively

      const summary = hp.getSlotHealSummary('slot-0');
      expect(summary).toBeDefined();
      // At max HP, all healing is overheal
      expect(summary!.totalHealing).toBe(0);
      expect(summary!.totalOverhealing).toBe(200);
    });

    it('tracks overhealing when heal exceeds max HP', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 1000);
      // Simulate HP at max — any heal is overheal since no damage mechanism yet
      hp.addHeal({ frame: 120, targetSlotId: 'slot-0', sourceSlotId: 'slot-1', amount: 500 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively

      const summary = hp.getSlotHealSummary('slot-0');
      expect(summary!.totalOverhealing).toBe(500);
    });

    it('builds HP graph with correct points', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 1000);
      hp.addHeal({ frame: 120, targetSlotId: 'slot-0', sourceSlotId: 'slot-1', amount: 100 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively

      const graph = hp.getSlotHpGraph('slot-0');
      // Graph starts at (0, 1000) and heal at frame 120 keeps at 1000 (overheal)
      expect(graph.length).toBe(2);
      expect(graph[0]).toEqual({ frame: 0, value: 1000 });
      expect(graph[1]).toEqual({ frame: 120, value: 1000 });
    });

    it('groups heals by target slot', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 1000);
      hp.configureSlotHp('slot-1', 2000);
      hp.addHeal({ frame: 100, targetSlotId: 'slot-0', sourceSlotId: 'slot-2', amount: 50 });
      hp.addHeal({ frame: 200, targetSlotId: 'slot-1', sourceSlotId: 'slot-2', amount: 75 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively

      expect(hp.getSlotHealSummary('slot-0')).toBeDefined();
      expect(hp.getSlotHealSummary('slot-1')).toBeDefined();
      expect(hp.getSlotHealSummary('slot-2')).toBeUndefined();
    });

    it('returns empty graph for unconfigured slot', () => {
      const hp = new HPController();
      expect(hp.getSlotHpGraph('slot-99')).toEqual([]);
    });

    it('skips slots with zero max HP', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 0);
      hp.addHeal({ frame: 100, targetSlotId: 'slot-0', sourceSlotId: 'slot-1', amount: 100 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively
      expect(hp.getSlotHealSummary('slot-0')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('resets all tracking state but keeps slot max HP', () => {
      const hp = new HPController();
      hp.configureSlotHp('slot-0', 1000);
      hp.initEnemyHp(10000);
      hp.setEnemyDamageTicks([{ frame: 100, damage: 500 }]);
      hp.addHeal({ frame: 120, targetSlotId: 'slot-0', sourceSlotId: 'slot-1', amount: 50 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively

      hp.clear();

      // Enemy HP cleared
      expect(hp.getEnemyHpPercentage(100)).toBeNull();
      // Heal state cleared
      expect(hp.getSlotHealSummary('slot-0')).toBeUndefined();
      expect(hp.getSlotHpGraph('slot-0')).toEqual([]);

      // But slot max HP is retained — can be re-used after reconfigure
      hp.initEnemyHp(10000);
      hp.addHeal({ frame: 100, targetSlotId: 'slot-0', sourceSlotId: 'slot-1', amount: 100 });
      // Phase 9c: hpController.finalize deleted — graph rebuilds reactively
      expect(hp.getSlotHealSummary('slot-0')).toBeDefined();
    });
  });
});
