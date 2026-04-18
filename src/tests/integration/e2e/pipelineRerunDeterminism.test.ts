/**
 * @jest-environment jsdom
 *
 * Pipeline determinism — two fresh engine instances running identical input
 * must produce identical `allProcessedEvents` output.
 *
 * Regression target: the interpreter carries stateful fields
 * (`firedHpThresholds`, `triggerUsageCount`) and the `_checkHpThresholds`
 * path is now invoked at `EVENT_START` as well as at frame 0. If those
 * sets leak across pipeline re-entries (e.g. shared module-level state,
 * ref pooling mistakes), two runs with the same raw events produce
 * diverging outputs — e.g. second run misses HP-threshold buffs that the
 * first run emitted.
 *
 * The `useApp` hook does not expose an explicit "re-run pipeline" API
 * (all derivations run via React useMemo), so we take the cleanest path:
 * mount `useApp` twice via two `renderHook` calls with identical setup and
 * compare the serialized outputs. Each mount instantiates a fresh engine
 * state, so any non-determinism in engine state traversal surfaces here.
 *
 * UIDs are synthesized per-event with a running counter and will differ
 * between mounts even for structurally identical runs; they're stripped
 * before comparison.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType, ClauseEvaluationType } from '../../../dsl/semantics';
import { InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, REACTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../../view/InformationPane';
import type { LoadoutProperties } from '../../../view/InformationPane';
import {
  SLOT, gearLoadout, placeSkill,
} from '../gears/helpers';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const WULFGARD_ID: string = require('../../../model/game-data/operators/wulfgard/wulfgard.json').id;
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const ENDMINISTRATOR_ID: string = require(
  '../../../model/game-data/operators/endministrator/endministrator.json',
).id;
const ESSENCE_DISINTEGRATION_TALENT_JSON = require(
  '../../../model/game-data/operators/endministrator/talents/talent-essence-disintegration-talent.json',
);
const ESSENCE_DISINTEGRATION_ID: string = ESSENCE_DISINTEGRATION_TALENT_JSON.properties.id;
/* eslint-enable @typescript-eslint/no-require-imports */

const MORDVOLT_ARMOR_ID = 'MORDVOLT_INSULATION_VEST_T1';
const MORDVOLT_GLOVES_ID = 'MORDVOLT_INSULATION_GLOVES_T1';
const MORDVOLT_KIT_ID = 'MORDVOLT_INSULATION_BATTERY_T1';

const HOT_WORK_ARMOR_ID = 'HOT_WORK_EXO_RIG';
const HOT_WORK_GLOVES_ID = 'HOT_WORK_GAUNTLETS_T1';
const HOT_WORK_KIT_ID = 'HOT_WORK_POWER_BANK';

const SLOT_ENDMINISTRATOR = 'slot-0';

// Strip per-mount generated identifiers from a JSON-serialized
// `allProcessedEvents` payload. Expected to diverge between mounts even for
// structurally identical runs:
//   - `uid` — running counter + GUID, synthesized at event creation.
//   - `sourceFrameKey` — references the source event's uid, so it inherits
//     the uid drift.
//   - `triggerEventUid` — references the trigger event's uid, ditto.
// Anything else that diverges indicates a real non-determinism bug.
function stripVolatileIds(json: string): string {
  return json
    .replace(/"uid":"[^"]*"/g, '"uid":"<stripped>"')
    .replace(/"sourceFrameKey":"[^"]*"/g, '"sourceFrameKey":"<stripped>"')
    .replace(/"triggerEventUid":"[^"]*"/g, '"triggerEventUid":"<stripped>"');
}

function snapshot(app: AppResult): string {
  return stripVolatileIds(JSON.stringify(app.allProcessedEvents));
}

beforeEach(() => { localStorage.clear(); });

