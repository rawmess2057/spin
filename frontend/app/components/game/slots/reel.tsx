"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SLOT_SYMBOLS } from "../../../lib/solana/config";
import { SlotSymbol } from "./symbols/slot-symbol";

const CELL_H = 56; // px, matches h-14
const VISIBLE = 3; // rows in the reel window (h-42)
/**
 * The strip repeats every `PERIOD` cells (cell i shows symbol i % PERIOD),
 * so we only render one period plus the visible rows and wrap the offset —
 * scrolling is seamless because the trailing cells duplicate the leading
 * ones. This keeps ~65 symbol instances on screen instead of several
 * hundred, and makes it impossible to scroll past the end of the strip.
 */
const PERIOD = SLOT_SYMBOLS.length; // 10
const CELLS = PERIOD + VISIBLE;

const SPIN_SPEED = 26; // cells per second
const MIN_TRAVEL = 4; // cells the reel must still cover once landing starts
const OVERSHOOT = 0.22; // cells travelled past the stop before settling back
const SETTLE_MS = 160; // spring-back from the overshoot
const ANTICIPATE_DELAY = 700; // extra hang time when a win is still live
const ANTICIPATE_SLOWDOWN = 1.8; // landing takes this much longer

type ReelProps = {
  reelIndex: number;
  /** `landSymbol` is the symbol index the reel must settle on. */
  spinning: boolean;
  landSymbol: number | null;
  /** Delay before this reel starts its landing animation (stagger). */
  delayMs: number;
  /** Whether this reel holds the winning symbol. */
  winning: boolean;
  /** Faster landing animation when the player has turbo enabled. */
  turbo?: boolean;
  /**
   * True when the already-revealed reels leave a win still possible, so this
   * reel hangs and slows for tension. Purely presentational — the outcome is
   * fixed before the first reel ever stops.
   */
  anticipate?: boolean;
  onAnticipateStart?: (reelIndex: number) => void;
  /** Fired at the moment of impact, when the reel hits its stop. */
  onLanded: (reelIndex: number) => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A single slot reel: a vertical strip of symbols scrolled with rAF.
 *
 * The window shows three rows. The middle row is the live payline and always
 * carries the authoritative result (`landSymbol`); the rows above
 * and below are the neighbouring positions on the same physical reel strip,
 * dimmed by the vignette so they read as backdrop and never as extra paying
 * positions.
 *
 * The transform and blur are written straight to the DOM node inside the rAF
 * loop rather than through React state — with SVG symbol artwork on screen,
 * re-rendering the strip 60×/sec would not hold frame rate.
 */
export function Reel({
  reelIndex,
  spinning,
  landSymbol,
  delayMs,
  winning,
  turbo = false,
  anticipate = false,
  onAnticipateStart,
  onLanded,
}: ReelProps) {
  const [landed, setLanded] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const phaseRef = useRef<"idle" | "spinning" | "landing">("idle");
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  // Latest callbacks, so the rAF loop never needs them as effect deps. The
  // loop only reads these long after mount, so refreshing them in an effect
  // is always in time.
  const onLandedRef = useRef(onLanded);
  const onAnticipateStartRef = useRef(onAnticipateStart);
  useEffect(() => {
    onLandedRef.current = onLanded;
    onAnticipateStartRef.current = onAnticipateStart;
  });

  /** Writes the offset (wrapped) and speed-derived blur straight to the DOM. */
  const paint = (offset: number, velocity: number) => {
    const node = stripRef.current;
    if (!node) return;
    const wrapped = ((offset % PERIOD) + PERIOD) % PERIOD;
    const blur = Math.min(Math.abs(velocity) * 0.23, 6);
    node.style.transform = `translate3d(0, -${wrapped * CELL_H}px, 0)`;
    node.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "none";
  };

  useEffect(() => {
    if (spinning && phaseRef.current === "idle") {
      phaseRef.current = "spinning";
      setLanded(false);
      const reduced = prefersReducedMotion();
      let last = performance.now();
      const loop = (t: number) => {
        const dt = (t - last) / 1000;
        last = t;
        const next = (offsetRef.current + SPIN_SPEED * dt) % PERIOD;
        offsetRef.current = next;
        paint(next, reduced ? 0 : SPIN_SPEED);
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
      setLanded(false);
      offsetRef.current = 0;
      paint(0, 0);
    }
  }, [spinning, landSymbol]);

  useEffect(() => {
    if (!spinning || landSymbol == null) return;
    if (phaseRef.current !== "spinning") return;
    phaseRef.current = "landing";
    cancelAnimationFrame(rafRef.current);

    const reduced = prefersReducedMotion();
    const useAnticipation = anticipate && !reduced && !turbo;
    const baseDuration = reduced ? 0.25 : turbo ? 0.5 : 1.35;
    const duration = useAnticipation
      ? baseDuration * ANTICIPATE_SLOWDOWN
      : baseDuration;
    const overshoot = reduced ? 0 : OVERSHOOT;
    const settleMs = reduced ? 0 : SETTLE_MS;
    const startDelay = delayMs + (useAnticipation ? ANTICIPATE_DELAY : 0);

    if (useAnticipation) onAnticipateStartRef.current?.(reelIndex);

    timerRef.current = window.setTimeout(() => {
      const startOffset = offsetRef.current;
      // The middle row shows cell `offset + 1`, so to land `landSymbol` on
      // the payline the offset must be congruent to `landSymbol - 1`.
      const residue = (landSymbol - 1 + PERIOD) % PERIOD;
      let target = Math.ceil(startOffset + MIN_TRAVEL);
      target += (residue - (target % PERIOD) + PERIOD) % PERIOD;
      const overshootTarget = target + overshoot;

      const runSettle = () => {
        if (settleMs === 0) {
          offsetRef.current = target;
          paint(target, 0);
          setLanded(true);
          phaseRef.current = "idle";
          return;
        }
        const settleStart = performance.now();
        const from = overshootTarget;
        const settle = (t: number) => {
          const p = Math.min((t - settleStart) / settleMs, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const next = from + (target - from) * eased;
          const velocity = ((target - from) / (settleMs / 1000)) * (1 - p);
          offsetRef.current = next;
          paint(next, velocity);
          if (p < 1) {
            rafRef.current = requestAnimationFrame(settle);
          } else {
            offsetRef.current = target;
            paint(target, 0);
            phaseRef.current = "idle";
            setLanded(true);
          }
        };
        rafRef.current = requestAnimationFrame(settle);
      };

      const start = performance.now();
      const travel = overshootTarget - startOffset;
      const approach = (t: number) => {
        const p = Math.min((t - start) / 1000 / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const next = startOffset + travel * eased;
        // Derivative of the cubic ease-out, in cells/sec.
        const velocity = (travel * 3 * Math.pow(1 - p, 2)) / duration;
        offsetRef.current = next;
        paint(next, velocity);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(approach);
        } else {
          // Impact — report the stop here so the clunk lands with the hit,
          // then spring back from the overshoot.
          onLandedRef.current(reelIndex);
          runSettle();
        }
      };
      rafRef.current = requestAnimationFrame(approach);
    }, startDelay);

    return () => clearTimeout(timerRef.current);
  }, [spinning, landSymbol, delayMs, reelIndex, turbo, anticipate]);

  // Static strip content — never re-renders; the animation only mutates the
  // wrapper's transform.
  const cells = useMemo(
    () =>
      Array.from({ length: CELLS }, (_, i) => (
        <div key={i} className="flex h-14 w-full items-center justify-center">
          <SlotSymbol
            index={i % PERIOD}
            className="size-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]"
          />
        </div>
      )),
    []
  );

  return (
    <div className="relative h-42 w-16 flex-1 shrink-0 overflow-hidden rounded-md bg-[#07070c] shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)] sm:w-auto">
      <div ref={stripRef} className="flex flex-col will-change-transform">
        {cells}
      </div>

      {/* Vignette — dims the neighbouring strip positions above and below so
          only the live centre row reads as active. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/85 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {/* Curved-glass reflection across the reel face. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-transparent" />

      {winning && landed && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-14 -translate-y-1/2 animate-pulse rounded-sm bg-gold/10 shadow-[0_0_22px_rgba(255,192,87,0.55)] ring-2 ring-gold/80" />
      )}
    </div>
  );
}
