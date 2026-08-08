"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GridSymbol } from "./grid-symbol";

/** Symbol swap cadence while the board is spinning. */
const SPIN_TICK_MS = 120;
/** Stagger between columns settling onto their final symbols. */
const COL_LAND_MS = 150;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Grid board shared by the three grid games (Pharaoh's Fortune 5x4, Golden
 * Dragon 5x3, Dynamite Mines 6x3).
 *
 * While `spinning` the cells cycle through random symbols; when it clears,
 * columns settle left → right on the authoritative result, each firing
 * `onColumnLand` so the screen can layer sound. The outcome is drawn the
 * moment the bet is placed, well before the first column stops — the roll is
 * presentation only.
 *
 * When `boards` is provided (mines), the board then replays the cascade
 * deterministically: each step remounts the cells (restarting the drop-in
 * animation) and fires `onCascadeStep`. Winning cells carry the gold glow.
 */
export function GridBoard({
  prefix,
  cells,
  reels,
  symbolCount,
  winningSymbol = null,
  wild = null,
  boards,
  spinning = false,
  cascadeActive = false,
  onColumnLand,
  onLandDone,
  onCascadeStep,
  onCascadeDone,
  cellPx = 64,
}: {
  prefix: "pharaoh" | "dragon" | "mines";
  /** Final cells, row-major. */
  cells: number[];
  reels: number;
  /** Number of distinct symbols, for the spin scramble. */
  symbolCount: number;
  winningSymbol?: number | null;
  wild?: number | null;
  /** Mines: board state per cascade stage (index 0 = initial). */
  boards?: number[][];
  /** True while the result is still pending — cells cycle. */
  spinning?: boolean;
  cascadeActive?: boolean;
  onColumnLand?: (column: number) => void;
  onLandDone?: () => void;
  onCascadeStep?: (step: number) => void;
  onCascadeDone?: () => void;
  cellPx?: number;
}) {
  const steps = useMemo(() => boards ?? [cells], [boards, cells]);
  const [step, setStep] = useState(0);
  const cellCount = cells.length;

  // Columns already settled. Starts fully landed so a board that never spins
  // (the resting board, a restored result) renders statically.
  const [landedCols, setLandedCols] = useState(reels);
  const [scramble, setScramble] = useState<number[]>([]);

  // Latest callbacks, so the timers below never need them as effect deps.
  const onColumnLandRef = useRef(onColumnLand);
  const onLandDoneRef = useRef(onLandDone);
  useEffect(() => {
    onColumnLandRef.current = onColumnLand;
    onLandDoneRef.current = onLandDone;
  });

  // Reset the replay/roll when a new run starts (render-phase state
  // adjustment, per react.dev — the effects below only schedule steps).
  const [prevActive, setPrevActive] = useState(false);
  if (cascadeActive && !prevActive) {
    setPrevActive(true);
    setStep(0);
  } else if (!cascadeActive && prevActive) {
    setPrevActive(false);
  }

  const [prevSpinning, setPrevSpinning] = useState(false);
  if (spinning !== prevSpinning) {
    setPrevSpinning(spinning);
    if (spinning) setLandedCols(0);
  }

  // Cycle random symbols while spinning.
  useEffect(() => {
    if (!spinning || cellCount === 0) return;
    const roll = () =>
      setScramble(
        Array.from({ length: cellCount }, () =>
          Math.floor(Math.random() * symbolCount)
        )
      );
    roll();
    const id = setInterval(roll, SPIN_TICK_MS);
    return () => clearInterval(id);
  }, [spinning, cellCount, symbolCount]);

  // Settle one column at a time once the roll stops.
  useEffect(() => {
    if (spinning || landedCols >= reels) return;
    const delay = prefersReducedMotion() ? 0 : COL_LAND_MS;
    const t = setTimeout(() => {
      onColumnLandRef.current?.(landedCols);
      setLandedCols(landedCols + 1);
      if (landedCols + 1 >= reels) onLandDoneRef.current?.();
    }, delay);
    return () => clearTimeout(t);
  }, [spinning, landedCols, reels]);

  const settled = !spinning && landedCols >= reels;

  useEffect(() => {
    if (!cascadeActive || steps.length <= 1 || !settled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const advance = (s: number) => {
      if (cancelled) return;
      if (s < steps.length - 1) {
        timer = setTimeout(() => {
          onCascadeStep?.(s + 1);
          setStep(s + 1);
          advance(s + 1);
        }, 520);
      } else {
        onCascadeDone?.();
      }
    };
    advance(step);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cascadeActive, settled, boards, cells]);

  const board = useMemo(
    () => (step < steps.length ? steps[step] : cells),
    [step, steps, cells]
  );

  const gap = Math.max(4, Math.round(cellPx * 0.09));

  return (
    <div
      className="mx-auto grid w-fit select-none"
      style={{
        gridTemplateColumns: `repeat(${reels}, ${cellPx}px)`,
        gridAutoRows: `${cellPx}px`,
        gap: `${gap}px`,
      }}
    >
      {board.map((final, i) => {
        const landed = settled || i % reels < landedCols;
        const symbol = landed ? final : (scramble[i] ?? final);
        const isWin = landed && winningSymbol !== null && symbol === winningSymbol;
        const isWildWin =
          landed && wild !== null && symbol === wild && winningSymbol !== null;
        return (
          <div
            key={`${step}-${i}-${landed ? "land" : "roll"}`}
            className={`flex items-center justify-center overflow-hidden rounded-md border border-black/30 bg-gradient-to-b from-[#232636] to-[#14161f] shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)] ${
              landed ? "grid-cell-drop" : ""
            } ${
              isWin || isWildWin
                ? "ring-2 ring-gold/80 shadow-[0_0_18px_rgba(255,192,87,0.45)]"
                : ""
            }`}
            style={{ width: cellPx, height: cellPx }}
          >
            <GridSymbol
              prefix={prefix}
              index={symbol}
              className={`${landed ? "" : "grid-cell-spin "}${
                isWin || isWildWin
                  ? "size-[85%]"
                  : "size-[85%] drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
