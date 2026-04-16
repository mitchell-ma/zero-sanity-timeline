/**
 * @jest-environment jsdom
 */

/**
 * Embed roundtrip — verifies that buildSheetData produces valid state
 * that preserves skill columns. If skill columns disappear after
 * sharing and reloading, this test catches it.
 */

import { renderHook, act } from '@testing-library/react';
import { useApp } from '../../../app/useApp';
import { NounType } from '../../../dsl/semantics';
import { ColumnType, InteractionModeType } from '../../../consts/enums';
import { FPS } from '../../../utils/timeline';
import { findColumn, getMenuPayload } from '../helpers';
import type { AppResult } from '../helpers';
import type { MiniTimeline } from '../../../consts/viewTypes';
import { decodeEmbed } from '../../../utils/embedCodec';
import { INFLICTION_COLUMNS } from '../../../model/channels';

const SLOT_IDS = ['slot-0', 'slot-1', 'slot-2', 'slot-3'];
const SKILL_COLUMN_IDS = [NounType.BASIC_ATTACK, NounType.BATTLE, NounType.COMBO, NounType.ULTIMATE];

function getSkillColumns(app: AppResult, slotId: string) {
  return app.columns.filter(
    (c): c is MiniTimeline =>
      c.type === ColumnType.MINI_TIMELINE &&
      c.ownerEntityId === slotId &&
      SKILL_COLUMN_IDS.includes(c.columnId as NounType),
  );
}

