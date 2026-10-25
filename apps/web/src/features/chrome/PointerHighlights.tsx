import { useEffect } from 'react';

/** One passive, frame-bounded listener; no React updates, DOM clones or content snapshots. */
export function PointerHighlights({ disabled }: { disabled: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const selector =
      '.operator-console .op-stat, .operator-console .op-destination, .application-shell .workspace-row';
    let card: HTMLElement | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;
    function reset() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      card?.style.removeProperty('--spot-x');
      card?.style.removeProperty('--spot-y');
      card = null;
    }
    function move(event: PointerEvent) {
      if (!fine.matches || reduced.matches || event.pointerType !== 'mouse') return reset();
      const next =
        event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (next !== card) {
        reset();
        card = next;
      }
      if (!card) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!card?.isConnected) return reset();
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--spot-x', `${Math.round(x - rect.left)}px`);
          card.style.setProperty('--spot-y', `${Math.round(y - rect.top)}px`);
        });
    }
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', reset);
    };
  }, [disabled]);
  return null;
}
