"use client";

import { GridScreen, type GridGameDef } from "../grid/grid-screen";
import {
  DRAGON_BASE_BP,
  DRAGON_MIN_COUNT,
  DRAGON_REELS,
  DRAGON_ROWS,
  DRAGON_RTP,
  DRAGON_SYMBOLS,
  GAME_DRAGON,
} from "../../../lib/solana/config";
import { dragonEval } from "../../../lib/solana/games/dragon";

const DEF: GridGameDef = {
  gameId: GAME_DRAGON,
  title: "Golden Dragon",
  kicker: "GOLDEN DRAGON",
  subtitle: "5×3 scatter board — 5+ pearls double your win, 9+ triple it.",
  prefix: "dragon",
  reels: DRAGON_REELS,
  rows: DRAGON_ROWS,
  cellPx: 68,
  minCount: DRAGON_MIN_COUNT,
  rtp: DRAGON_RTP,
  evalFn: dragonEval,
  symbolNames: DRAGON_SYMBOLS.map((s) => s.name),
  paytableMinBp: DRAGON_BASE_BP,
  outcomeLines: (o) => {
    const lines: string[] = [];
    if (o.pearlTier === 3) {
      lines.push(`9+ pearls on the board — win tripled.`);
    } else if (o.pearlTier === 2) {
      lines.push(`5+ pearls on the board — win doubled.`);
    }
    return lines;
  },
};

export function DragonScreen() {
  return <GridScreen def={DEF} />;
}
