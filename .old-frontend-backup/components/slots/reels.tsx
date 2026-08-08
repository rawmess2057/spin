"use client";

import { useEffect, useRef, useState } from "react";
import { SLOT_SYMBOLS } from "../../lib/spin/config";

const CELL_H = 56; // px, matches h-14
const STRIP = 30; // 3 cycles of 10 symbols

type ReelProps = {
  reelIndex: number;
  /** `landSymbol` is the on-chain symbol index the reel must settle on. */
  spinning: boolean;
  landSymbol: number | null;
  /** Delay before this reel starts its landing animation (stagger). */
  delayMs: number;
  /** Whether this reel holds the winning symbol. */
  winning: boolean;
  onLanded: (reelIndex: number) => void;
};

/**
 * A single slot reel: a vertical strip of symbols scrolled with rAF.
 * While `spinning` it scrolls at constant speed; when `landSymbol` appears it
 * decelerates and settles exactly on that symbol, staggered by `delayMs`.
 */
export function Reel({
  reelIndex,
  spinning,
  landSymbol,
  delayMs,
  winning,
  onLanded,
}: ReelProps) {
  const [offset, setOffset] = useState(0);
  const [blurred, setBlurred] = useState(false);
  const [landed, setLanded] = useState(false);
  const offsetRef = useRef(0);
  const phaseRef = useRef<"idle" | "spinning" | "landing">("idle");
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (spinning && phaseRef.current === "idle") {
      phaseRef.current = "spinning";
      setBlurred(true);
      setLanded(false);
      let last = performance.now();
      const loop = (t: number) => {
        const dt = (t - last) / 1000;
        last = t;
        const next = (offsetRef.current + 26 * dt) % STRIP;
        offsetRef.current = next;
        setOffset(next);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [spinning]);

  useEffect(() => {
    if (!spinning && landSymbol == null && phaseRef.current !== "idle") {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
      phaseRef.current = "idle";
      setBlurred(false);
      setLanded(false);
      offsetRef.current = 0;
      setOffset(0);
    }
  }, [spinning, landSymbol]);

  useEffect(() => {
    if (!spinning || landSymbol == null) return;
    if (phaseRef.current !== "spinning") return;
    phaseRef.current = "landing";
    cancelAnimationFrame(rafRef.current);
    timerRef.current = window.setTimeout(() => {
      const startOffset = offsetRef.current;
      let target = 19 + landSymbol;
      while (target < startOffset + 4) target += STRIP;
      const start = performance.now();
      const DURATION = 1.35;
      const loop = (t: number) => {
        const p = Math.min((t - start) / 1000 / DURATION, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const next = startOffset + (target - startOffset) * eased;
        offsetRef.current = next;
        setOffset(next);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(loop);
        } else {
          phaseRef.current = "idle";
          setBlurred(false);
          setLanded(true);
          onLanded(reelIndex);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    }, delayMs);
    return () => clearTimeout(timerRef.current);
  }, [spinning, landSymbol, delayMs, reelIndex, onLanded]);

  return (
    <div className="relative h-42 flex-1 overflow-hidden rounded-lg border border-border-low bg-background/60">
      <div
        className="flex flex-col will-change-transform"
        style={{
          transform: `translateY(-${offset * CELL_H}px)`,
          filter: blurred ? "blur(2px)" : "none",
        }}
      >
        {Array.from({ length: STRIP }, (_, i) => (
          <div
            key={i}
            className="flex h-14 w-full items-center justify-center text-3xl"
          >
            {SLOT_SYMBOLS[i % SLOT_SYMBOLS.length].glyph}
          </div>
        ))}
      </div>
      {winning && landed && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg shadow-[0_0_18px_rgba(0,255,163,0.5)] ring-2 ring-primary/80" />
      )}
    </div>
  );
}
