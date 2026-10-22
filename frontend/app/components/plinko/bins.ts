import {
  PLINKO_MIN_ROWS,
  PLINKO_MAX_ROWS,
} from "../../lib/solana/games/plinko";

/**
 * Bucket ("bin") color palette for the Plinko board.
 *
 * Mirrors the Svelte reference's discrete red/yellow two-tone scheme. The game
 * pays out at the edges, so the rarest, highest-value edge buckets are hot
 * red and the lower-value center buckets are yellow; each carries a darker
 * `shadow` for the 3D chip under-band (`binColorsByRowCount` + `--shadow-color`).
 */

const RED = { background: "rgb(255, 0, 63)", shadow: "rgb(166, 0, 4)" };
const YELLOW = { background: "rgb(255, 192, 0)", shadow: "rgb(171, 121, 0)" };

type Palette = { background: string[]; shadow: string[] };

/** Builds the symmetric (rows+1)-bucket palette for a given row count. */
export function binColors(rows: number): Palette {
  const count = rows + 1;
  const background: string[] = new Array(count);
  const shadow: string[] = new Array(count);

  // A few red bands at each edge (proportional to the row count so the border
  // reads consistently), then yellow into the center.
  const redBandsPerSide = Math.max(1, Math.round(count / 4));
  for (let b = 0; b < count; b++) {
    const edgeDistance = Math.min(b, count - 1 - b);
    const isRed = edgeDistance < redBandsPerSide;
    background[b] = isRed ? RED.background : YELLOW.background;
    shadow[b] = isRed ? RED.shadow : YELLOW.shadow;
  }

  return { background, shadow };
}

const palettes = new Map<number, Palette>();

/** Cached palette for a row count (8..16). */
export function plinkoPalette(rows: number): Palette {
  let p = palettes.get(rows);
  if (!p) {
    p = binColors(Math.min(PLINKO_MAX_ROWS, Math.max(PLINKO_MIN_ROWS, rows)));
    palettes.set(rows, p);
  }
  return p;
}

export { compactMultiplier } from "../../lib/format";
