/**
 * @jest-environment jsdom
 */

/* eslint-disable testing-library/no-container, testing-library/no-node-access, import/first */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

function mockMakeRow(key: string, absoluteFrame: number, damage: number | null) {
  return {
    key,
    absoluteFrame,
    label: `hit-${key}`,
    columnKey: 'slot0-battle',
    ownerId: 'slot0',
    columnId: 'BATTLE',
    eventUid: `ev-${key}`,
    segmentIndex: 0,
    frameIndex: parseInt(key),
    damage,
    multiplier: damage != null ? 1.5 : null,
    segmentLabel: '1',
    skillName: 'TEST_SKILL',
    hpRemaining: null,
    params: null,
  };
}

const mockTestRows = [
  mockMakeRow('0', 0, 1000),
  mockMakeRow('1', 60, 2000),
  mockMakeRow('2', 120, 3000),
  mockMakeRow('3', 180, null),   // no-damage row
  mockMakeRow('4', 240, 4000),
];

jest.mock('../../controller/calculation/calculationController', () => ({
  runCalculation: () => ({ rows: mockTestRows, aggregatedStats: {}, statusQuery: { query: () => [] } }),
}));

jest.mock('../../controller/calculation/damageTableBuilder', () => {
  const actual = jest.requireActual('../../controller/calculation/damageTableBuilder');
  return {
    ...actual,
    buildDamageTableColumns: () => [{ key: 'slot0-battle', label: 'Battle', ownerId: 'slot0', columnId: 'BATTLE', color: '#f0a040' }],
    computeDamageStatistics: () => ({
      teamTotalDamage: 10000,
      operators: [{ ownerId: 'slot0', totalDamage: 10000, teamPct: 1 }],
      columnTotals: new Map(),
      bossMaxHp: null,
      highestTick: null,
      teamDps: null,
      timeToKill: null,
      highestBurst: null,
    }),
  };
});

jest.mock('../../controller/calculation/enemyRegistry', () => ({
  getModelEnemy: () => null,
}));

jest.mock('../../utils/loadoutRegistry', () => ({
  OPERATORS: [],
}));

jest.mock('../../locales/locale', () => ({
  t: (key: string) => key,
}));

jest.mock('../../controller/gameDataStore', () => ({
  getAllSkillLabels: () => ({}),
  getAllStatusLabels: () => ({}),
  getAllInflictionLabels: () => ({}),
  getAllOperatorIds: () => [],
  getAllOperatorStatuses: () => [],
  getOperatorBase: () => undefined,
  getOperatorSkills: () => undefined,
  getOperatorStatuses: () => [],
  getStatusElementMap: () => new Map(),
  getStatusById: () => undefined,
  getWeapon: () => undefined,
  getGearPiece: () => undefined,
  getConsumableEntry: () => undefined,
  getTacticalEntry: () => undefined,
}));

jest.mock('../../utils/timeline', () => ({
  frameToPx: (frame: number, zoom: number) => frame * zoom,
  timelineHeight: () => 2000,
  frameToTimeLabelPrecise: (frame: number) => `${(frame / 60).toFixed(1)}s`,
  pxPerFrame: (zoom: number) => zoom,
  secondsToFrames: (s: string) => parseFloat(s) * 60,
}));

// Must import CombatSheet after mocks are set up
import CombatSheet from '../../view/CombatSheet';

import type { Slot } from '../../controller/timeline/columnBuilder';
import type { Enemy } from '../../consts/viewTypes';

const DEFAULT_PROPS = {
  slots: [{ slotId: 'slot0', operator: { name: 'TestOp', color: '#f0a040' } }] as unknown as Slot[],
  events: [],
  columns: [],
  enemy: { id: 'test', name: 'Test', tier: 'normal', statuses: [], staggerHp: 0, staggerNodes: 0 } as unknown as Enemy,
  loadoutProperties: {},
  zoom: 1,
  loadoutRowHeight: 60,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Simulate a marquee drag from (x1,y1) to (x2,y2) on the scroll container. */
function dragMarquee(container: HTMLElement, y1: number, y2: number) {
  const scrollEl = container.querySelector('.dmg-table-scroll')!;

  // Mock getBoundingClientRect on the scroll element
  jest.spyOn(scrollEl, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, bottom: 2000, right: 800,
    width: 800, height: 2000, x: 0, y: 0, toJSON: () => {},
  });

  fireEvent.mouseDown(scrollEl, { clientX: 100, clientY: y1, button: 0 });
  // Move past threshold
  fireEvent(document, new MouseEvent('mousemove', { clientX: 100, clientY: y1 + 5, bubbles: true }));
  // Move to target
  fireEvent(document, new MouseEvent('mousemove', { clientX: 100, clientY: y2, bubbles: true }));

  return scrollEl;
}

