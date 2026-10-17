"use client";

import { BetPanel, FieldLabel, type BetPanelSpin } from "../bet/bet-panel";
import { RiskSelector } from "./plinko-risk-selector";
import { RowSelector } from "./plinko-row-selector";
import {
  type PlinkoConfig,
  plinkoEncodeTarget,
} from "../../lib/solana/games/plinko";

type Props = {
  config: PlinkoConfig;
  onConfigChange: (config: PlinkoConfig) => void;
  spin: BetPanelSpin;
};

export function PlinkoControls({ config, onConfigChange, spin }: Props) {
  const busy = spin.rolling || spin.isSending;
  return (
    <BetPanel
      spin={spin}
      target={plinkoEncodeTarget(config)}
      verb="Bet"
      busyLabel={spin.isDemo ? "Dropping ball…" : "Waiting for the house…"}
      roundNoun="drops"
      footnote={{
        idle: "Every drop is settled on-chain from a provably fair reveal.",
        busy: "Bet placed — the house is revealing your result on-chain.",
        demo: "Demo mode — connect a wallet and buy chips to play for real.",
      }}
    >
      <div className="mt-4">
        <FieldLabel>Risk</FieldLabel>
        <RiskSelector
          value={config.risk}
          onChange={(risk) => onConfigChange({ ...config, risk })}
          disabled={busy}
        />
      </div>
      <div className="mt-3">
        <FieldLabel>Rows</FieldLabel>
        <RowSelector
          value={config.rows}
          onChange={(rows) => onConfigChange({ ...config, rows })}
          disabled={busy}
        />
      </div>
    </BetPanel>
  );
}
