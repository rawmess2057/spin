"use client";

import {
  filteredNoiseSweep,
  motorWhir,
  noiseBurst,
  noiseKnock,
  thump,
  tone,
} from "./synth";
export {
  ambientStart,
  ambientStop,
  isSoundMuted,
  setSoundMuted,
} from "./synth";

const HAPTIC_KEY = "spin.haptic.enabled";

let hapticEnabled = true;
try {
  hapticEnabled = localStorage.getItem(HAPTIC_KEY) !== "0";
} catch {
  // ignore
}

export function isHapticEnabled(): boolean {
  return hapticEnabled;
}

export function setHapticEnabled(value: boolean): void {
  hapticEnabled = value;
  try {
    localStorage.setItem(HAPTIC_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Light tactile feedback for button presses and interactive elements. */
export function haptic(level: "light" | "medium" | "heavy" = "light"): void {
  if (!hapticEnabled || typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  const pattern =
    level === "light" ? 10 : level === "medium" ? 25 : [50, 30, 30];
  try {
    navigator.vibrate(pattern);
  } catch {
    // vibration not supported — ignore
  }
}

let stopWhir: (() => void) | null = null;
let setWhirRate: ((rate: number) => void) | null = null;

/** Lever-pull sweep plus the reel motor spinning up. */
export function spinStart(): void {
  filteredNoiseSweep(300, 2200, 0.4, 0.1);
  thump(180, 60, 0.18, 0.16);
  haptic("medium");
  stopWhir?.();
  const whir = motorWhir(0.05);
  stopWhir = whir.stop;
  setWhirRate = whir.setRate;
}

/** Cuts the motor whir — call once every reel has stopped. */
export function spinEnd(): void {
  stopWhir?.();
  stopWhir = null;
  setWhirRate = null;
}

/**
 * Adjusts the reel motor pitch while it runs — drops when the machine eases
 * into a long VRF wait ("lull") and returns to normal when the result lands.
 */
export function setSpinPitch(rate: number): void {
  setWhirRate?.(rate);
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
 * "So close" outcome: the reels teased a win that never came. Descending
 * detuned tones (a slow fall instead of a defeat thud), trailing off softly.
 */
export function nearMiss(): void {
  const notes = [392, 349.23, 311.13]; // G4 → F4 → Eb4
  notes.forEach((f, i) => {
    tone(f, 0.09, 0.01, 0.28, i * 0.17, "triangle");
    tone(f / 2, 0.05, 0.01, 0.22, i * 0.17, "sine");
  });
  thump(95, 42, 0.4, 0.16, 0.55);
}

/** Outcome sound for a win: a rising arpeggio over a cascade of coin pings.
 * The cascade is what actually reads as "casino" — its length scales with
 * the payout multiplier. `multiplierBp` is in basis points. */
export function win(multiplierBp: bigint): void {
  const mult = Number(multiplierBp) / 10_000;
  const big = mult >= 10;
  const huge = mult >= 30;

  if (huge) haptic("heavy");
  else if (big) haptic("medium");

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

/** Two-tone rising siren — up-down-up. */
function jackpotSiren(): void {
  for (let i = 0; i < 9; i++) {
    const dir = Math.sin(i * Math.PI * 0.5) > 0 ? 1 : -1;
    const f = 620 + dir * 260;
    tone(f, 0.09, 0.01, 0.28, i * 0.16, "sawtooth");
    tone(f * 1.5, 0.05, 0.01, 0.12, i * 0.16, "sine");
  }
}

/** Sustained major-chord pad swelling under a big-win fanfare. */
function chordPad(root: number, release: number): void {
  [1, 1.25, 1.5, 2].forEach((mult) => {
    tone(root * mult, 0.05, 0.4, release, 0, "sine");
  });
}

/**
 * The big-win fanfare for the full-screen celebration, scaled by tier.
 * Smaller payouts keep `win()` — this is the money shot for the rare hits.
 */
export function bigWinFanfare(tier: "big" | "huge" | "jackpot"): void {
  if (tier === "jackpot") {
    chordPad(220, 2.4); // A3 major
    jackpotSiren();
    coinCascade(60);
    noiseBurst(0.9, 0.1);
    thump(90, 50, 0.5, 0.25, 1.6);
  } else if (tier === "huge") {
    chordPad(261.63, 1.8); // C4 major
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => {
      tone(f, 0.14, 0.01, 0.4, i * 0.13, "triangle");
      tone(f * 2, 0.045, 0.01, 0.18, i * 0.13, "sine");
    });
    coinCascade(32);
    noiseBurst(0.6, 0.08);
  } else {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    notes.forEach((f, i) => {
      tone(f, 0.14, 0.01, 0.35, i * 0.16, "triangle");
      tone(f * 2, 0.045, 0.01, 0.18, i * 0.16, "sine");
    });
    coinCascade(20);
  }
}

/**
 * Jackpot siren for the 100x cap: a two-tone rising siren over a heavy coin
 * cascade and a final noise burst.
 */
export function jackpot(): void {
  jackpotSiren();
  coinCascade(40);
  noiseBurst(0.8, 0.09);
  thump(90, 50, 0.5, 0.25, 1.5);
}

// --- Megaways cues ----------------------------------------------------------

/** Winning symbols pop and the survivors tumble: a soft crunch + falling blip. */
export function tumble(): void {
  noiseKnock(900, 0.08, 0.16);
  tone(520, 0.05, 0.005, 0.12, 0, "triangle");
  tone(380, 0.05, 0.005, 0.14, 0.06, "triangle");
}

/** New symbols landing after a tumble — a soft, low thud. */
export function symbolLand(): void {
  thump(140, 60, 0.09, 0.14);
}

/** A scatter stops in view: bright, slightly dissonant chord that stacks up. */
export function scatterLand(count: number): void {
  const root = 660 + Math.min(count, 5) * 60;
  tone(root, 0.09, 0.01, 0.35, 0, "triangle");
  tone(root * 1.5, 0.06, 0.01, 0.3, 0.02, "sine");
  tone(root * 2.02, 0.03, 0.01, 0.25, 0.04, "sine");
  haptic("light");
}

/** Free-spin multiplier ticks up: a ping rising a semitone per level. */
export function multiplierUp(level: number): void {
  const f = 880 * Math.pow(1.0595, Math.min(level, 24));
  tone(f, 0.08, 0.005, 0.22, 0, "triangle");
  tone(f * 2, 0.03, 0.005, 0.15, 0.01, "sine");
}

/** Free spins triggered: fanfare plus a rising siren tail. */
export function freeSpinsTrigger(): void {
  bigWinFanfare("big");
  for (let i = 0; i < 6; i++) {
    tone(440 * Math.pow(1.12, i), 0.07, 0.01, 0.2, 0.9 + i * 0.09, "sawtooth");
  }
  haptic("heavy");
}
