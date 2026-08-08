"use client";

import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  DICE_ROLL_RANGE,
} from "../../../lib/solana/config";
import { diceMultiplierBp } from "../../../lib/solana/games/dice";
import { multiplierString } from "../../../lib/solana/format";

export function TargetSlider({
  target,
  onChange,
  disabled,
}: {
  target: bigint;
  onChange: (target: bigint) => void;
  disabled: boolean;
}) {
  const winChancePct = (Number(target) / Number(DICE_ROLL_RANGE)) * 100;
  const multiplierBp = diceMultiplierBp(target);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted">Roll under</span>
        <span className="font-mono font-semibold text-foreground">
          {target.toString()}
        </span>
      </div>
      <input
        type="range"
        min={DICE_MIN_TARGET.toString()}
        max={DICE_MAX_TARGET.toString()}
        value={target.toString()}
        disabled={disabled}
        onChange={(e) => onChange(BigInt(e.target.value))}
        className="w-full accent-[color:var(--gold)] disabled:opacity-50"
      />
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
        <div className="rounded-sm border border-border-low bg-cream/40 px-3 py-2">
          <p className="text-muted">Win chance</p>
          <p className="mt-0.5 font-semibold text-foreground">
            {winChancePct.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-sm border border-border-low bg-cream/40 px-3 py-2">
          <p className="text-muted">Payout</p>
          <p className="mt-0.5 font-semibold text-gold">
            {multiplierString(multiplierBp)}
          </p>
        </div>
      </div>
    </div>
  );
}
