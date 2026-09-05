/**
 * Plinko peg board layout.
 *
 * The pegs form a staggered grid: row `i` has `i + 1` pegs, centered, each
 * half a column-spacing lower and offset so peg rows interleave. A ball
 * dropped from the top center bounces L or R off each peg row it passes.
 *
 * All coordinates are in *board space* (centered on x=0, growing downward in
 * y); the Pixi container that owns the pegs is scaled/positioned to fit the
 * viewport separately.
 */

export type Peg = {
  x: number;
  y: number;
  row: number; // 0..=rows (play rows plus the final collector row)
  col: number;
};

export const PEG_RADIUS = 5;
export const BALL_RADIUS = 7;

// Horizontal and vertical spacing are independent so the board reads as a wide
// (landscape) layout instead of the near-square density of a shared spacing.
export const PEG_SPACING_X = 38;
export const PEG_SPACING_Y = 24;

/** Vertical space above the first peg row for the ball to drop from. */
export const TOP_PAD = PEG_SPACING_Y * 2;

/** Generate the peg grid for `rows` play rows (8..16), plus a collector row. */
export function generatePegs(rows: number): Peg[] {
  const pegs: Peg[] = [];
  // y starts at 0 for the first play row (row 0). Collector row sits at the
  // very bottom and anchors the buckets.
  for (let row = 0; row <= rows; row++) {
    const count = row + 1;
    const offsetX = -((count - 1) * PEG_SPACING_X) / 2;
    for (let col = 0; col < count; col++) {
      pegs.push({
        x: offsetX + col * PEG_SPACING_X,
        y: row * PEG_SPACING_Y,
        row,
        col,
      });
    }
  }
  return pegs;
}

/** Total board width for a given row count (in board space). */
export function boardWidth(rows: number): number {
  // Widest row is the collector row: rows + 1 pegs.
  const count = rows + 1;
  return (count - 1) * PEG_SPACING_X;
}

/** Total board height: top padding + (rows + 1) peg rows + bucket band. */
export function boardHeight(rows: number): number {
  return TOP_PAD + (rows + 1) * PEG_SPACING_Y;
}

/** Horizontal center x of the collector row's i-th bucket (0..rows). */
export function bucketX(rows: number, bucket: number): number {
  const count = rows + 1;
  const offsetX = -((count - 1) * PEG_SPACING_X) / 2;
  return offsetX + bucket * PEG_SPACING_X;
}

/** Actual peg center at a given row and column in board space. */
export function pegPosition(
  rows: number,
  row: number,
  col: number
): { x: number; y: number } {
  const count = row + 1;
  const offsetX = -((count - 1) * PEG_SPACING_X) / 2;
  return {
    x: offsetX + col * PEG_SPACING_X,
    y: row * PEG_SPACING_Y,
  };
}
