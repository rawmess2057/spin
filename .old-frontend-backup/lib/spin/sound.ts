"use client";

/**
 * Synthesized slot-machine sounds via the Web Audio API — no audio files.
 * The AudioContext is created lazily on the first user gesture (autoplay
 * policy) and everything is guarded against missing audio support.
 */

const MUTE_KEY = "spin.sound.muted";

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // localStorage unavailable; stay unmuted.
}

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // ignore persistence failures
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function envelope(
  node: AudioNode,
  gain: GainNode,
  peak: number,
  attack: number,
  release: number,
  when = 0
): void {
  const t0 = ctx!.currentTime + when;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
  node.connect(gain);
  gain.connect(ctx!.destination);
}

function tone(
  freq: number,
  peak: number,
  attack: number,
  release: number,
  when = 0,
  type: OscillatorType = "sine"
): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + when);
  envelope(osc, gain, peak, attack, release, when);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + attack + release + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

function noise(c: AudioContext, duration: number): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const slice = c.createBuffer(
    1,
    Math.floor(c.sampleRate * duration),
    c.sampleRate
  );
  slice.copyToChannel(
    noiseBuffer.getChannelData(0).slice(0, Math.floor(c.sampleRate * duration)),
    0
  );
  return slice;
}

/** Rising filtered-noise whoosh when the reels start. */
export function spinStart(): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const src = c.createBufferSource();
  src.buffer = noise(c, 0.5);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2200, c.currentTime + 0.4);
  const gain = c.createGain();
  envelope(src, gain, 0.12, 0.05, 0.4);
  src.connect(filter);
  filter.connect(gain);
  src.start();
}

/** Short mechanical tick as a reel comes to a stop. */
export function reelStop(reelIndex: number): void {
  tone(900 + reelIndex * 160, 0.18, 0.005, 0.09, 0, "square");
}

/** Outcome sound: a low thud for losses. */
export function lose(): void {
  tone(110, 0.25, 0.01, 0.35, 0, "sine");
  tone(55, 0.15, 0.01, 0.5, 0.02, "sine");
}

/**
 * Outcome sound for a win: a rising arpeggio, longer and brighter for big
 * wins. `multiplierBp` is the payout multiplier in basis points.
 */
export function win(multiplierBp: bigint): void {
  const mult = Number(multiplierBp) / 10_000;
  const big = mult >= 10;
  const notes = big
    ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]
    : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone(f, 0.16, 0.01, big ? 0.35 : 0.22, i * (big ? 0.16 : 0.11), "triangle");
    tone(f * 2, 0.05, 0.01, 0.18, i * (big ? 0.16 : 0.11), "sine");
  });
}