describe('Embed roundtrip — skill columns preserved', () => {
  it('default loadout has 4 skill columns per operator', () => {
    const { result } = renderHook(() => useApp());

    for (const slotId of SLOT_IDS) {
      const skillCols = getSkillColumns(result.current, slotId);
      expect(skillCols.length).toBe(4);
      const columnIds = skillCols.map(c => c.columnId);
      for (const expected of SKILL_COLUMN_IDS) {
        expect(columnIds).toContain(expected);
      }
    }
  });

  it('buildSheetData produces visibleSkills with all skill types enabled', () => {
    const { result } = renderHook(() => useApp());

    const sheetData = result.current.buildSheetData();
    expect(sheetData.visibleSkills).toBeDefined();

    for (const slotId of SLOT_IDS) {
      const slotSkills = sheetData.visibleSkills[slotId];
      expect(slotSkills).toBeDefined();
      for (const key of SKILL_COLUMN_IDS) {
        expect(slotSkills[key]).toBe(true);
      }
    }
  });

  it('after adding events, buildSheetData still has valid visibleSkills', () => {
    const { result } = renderHook(() => useApp());
    act(() => { result.current.setInteractionMode(InteractionModeType.FREEFORM); });

    // Add a battle skill event
    const bsCol = findColumn(result.current, 'slot-0', NounType.BATTLE);
    expect(bsCol).toBeDefined();
    const payload = getMenuPayload(result.current, bsCol!, 2 * FPS);
    act(() => {
      result.current.handleAddEvent(payload.ownerEntityId, payload.columnId, payload.atFrame, payload.defaultSkill);
    });

    // Skill columns still exist
    for (const slotId of SLOT_IDS) {
      expect(getSkillColumns(result.current, slotId).length).toBe(4);
    }

    // buildSheetData has valid visibleSkills
    const sheetData = result.current.buildSheetData();
    for (const slotId of SLOT_IDS) {
      const slotSkills = sheetData.visibleSkills[slotId];
      expect(slotSkills).toBeDefined();
      for (const key of SKILL_COLUMN_IDS) {
        expect(slotSkills[key]).toBe(true);
      }
    }
  });

  it('decoded URL events on non-skill columns get creationInteractionMode=FREEFORM (draggable)', async () => {
    // Polyfill CompressionStream/DecompressionStream for jsdom (uses Node's zlib).
    // Same approach as src/tests/unit/sharing.test.ts.
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
    if (typeof (globalThis as any).TextDecoder === 'undefined') {
      const util = require('util');
      (globalThis as any).TextDecoder = util.TextDecoder;
      (globalThis as any).TextEncoder = util.TextEncoder;
    }
    if (typeof (globalThis as any).DecompressionStream === 'undefined') {
      const zlib = require('zlib');
      const mockStream = (transform: (b: Buffer) => Buffer) => {
        const chunks: Buffer[] = [];
        let resolveData: (out: Buffer) => void = () => {};
        const dataPromise = new Promise<Buffer>((r) => { resolveData = r; });
        return {
          writable: { getWriter: () => ({
            write: (chunk: Uint8Array) => { chunks.push(Buffer.from(chunk)); },
            close: () => { resolveData(transform(Buffer.concat(chunks))); },
          })},
          readable: { getReader: () => {
            let done = false;
            return { read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new Uint8Array(await dataPromise) };
            }};
          }},
        };
      };
      class DS { constructor() { Object.assign(this, mockStream((b) => zlib.inflateRawSync(b))); } }
      (globalThis as any).DecompressionStream = DS;
    }
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

    // The user's saved URL state. Without the embedCodec fix, decoded
    // HEAT_INFLICTION events lacked creationInteractionMode → engine pipeline
    // created derived events without the freeform marker → view set
    // notDraggable=true and stripped resize handles.
    const userUrlData = 'ZclPSgMxFMfx9zL_HB0QiuC24F4QvcDrNK2PiSlMo9sh0KBCmZQh6gkEwbv0MJ7AU7g2yuDG1ffH5yeqSnm78U9henE1vSyonUvFVFAjm9uWM9KGVKlI3pEh1sXw4Df2vp_4nRts8MP5zgfXh0e7Pf2jYLeRzItX7tn981Xvfv34WpLpWC8U14ZX-mSh6Ib1sqtZz2W77mZkmmpGa647MobqBlJEFJhgmkEKIHKAAhBBHICIQ4xDJOMlcleWH4ifk9j92NefJodHZ_iexHxlsZHf8sgA3w';
    const { sheetData } = await decodeEmbed(userUrlData, []);

    const heatEvents = sheetData.events.filter(ev => ev.columnId === INFLICTION_COLUMNS.HEAT);
    expect(heatEvents.length).toBeGreaterThan(0);
    for (const heat of heatEvents) {
      expect(heat.creationInteractionMode).toBe(InteractionModeType.FREEFORM);
    }

  });

  it('user URL scenario: full pipeline output for the heat infliction column', async () => {
    // Polyfill same as above
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
    if (typeof (globalThis as any).TextDecoder === 'undefined') {
      const util = require('util');
      (globalThis as any).TextDecoder = util.TextDecoder;
      (globalThis as any).TextEncoder = util.TextEncoder;
    }
    if (typeof (globalThis as any).DecompressionStream === 'undefined') {
      const zlib = require('zlib');
      const mockStream = (transform: (b: Buffer) => Buffer) => {
        const chunks: Buffer[] = [];
        let resolveData: (out: Buffer) => void = () => {};
        const dataPromise = new Promise<Buffer>((r) => { resolveData = r; });
        return {
          writable: { getWriter: () => ({
            write: (chunk: Uint8Array) => { chunks.push(Buffer.from(chunk)); },
            close: () => { resolveData(transform(Buffer.concat(chunks))); },
          })},
          readable: { getReader: () => {
            let done = false;
            return { read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new Uint8Array(await dataPromise) };
            }};
          }},
        };
      };
      class DS { constructor() { Object.assign(this, mockStream((b) => zlib.inflateRawSync(b))); } }
      (globalThis as any).DecompressionStream = DS;
    }
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

    const userUrlData = 'ZclPSgMxFMfx9zL_HB0QiuC24F4QvcDrNK2PiSlMo9sh0KBCmZQh6gkEwbv0MJ7AU7g2yuDG1ffH5yeqSnm78U9henE1vSyonUvFVFAjm9uWM9KGVKlI3pEh1sXw4Df2vp_4nRts8MP5zgfXh0e7Pf2jYLeRzItX7tn981Xvfv34WpLpWC8U14ZX-mSh6Ib1sqtZz2W77mZkmmpGa647MobqBlJEFJhgmkEKIHKAAhBBHICIQ4xDJOMlcleWH4ifk9j92NefJodHZ_iexHxlsZHf8sgA3w';
    const { sheetData } = await decodeEmbed(userUrlData, []);

    // Render through the full app pipeline by dropping events into a fresh useApp.
    const { result } = renderHook(() => useApp());
    act(() => {
      result.current.setInteractionMode(InteractionModeType.FREEFORM);
      // Switch to Loadout 14 3 — the same operators (LAEVATAIN in slot 3)
      // by directly seeding raw events into the app's state via handleAddEvent.
    });
    // Replay the URL events through handleAddEvent so the engine pipeline runs.
    for (const ev of sheetData.events) {
      act(() => {
        result.current.handleAddEvent(
          ev.ownerEntityId, ev.columnId, ev.startFrame,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: ev.id, name: ev.name, segments: ev.segments } as any,
        );
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeTimelinePresentation } = require('../../../controller/timeline/eventPresentationController');
    type VmEntry = { column: { ownerEntityId?: string; columnId?: string; matchColumnIds?: string[] }; events: Array<{ uid: string; startFrame: number; eventStatus?: string; segments: Array<{ properties: { duration: number; name?: string } }> }> };
    const vms = computeTimelinePresentation(result.current.allProcessedEvents, result.current.columns) as Map<string, VmEntry>;
    const heatVm = Array.from(vms.values()).find((vm: VmEntry) =>
      vm.column.ownerEntityId === 'enemy' &&
      (vm.column.matchColumnIds?.includes(INFLICTION_COLUMNS.HEAT) || vm.column.columnId === INFLICTION_COLUMNS.HEAT),
    );

    // eslint-disable-next-line no-console
    console.log('Heat column events (rendered view model):', JSON.stringify(
      heatVm?.events.map(ev => ({
        uid: ev.uid,
        startFrame: ev.startFrame,
        eventStatus: ev.eventStatus,
        segs: ev.segments.map(s => `${s.properties.duration}f:${s.properties.name ?? '-'}`),
      })),
      null, 2,
    ));
  });
});
