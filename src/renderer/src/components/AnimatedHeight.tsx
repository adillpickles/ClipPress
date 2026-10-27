import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import styles from './AnimatedHeight.module.css';

/**
 * Grows and shrinks smoothly with its content, so what's below it slides instead of jumping (the export sheet's options
 * when the quality changes). The first height is taken as it is.
 */
export default function AnimatedHeight({ children, className }: { children: ReactNode, className?: string | undefined }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (inner == null) return undefined;
    const update = () => setHeight(inner.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={[styles['outer'], ...(className != null ? [className] : [])].join(' ')} style={{ height }}>
      <div ref={innerRef} className={styles['inner']}>{children}</div>
    </div>
  );
}
