/**
 * Animated slot wrapper for progressive-disclosure sentence builders.
 *
 * Handles enter/exit animations with spring-like momentum.
 * When `active` transitions to false, plays an exit animation before unmounting.
 *
 * Usage:
 *   <SentenceSlot active={showAdjective}>
 *     <select ... />
 *   </SentenceSlot>
 */
import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';

interface SentenceSlotProps {
  /** Whether this slot should be visible. Animates in/out on change. */
  active: boolean;
  /** Content to render inside the slot. */
  children: ReactNode;
  /** Optional CSS class to append. */
  className?: string;
  /** Use row-level animation (vertical slide) instead of inline (horizontal). */
  row?: boolean;
}

export default function SentenceSlot({ active, children, className, row }: SentenceSlotProps) {
  // 'mounted' keeps the DOM node alive during exit animation
  const [mounted, setMounted] = useState(active);
  const [phase, setPhase] = useState<'entering' | 'idle' | 'exiting'>(active ? 'entering' : 'exiting');
  const ref = useRef<HTMLElement>(null);
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      // Became active — mount and enter
      setMounted(true);
      setPhase('entering');
    } else if (!active && prevActive.current) {
      // Became inactive — start exit
      setPhase('exiting');
    }
    prevActive.current = active;
  }, [active]);

  // On initial mount when already active, snap to idle after animation
  useEffect(() => {
    if (active && phase === 'entering') {
      const el = ref.current;
      if (!el) return;
      const onEnd = () => setPhase('idle');
      el.addEventListener('animationend', onEnd, { once: true });
      return () => el.removeEventListener('animationend', onEnd);
    }
  }, [active, phase]);

  const handleAnimationEnd = useCallback(() => {
    if (phase === 'exiting') {
      setMounted(false);
    } else if (phase === 'entering') {
      setPhase('idle');
    }
  }, [phase]);

  if (!mounted && !active) return null;

  const animClass = phase === 'entering'
    ? 'ss-enter'
    : phase === 'exiting'
    ? 'ss-exit'
    : '';

  const baseClass = row ? 'sentence-slot-row' : 'sentence-slot';
  const Tag = row ? 'div' : 'span';

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`${baseClass} ${animClass} ${className ?? ''}`.trim()}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </Tag>
  );
}
