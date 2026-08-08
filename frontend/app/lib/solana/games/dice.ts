// Mirrors dice_eval in programs/spin/src/instructions/bet.rs exactly — must
// stay byte-for-byte identical to the on-chain evaluation, since this is
// purely for display (the program computes the real payout independently).
import { DICE_ROLL_RANGE, DICE_RTP_NUMERATOR } from "../config";

export type DiceOutcome = {
  raw: bigint;
  roll: bigint;
  target: bigint;
  multiplierBp: bigint;
  win: boolean;
};

/** RTP-correct multiplier for a given "roll under" target, before a bet is placed. */
export function diceMultiplierBp(target: bigint): bigint {
  if (target <= 0n) return 0n;
  return DICE_RTP_NUMERATOR / target;
}

export function diceEval(randomness: Uint8Array, target: bigint): DiceOutcome {
  const view = new DataView(
    randomness.buffer,
    randomness.byteOffset,
    randomness.byteLength
  );
  const raw = view.getBigUint64(0, true);
  const roll = raw % DICE_ROLL_RANGE;
  const win = roll < target;
  const multiplierBp = win ? diceMultiplierBp(target) : 0n;
  return { raw, roll, target, multiplierBp, win };
}
