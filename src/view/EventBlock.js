import { frameToPx, TOTAL_FRAMES } from '../utils/timeline';

// hex -> rgba helper
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function stripedBg(color) {
  return `repeating-linear-gradient(
    -45deg,
    ${hexAlpha(color, 0.18)} 0px,
    ${hexAlpha(color, 0.18)} 2px,
    transparent 2px,
    transparent 8px
  )`;
}

export default function EventBlock({
  event,
  color,
  zoom,
  onDragStart,
  onContextMenu,
  onDoubleClick,
}) {
  const { id, startFrame, activeDuration, lingeringDuration, cooldownDuration } = event;

  const hasLinger = lingeringDuration > 0;
  const hasCooldown = cooldownDuration > 0;

  const activeStart  = startFrame;
  const lingerStart  = startFrame + activeDuration;
  const coolStart    = lingerStart + lingeringDuration;
  const totalEnd     = coolStart + cooldownDuration;

  // Clamp to timeline
  const clampedActiveEnd  = Math.min(lingerStart, TOTAL_FRAMES);
  const clampedLingerEnd  = Math.min(coolStart, TOTAL_FRAMES);
  const clampedCoolEnd    = Math.min(totalEnd, TOTAL_FRAMES);

  const activeH  = frameToPx(clampedActiveEnd - activeStart, zoom);
  const lingerH  = hasLinger  ? frameToPx(clampedLingerEnd - lingerStart, zoom) : 0;
  const coolH    = hasCooldown ? frameToPx(clampedCoolEnd - coolStart, zoom) : 0;

  const topPx = frameToPx(activeStart, zoom);

  if (activeH <= 0 && lingerH <= 0) return null;

  const activeRadius  = !hasLinger && !hasCooldown ? '2px' : '2px 2px 0 0';
  const lingerRadius  = !hasCooldown ? '0 0 2px 2px' : '0';
  const coolRadius    = '0 0 2px 2px';

  return (
    <div
      className="event-wrap"
      style={{ top: topPx, height: frameToPx(clampedCoolEnd - activeStart, zoom) }}
      onContextMenu={(e) => onContextMenu(e, id)}
      onDoubleClick={() => onDoubleClick(id)}
    >
      {/* Active segment */}
      {activeH > 0 && (
        <div
          className="event-segment event-active"
          style={{
            top: 0,
            height: activeH,
            background: hexAlpha(color, 0.80),
            border: `1px solid ${hexAlpha(color, 0.95)}`,
            boxShadow: `0 0 6px ${hexAlpha(color, 0.35)}, inset 0 1px 0 ${hexAlpha('#ffffff', 0.12)}`,
            borderRadius: activeRadius,
          }}
          onMouseDown={(e) => onDragStart(e, id, startFrame)}
        >
          {activeH > 14 && (
            <span className="event-block-label" style={{ color: '#fff' }}>
              ACT
            </span>
          )}
        </div>
      )}

      {/* Lingering segment */}
      {hasLinger && lingerH > 0 && (
        <div
          className="event-segment event-lingering"
          style={{
            top: activeH,
            height: lingerH,
            background: hexAlpha(color, 0.28),
            borderLeft: `1px solid ${hexAlpha(color, 0.55)}`,
            borderRight: `1px solid ${hexAlpha(color, 0.55)}`,
            borderTop: `1px dashed ${hexAlpha(color, 0.55)}`,
            borderBottom: hasCooldown ? 'none' : `1px solid ${hexAlpha(color, 0.55)}`,
            borderRadius: lingerRadius,
          }}
        >
          {lingerH > 14 && (
            <span className="event-block-label" style={{ color: hexAlpha(color, 0.9) }}>
              LNG
            </span>
          )}
        </div>
      )}

      {/* Cooldown segment */}
      {hasCooldown && coolH > 0 && (
        <div
          className="event-segment event-cooldown"
          style={{
            top: activeH + lingerH,
            height: coolH,
            background: stripedBg(color),
            border: `1px solid rgba(80,100,140,0.3)`,
            borderTop: 'none',
            borderRadius: coolRadius,
          }}
        >
          {coolH > 14 && (
            <span className="event-block-label" style={{ color: 'rgba(120,150,180,0.7)' }}>
              CD
            </span>
          )}
        </div>
      )}
    </div>
  );
}