function releaseMouse() {
  fireEvent(document, new MouseEvent('mouseup', { bubbles: true }));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CombatSheet marquee selection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders rows without selection initially', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} />);
    const rows = container.querySelectorAll('.dmg-row');
    expect(rows.length).toBe(mockTestRows.length);
    expect(container.querySelectorAll('.dmg-row--selected').length).toBe(0);
    expect(container.querySelector('.dmg-marquee-summary')).toBeNull();
  });

  it('shows marquee rectangle while dragging', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} />);
    dragMarquee(container, 0, 100);

    const marquee = container.querySelector('.selection-marquee');
    expect(marquee).not.toBeNull();

    releaseMouse();
    expect(container.querySelector('.selection-marquee')).toBeNull();
  });

  it('selects rows intersecting the marquee and sums their damage', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);

    // In compact mode, rows are at top = index * 22 (ROW_HEIGHT)
    // Row 0: top=0, Row 1: top=22, Row 2: top=44, Row 3: top=66, Row 4: top=88
    // Drag from y=10 to y=55 should cover rows 0,1,2 (top 0-44, height 22 each)
    dragMarquee(container, 10, 55);

    const selected = container.querySelectorAll('.dmg-row--selected');
    expect(selected.length).toBe(3);

    // Summary should show: rows 0 (1000) + 1 (2000) + 2 (3000) = 6000
    const summary = container.querySelector('.dmg-marquee-summary');
    expect(summary).not.toBeNull();
    expect(summary!.querySelector('.dmg-marquee-summary-label')!.textContent).toBe('3 rows');
    expect(summary!.querySelector('.dmg-marquee-summary-value')!.textContent).toBe('6000');

    releaseMouse();
  });

  it('excludes null-damage rows from the sum but still selects them visually', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);

    // Drag to cover rows 2 (3000), 3 (null), 4 (4000): tops 44, 66, 88
    // Row 1 (top=22, bottom=44) also touches the boundary at y=44
    dragMarquee(container, 44, 110);

    const selected = container.querySelectorAll('.dmg-row--selected');
    expect(selected.length).toBe(4);

    // Summary: only rows with damage — 2000 + 3000 + 4000 = 9000, count=3
    const summary = container.querySelector('.dmg-marquee-summary');
    expect(summary).not.toBeNull();
    expect(summary!.querySelector('.dmg-marquee-summary-label')!.textContent).toBe('3 rows');
    expect(summary!.querySelector('.dmg-marquee-summary-value')!.textContent).toBe('9000');

    releaseMouse();
  });

  it('adds user-select: none class during drag', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);
    const scrollEl = container.querySelector('.dmg-table-scroll')!;

    expect(scrollEl.classList.contains('dmg-table-scroll--selecting')).toBe(false);

    dragMarquee(container, 0, 50);
    expect(scrollEl.classList.contains('dmg-table-scroll--selecting')).toBe(true);

    releaseMouse();
    expect(scrollEl.classList.contains('dmg-table-scroll--selecting')).toBe(false);
  });

  it('clears marquee rectangle on mouseup', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);
    dragMarquee(container, 0, 100);
    expect(container.querySelector('.selection-marquee')).not.toBeNull();

    releaseMouse();
    expect(container.querySelector('.selection-marquee')).toBeNull();
  });

  it('keeps selection visible after mouseup (until next drag)', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);
    dragMarquee(container, 0, 30);
    releaseMouse();

    // Selected rows and summary persist
    expect(container.querySelectorAll('.dmg-row--selected').length).toBeGreaterThan(0);
    expect(container.querySelector('.dmg-marquee-summary')).not.toBeNull();
  });

  it('ctrl+click toggles individual row selection', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);
    const rows = container.querySelectorAll('.dmg-row');

    // Ctrl+click first row — selects it
    fireEvent.click(rows[0], { ctrlKey: true });
    expect(rows[0].classList.contains('dmg-row--selected')).toBe(true);
    expect(container.querySelector('.dmg-marquee-summary-label')!.textContent).toBe('1 rows');

    // Ctrl+click third row — adds to selection
    fireEvent.click(rows[2], { ctrlKey: true });
    expect(rows[0].classList.contains('dmg-row--selected')).toBe(true);
    expect(rows[2].classList.contains('dmg-row--selected')).toBe(true);
    // 1000 + 3000 = 4000
    expect(container.querySelector('.dmg-marquee-summary-value')!.textContent).toBe('4000');

    // Ctrl+click first row again — deselects it
    fireEvent.click(rows[0], { ctrlKey: true });
    expect(rows[0].classList.contains('dmg-row--selected')).toBe(false);
    expect(rows[2].classList.contains('dmg-row--selected')).toBe(true);
    expect(container.querySelector('.dmg-marquee-summary-value')!.textContent).toBe('3000');
  });

  it('plain left click clears selection', () => {
    const { container } = render(<CombatSheet {...DEFAULT_PROPS} compact />);
    const scrollEl = container.querySelector('.dmg-table-scroll')!;

    jest.spyOn(scrollEl, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, bottom: 2000, right: 800,
      width: 800, height: 2000, x: 0, y: 0, toJSON: () => {},
    });

    // Select some rows first via marquee
    dragMarquee(container, 0, 55);
    releaseMouse();
    expect(container.querySelectorAll('.dmg-row--selected').length).toBeGreaterThan(0);

    // Plain click (no drag, no ctrl) → clears
    fireEvent.mouseDown(scrollEl, { clientX: 100, clientY: 10, button: 0 });
    fireEvent(document, new MouseEvent('mouseup', { bubbles: true }));
    expect(container.querySelectorAll('.dmg-row--selected').length).toBe(0);
    expect(container.querySelector('.dmg-marquee-summary')).toBeNull();
  });
});
