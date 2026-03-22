/**
 * Tests for hover line bounds checking — the hover marker should only render
 * when the mouse is within the scroll body along the frame axis.
 *
 * Bug: In vertical mode, when the timeline was scrolled down, the hover line
 * could appear in the header area because relFrame (which includes scrollTop)
 * was positive even though the mouse was above the scroll container.
 *
 * Fix: Check that the mouse client position is within the scroll container
 * bounds before computing the hover line.
 */

/**
 * Pure reimplementation of the hover line bounds check from CombatPlanner.
 * Returns whether the hover line should be computed (mouse is within scroll body).
 */
function isMouseInScrollBody(
  frameClient: number,
  scrollRectStart: number,
  scrollRectEnd: number,
): boolean {
  return frameClient >= scrollRectStart && frameClient <= scrollRectEnd;
}

/**
 * Pure reimplementation of relFrame calculation from CombatPlanner.
 * Returns the content-space pixel offset along the frame axis.
 */
function computeRelFrame(
  frameClient: number,
  scrollRectStart: number,
  scrollPos: number,
  bodyTop: number,
): number {
  return frameClient - scrollRectStart + scrollPos - bodyTop;
}

describe('hover line bounds check', () => {
  // Simulate a vertical-mode scroll container:
  // scrollRect.top = 200 (below loadout + header rows)
  // scrollRect.bottom = 800
  const scrollTop = 200;
  const scrollBottom = 800;

  test('mouse inside scroll body allows hover line', () => {
    expect(isMouseInScrollBody(400, scrollTop, scrollBottom)).toBe(true);
  });

  test('mouse at scroll body top edge allows hover line', () => {
    expect(isMouseInScrollBody(200, scrollTop, scrollBottom)).toBe(true);
  });

  test('mouse at scroll body bottom edge allows hover line', () => {
    expect(isMouseInScrollBody(800, scrollTop, scrollBottom)).toBe(true);
  });

  test('mouse above scroll body (in header area) blocks hover line', () => {
    expect(isMouseInScrollBody(150, scrollTop, scrollBottom)).toBe(false);
  });

  test('mouse below scroll body blocks hover line', () => {
    expect(isMouseInScrollBody(850, scrollTop, scrollBottom)).toBe(false);
  });
});

describe('hover line header bug scenario', () => {
  // The original bug: when scrolled down, relFrame could be positive
  // even with the mouse in the header area.
  //
  // Scenario: scroll container starts at clientY=200, user has scrolled
  // down 300px (scrollTop=300). Mouse is at clientY=150 (in header).
  const scrollRectTop = 200;
  const scrollRectBottom = 800;
  const scrollPos = 300;
  const bodyTop = 0;

  test('mouse in header with scrolled timeline: relFrame is positive (old bug)', () => {
    const mouseY = 150; // above scroll container (in header)
    const relFrame = computeRelFrame(mouseY, scrollRectTop, scrollPos, bodyTop);
    // relFrame = 150 - 200 + 300 - 0 = 250 (positive! would incorrectly show hover line)
    expect(relFrame).toBe(250);
  });

  test('mouse in header with scrolled timeline: bounds check blocks it (fix)', () => {
    const mouseY = 150;
    // The bounds check catches this before relFrame is ever used
    expect(isMouseInScrollBody(mouseY, scrollRectTop, scrollRectBottom)).toBe(false);
  });

  test('mouse in body with scrolled timeline: bounds check allows it', () => {
    const mouseY = 400; // inside scroll container
    expect(isMouseInScrollBody(mouseY, scrollRectTop, scrollRectBottom)).toBe(true);
    const relFrame = computeRelFrame(mouseY, scrollRectTop, scrollPos, bodyTop);
    // relFrame = 400 - 200 + 300 - 0 = 500
    expect(relFrame).toBe(500);
    expect(relFrame).toBeGreaterThan(0);
  });

  test('mouse at top of scroll body with no scroll: relFrame is 0', () => {
    const mouseY = scrollRectTop;
    expect(isMouseInScrollBody(mouseY, scrollRectTop, scrollRectBottom)).toBe(true);
    const relFrame = computeRelFrame(mouseY, scrollRectTop, 0, bodyTop);
    // relFrame = 200 - 200 + 0 - 0 = 0 (not > 0, so hover line is cleared — correct)
    expect(relFrame).toBe(0);
  });
});

describe('horizontal mode bounds check', () => {
  // In horizontal mode, the frame axis is X (left/right).
  // scrollRect.left = 100, scrollRect.right = 900
  const scrollLeft = 100;
  const scrollRight = 900;

  test('mouse inside scroll body (horizontal)', () => {
    expect(isMouseInScrollBody(500, scrollLeft, scrollRight)).toBe(true);
  });

  test('mouse left of scroll body (horizontal header area)', () => {
    expect(isMouseInScrollBody(50, scrollLeft, scrollRight)).toBe(false);
  });

  test('mouse right of scroll body (horizontal)', () => {
    expect(isMouseInScrollBody(950, scrollLeft, scrollRight)).toBe(false);
  });
});
