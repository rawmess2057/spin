"use client";

import { GridScreen, type GridGameDef } from "../grid/grid-screen";
import {
  GAME_PHARAOH,
  PHARAOH_BASE_BP,
  PHARAOH_FREE_SPINS,
  PHARAOH_MIN_COUNT,
  PHARAOH_REELS,
  PHARAOH_ROWS,
  PHARAOH_RTP,
  PHARAOH_SYMBOLS,
} from "../../../lib/solana/config";
import { pharaohEval } from "../../../lib/solana/games/pharaoh";

const DEF: GridGameDef = {
  gameId: GAME_PHARAOH,
  title: "Pharaoh's Fortune",
  kicker: "PHARAOH'S FORTUNE",
  subtitle:
    "5×4 scatter board — the Pharaoh expands into your best symbol; 4+ scarabs trigger 3 free boards.",
  prefix: "pharaoh",
  reels: PHARAOH_REELS,
  rows: PHARAOH_ROWS,
  cellPx: 62,
  minCount: PHARAOH_MIN_COUNT,
  rtp: PHARAOH_RTP,
  evalFn: pharaohEval,
  symbolNames: PHARAOH_SYMBOLS.map((s) => s.name),
  paytableMinBp: PHARAOH_BASE_BP,
  outcomeLines: (o) => {
    const lines: string[] = [];
    if (o.freeSpins) {
      lines.push(
        `Free spins triggered — ${PHARAOH_FREE_SPINS} extra boards were summed.`
      );
    }
    return lines;
  },
};

export function PharaohScreen() {
  return <GridScreen def={DEF} />;
}
