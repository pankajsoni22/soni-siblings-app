import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * After moving to another page, put keyboard and screen-reader focus on the new page's heading,
 * as a full page load would. Skipped on the first render so the page's own autofocus wins.
 */
export function useFocusOnNavigate(container: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h1 = container.current?.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: false });
    }
    window.scrollTo({ top: 0 });
  }, [pathname, container]);
}
