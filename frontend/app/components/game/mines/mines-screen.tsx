"use client";

import { GridScreen, type GridGameDef } from "../grid/grid-screen";
import {
  GAME_MINES,
  MINES_BASE_BP,
  MINES_MIN_COUNT,
  MINES_REELS,
  MINES_ROWS,
  MINES_RTP,
  MINES_SYMBOLS,
} from "../../../lib/solana/config";
import { minesEval } from "../../../lib/solana/games/mines";

const DEF: GridGameDef = {
  gameId: GAME_MINES,
  title: "Dynamite Mines",
  kicker: "DYNAMITE MINES",
  subtitle:
    "6×3 cascading board — winners detonate, survivors drop, fresh symbols fall in. Up to 5 cascades.",
  prefix: "mines",
  reels: MINES_REELS,
  rows: MINES_ROWS,
  cellPx: 62,
  minCount: MINES_MIN_COUNT,
  rtp: MINES_RTP,
  evalFn: minesEval,
  symbolNames: MINES_SYMBOLS.map((s) => s.name),
  paytableMinBp: MINES_BASE_BP,
  outcomeLines: (o) => {
    const lines: string[] = [];
    if (o.cascadeLevels != null && o.cascadeLevels > 0) {
      lines.push(
        o.cascadeLevels === 1
          ? "1 cascade — no further match."
          : `${o.cascadeLevels} cascades — each paid at an increasing multiplier.`
      );
    }
    return lines;
  },
};

export function MinesScreen() {
  return <GridScreen def={DEF} />;
}
