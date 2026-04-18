/**
 * @jest-environment jsdom
 *
 * Reactive Trigger actorSlotId Threading
 *
 * Covers the `actorSlotId` parameter threaded through
 * `dispatchClauseFrame` (eventInterpretorController.ts around line ~850).
 * When a wrapper event is owned by the enemy (e.g. a freeform VULNERABLE
 * infliction placed on the enemy column with `sourceEntityId` pointing at
 * the acting operator), reactive triggers whose subject filter is
 * `THIS OPERATOR` must compare against the ACTOR's slot — not the event
 * OWNER (ENEMY).
 *
 * Positive case: Æthertech gear set has an onTriggerClause with
 * `THIS OPERATOR APPLY STATUS INFLICTION VULNERABLE to ENEMY`. When the
 * wearer applies Vulnerable, the buff is granted. The existing
 * `gears/aethertech.test.ts::freeform Vulnerable applied by this operator`
 * covers that.
 *
 * Negative case (this file's primary coverage gap): when the freeform
 * VULNERABLE event's source is a DIFFERENT operator, the wearer's gear
 * trigger must NOT fire — the `THIS OPERATOR` subject filter must reject
 * the routed actor slot.
 */
import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { InteractionModeType } from '../../../consts/enums';
import { ENEMY_ID, PHYSICAL_INFLICTION_COLUMNS } from '../../../model/channels';
import { FPS } from '../../../utils/timeline';
import { gearLoadout } from '../gears/helpers';
import type { AppResult } from '../helpers';

/* eslint-disable @typescript-eslint/no-require-imports */
const AKEKURI_ID: string = require('../../../model/game-data/operators/akekuri/akekuri.json').id;
const LAEVATAIN_ID: string = require('../../../model/game-data/operators/laevatain/laevatain.json').id;
const AETHERTECH_BUFF = require(
  '../../../model/game-data/gears/aethertech/statuses/status-aethertech.json',
).properties;
/* eslint-enable @typescript-eslint/no-require-imports */

const SLOT_WEARER = 'slot-0';

// Aethertech 3-piece gear pieces (identical to gears/aethertech.test.ts).
const ARMOR_ID = 'THERTECH_PLATING';
const GLOVES_ID = 'THERTECH_GLOVES';
const KIT_ID = 'THERTECH_STABILIZER_T1';

beforeEach(() => { localStorage.clear(); });

function setupAethertechWearer() {
  const view = renderHook(() => useApp());
  // Put Akekuri on slot-0 and equip the 3-piece Aethertech set.
  act(() => { view.result.current.handleSwapOperator(SLOT_WEARER, AKEKURI_ID); });
  act(() => {
    view.result.current.handleLoadoutChange(
      SLOT_WEARER, gearLoadout(ARMOR_ID, GLOVES_ID, KIT_ID),
    );
  });
  return view;
}

function placeFreeformVulnerable(app: AppResult, atFrame: number, sourceEntityId: string | undefined) {
  act(() => { app.setInteractionMode(InteractionModeType.FREEFORM); });
  act(() => {
    app.handleAddEvent(
      ENEMY_ID,
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
      atFrame,
      {
        name: PHYSICAL_INFLICTION_COLUMNS.VULNERABLE,
        segments: [{ properties: { duration: 20 * FPS } }],
        ...(sourceEntityId !== undefined ? { sourceEntityId } : {}),
      },
    );
  });
}

describe('Reactive trigger actorSlotId — THIS OPERATOR subject filter', () => {
  it('Positive: freeform Vulnerable sourced from the wearer fires the gear trigger', () => {
    // Sanity anchor for the positive case — gears/aethertech.test.ts covers
    // this same path, mirrored here so the negative assertion below has a
    // verified counterpart in-file.
    const { result } = setupAethertechWearer();
    placeFreeformVulnerable(result.current, 1 * FPS, AKEKURI_ID);

    const buffs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === AETHERTECH_BUFF.id && ev.ownerEntityId === SLOT_WEARER,
    );
    expect(buffs.length).toBeGreaterThanOrEqual(1);
  });

  it('Negative: freeform Vulnerable sourced from a different operator does NOT fire the gear trigger', () => {
    // After swapping Akekuri onto slot-0, the previous slot-0 operator
    // (Laevatain) lands on slot-1 — so LAEVATAIN_ID resolves to a
    // different slot than the gear wearer. The gear's `THIS OPERATOR`
    // subject filter must reject this actor.
    const { result } = setupAethertechWearer();
    placeFreeformVulnerable(result.current, 1 * FPS, LAEVATAIN_ID);

    const buffs = result.current.allProcessedEvents.filter(
      ev => ev.columnId === AETHERTECH_BUFF.id && ev.ownerEntityId === SLOT_WEARER,
    );
    expect(buffs).toHaveLength(0);
  });
});
