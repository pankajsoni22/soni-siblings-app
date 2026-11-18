import { useLayoutEffect, useState, type RefObject } from 'react';

/** Width of an element: measured before the first paint, then kept up to date on resize. */
export function useWidth(ref: RefObject<HTMLElement | null>, deps: unknown): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, deps]);
  return width;
}

/** Column with a rounded top (up to `radius`) and a square base; `radius` 0 gives a plain rectangle. */
export function barPath(x: number, y: number, w: number, h: number, radius = 6): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(radius, w / 2, h);
  if (r <= 0) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
