"use client";

import {
  filteredNoiseSweep,
  motorWhir,
  noiseBurst,
  noiseKnock,
  thump,
  tone,
} from "./synth";
export { isSoundMuted, setSoundMuted } from "./synth";

let stopWhir: (() => void) | null = null;

/** Lever-pull sweep plus the reel motor spinning up. */
export function spinStart(): void {
  filteredNoiseSweep(300, 2200, 0.4, 0.1);
  thump(180, 60, 0.18, 0.16);
  stopWhir?.();
  stopWhir = motorWhir(0.05);
}

/** Cuts the motor whir — call once every reel has stopped. */
export function spinEnd(): void {
  stopWhir?.();
  stopWhir = null;
}

/**
 * Mechanical clunk as a reel hits its stop: a lowpassed noise transient for
 * the impact, a pitch-dropping thump for the body, and a faint metallic ring
 * that rises slightly per reel so the five stops don't sound identical.
 */
export function reelStop(reelIndex: number): void {
  noiseKnock(1600 + reelIndex * 120, 0.055, 0.22);
  thump(150 + reelIndex * 12, 48, 0.13, 0.3);
  tone(2200 + reelIndex * 160, 0.03, 0.002, 0.05, 0.01, "square");
}

/** Rising tremolo tone while a reel hangs with a win still live. */
export function anticipation(): void {
  const base = 330;
  for (let i = 0; i < 7; i++) {
    tone(base * Math.pow(1.09, i), 0.07, 0.01, 0.12, i * 0.1, "triangle");
  }
  filteredNoiseSweep(600, 2600, 0.7, 0.045);
}

/** Outcome sound for a loss: a low, dead double thud. */
export function lose(): void {
  thump(120, 44, 0.3, 0.2);
  thump(70, 30, 0.45, 0.13, 0.03);
}

/**
 * Outcome sound for a win: a rising arpeggio over a cascade of coin pings.
 * The cascade is what actually reads as "casino" — its length scales with
 * the payout multiplier. `multiplierBp` is in basis points.
 */
export function win(multiplierBp: bigint): void {
  const mult = Number(multiplierBp) / 10_000;
  const big = mult >= 10;
  const huge = mult >= 30;

  const notes = huge
    ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093]
    : big
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]
      : [523.25, 659.25, 783.99, 1046.5];
  const step = huge ? 0.13 : big ? 0.16 : 0.11;
  notes.forEach((f, i) => {
    tone(f, 0.14, 0.01, huge ? 0.4 : big ? 0.35 : 0.22, i * step, "triangle");
    tone(f * 2, 0.045, 0.01, 0.18, i * step, "sine");
  });

  coinCascade(huge ? 26 : big ? 16 : 8);
  if (huge) noiseBurst(0.6, 0.07);
}

/** Bright metallic pings at randomised intervals — coins hitting a tray. */
function coinCascade(count: number): void {
  for (let i = 0; i < count; i++) {
    const when = i * 0.055 + Math.random() * 0.04;
    const pitch = 1800 + Math.random() * 1400;
    tone(pitch, 0.07, 0.002, 0.09, when, "triangle");
    tone(pitch * 1.5, 0.03, 0.002, 0.06, when + 0.005, "sine");
  }
}

/** Short dice-tumble sound while waiting for the roll to land. */
export function diceRoll(): void {
  filteredNoiseSweep(500, 1400, 0.3, 0.1);
  noiseKnock(1200, 0.05, 0.15, 0.06);
  noiseKnock(900, 0.05, 0.13, 0.14);
}

/** Single dice bounce — played at random intervals while cubes tumble. */
export function diceClatter(): void {
  noiseKnock(700 + Math.random() * 500, 0.04, 0.12, Math.random() * 0.05);
}

/**
 * Jackpot siren for the 100x cap: a two-tone rising siren over a heavy coin
 * cascade and a final noise burst.
 */
export function jackpot(): void {
  // Two-tone siren — up-down-up.
  for (let i = 0; i < 9; i++) {
    const dir = Math.sin(i * Math.PI * 0.5) > 0 ? 1 : -1;
    const f = 620 + dir * 260;
    tone(f, 0.09, 0.01, 0.28, i * 0.16, "sawtooth");
    tone(f * 1.5, 0.05, 0.01, 0.12, i * 0.16, "sine");
  }
  coinCascade(40);
  noiseBurst(0.8, 0.09);
  thump(90, 50, 0.5, 0.25, 1.5);
}
