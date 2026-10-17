"use client";

import { useEffect, useState } from "react";

/** Animates a number from 0 to `value` over `durationMs`, ease-out. */
export function CountUp({
  value,
  durationMs = 1200,
  format = (n) => n.toFixed(4),
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const frame = (t: number) => {
      // rAF timestamps can precede the effect's `performance.now()` by a
      // frame, so clamp from below too or the first frame shows a negative.
      const p = Math.min(Math.max((t - start) / durationMs, 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