describe('pipeline determinism — identical setup yields identical allProcessedEvents', () => {
  it('Mordvolt Insulation HP-gate buff: two fresh mounts produce byte-equal output', () => {
    // HP-threshold gate exercises _checkHpThresholds at EVENT_START. The 1s
    // buff duration means re-fire is needed for every subsequent skill.
    const runOnce = () => {
      const view = renderHook(() => useApp());
      act(() => { view.result.current.handleSwapOperator(SLOT, WULFGARD_ID); });
      act(() => {
        view.result.current.handleLoadoutChange(
          SLOT,
          gearLoadout(MORDVOLT_ARMOR_ID, MORDVOLT_GLOVES_ID, MORDVOLT_KIT_ID),
        );
      });
      placeSkill(view.result.current, SLOT, NounType.BATTLE, 1 * FPS);
      placeSkill(view.result.current, SLOT, NounType.BATTLE, 5 * FPS);
      return snapshot(view.result.current);
    };

    const snap1 = runOnce();
    const snap2 = runOnce();
    expect(snap2).toBe(snap1);
  });

  it('cross-element reaction (freeform HEAT + CRYO inflictions): two mounts produce byte-equal output', () => {
    // Freeform inflictions exercise the cross-element reaction derivation
    // path (HEAT + CRYO inflict overlap consumed into SOLIDIFICATION when a
    // subsequent hit resolves). A non-deterministic ordering here would
    // surface as different reaction or consumption outputs across runs.
    const runOnce = () => {
      const view = renderHook(() => useApp());
      act(() => { view.result.current.handleSwapOperator(SLOT, LAEVATAIN_ID); });
      act(() => {
        view.result.current.handleLoadoutChange(
          SLOT,
          gearLoadout(HOT_WORK_ARMOR_ID, HOT_WORK_GLOVES_ID, HOT_WORK_KIT_ID),
        );
      });
      act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });
      act(() => {
        view.result.current.handleAddEvent(
          ENEMY_ID, REACTION_COLUMNS.COMBUSTION, 1 * FPS,
          {
            name: REACTION_COLUMNS.COMBUSTION,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceEntityId: LAEVATAIN_ID,
          },
        );
      });
      act(() => {
        view.result.current.handleAddEvent(
          ENEMY_ID, REACTION_COLUMNS.SOLIDIFICATION, 2 * FPS,
          {
            name: REACTION_COLUMNS.SOLIDIFICATION,
            segments: [{ properties: { duration: 20 * FPS } }],
            sourceEntityId: LAEVATAIN_ID,
          },
        );
      });
      placeSkill(view.result.current, SLOT, NounType.BATTLE, 3 * FPS);
      return snapshot(view.result.current);
    };

    const snap1 = runOnce();
    const snap2 = runOnce();
    expect(snap2).toBe(snap1);
  });

  it('Essence Disintegration (FIRST_MATCH talent): two mounts produce byte-equal output', () => {
    // Sanity: the talent we're exercising actually carries FIRST_MATCH.
    expect(ESSENCE_DISINTEGRATION_TALENT_JSON.onTriggerClauseType).toBe(
      ClauseEvaluationType.FIRST_MATCH,
    );

    const runOnce = () => {
      const view = renderHook(() => useApp());
      act(() => { view.result.current.handleSwapOperator(SLOT_ENDMINISTRATOR, ENDMINISTRATOR_ID); });
      const stats: LoadoutProperties = {
        ...DEFAULT_LOADOUT_PROPERTIES,
        operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, potential: 2 },
      };
      act(() => { view.result.current.handleStatsChange(SLOT_ENDMINISTRATOR, stats); });
      act(() => { view.result.current.setInteractionMode(InteractionModeType.FREEFORM); });

      // Place Combo then Battle skill so the FIRST_MATCH trigger on the
      // talent has a CONSUME ORIGINIUM_CRYSTAL event to latch onto.
      const comboCol = findColumn(view.result.current, SLOT_ENDMINISTRATOR, NounType.COMBO);
      const comboPayload = getMenuPayload(view.result.current, comboCol!, 2 * FPS);
      act(() => {
        view.result.current.handleAddEvent(
          comboPayload.ownerEntityId, comboPayload.columnId,
          comboPayload.atFrame, comboPayload.defaultSkill,
        );
      });
      const battleCol = findColumn(view.result.current, SLOT_ENDMINISTRATOR, NounType.BATTLE);
      const battlePayload = getMenuPayload(view.result.current, battleCol!, 5 * FPS);
      act(() => {
        view.result.current.handleAddEvent(
          battlePayload.ownerEntityId, battlePayload.columnId,
          battlePayload.atFrame, battlePayload.defaultSkill,
        );
      });
      return {
        snap: snapshot(view.result.current),
        buffCount: view.result.current.allProcessedEvents.filter(
          ev => ev.columnId === ESSENCE_DISINTEGRATION_ID
            && ev.ownerEntityId === SLOT_ENDMINISTRATOR,
        ).length,
      };
    };

    const run1 = runOnce();
    const run2 = runOnce();
    expect(run2.snap).toBe(run1.snap);
    // FIRST_MATCH semantics: exactly one talent buff, stable across runs.
    expect(run1.buffCount).toBe(1);
    expect(run2.buffCount).toBe(1);
  });
});
