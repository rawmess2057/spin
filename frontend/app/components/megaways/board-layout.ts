/**
 * Megaways board geometry, in a fixed "design space" that the stage scales to
 * fit its host (the same approach as plinko's `rebuildBoard`).
 *
 * Six reel columns sit under a header strip (ways counter / multiplier). Each
 * column is the same height regardless of how many symbols it shows, so a
 * reel with 2 symbols draws them large and a reel with 7 draws them small —
 * which is exactly the Megaways look.
 */

import { REELS, MAX_ROWS } from "../../lib/solana/games/megaways";

export const CELL = 100; // max symbol cell size, px (design space)
export const GAP = 6; // gap between reel columns
export const HEADER_H = 70; // ways counter strip
export const FOOT_H = 18; // breathing room under the reels
export const COL_W = CELL;
export const COL_H = MAX_ROWS * CELL; // 700 — the fixed column height
export const BOARD_W = REELS * COL_W + (REELS - 1) * GAP; // 630
export const BOARD_H = HEADER_H + COL_H + FOOT_H;
/** Padding the cabinet frame adds around the reel area. */
export const FRAME_PAD = 14;

/** Symbol textures are rendered at this size and scaled down per reel. */
export const TEX_SIZE = 160;
/** Fraction of the cell a symbol fills (the rest is breathing room). */
export const SYMBOL_INSET = 0.86;

export function columnX(reel: number): number {
  return reel * (COL_W + GAP);
}

/** Cell height on a reel showing `h` symbols. */
export function cellH(h: number): number {
  return COL_H / h;
}

/** Vertical centre of `row` on a reel with `h` symbols (row 0 = top). */
export function cellCenterY(row: number, h: number): number {
  return HEADER_H + (row + 0.5) * cellH(h);
}

/** Sprite scale so a TEX_SIZE texture fits a cell on a reel of height `h`. */
export function symbolScale(h: number): number {
  const fit = Math.min(CELL, cellH(h)) * SYMBOL_INSET;
  return fit / TEX_SIZE;
}

export const REEL_TOP = HEADER_H;
export const REEL_BOTTOM = HEADER_H + COL_H;
