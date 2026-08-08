"use client";

/**
 * Low-level synthesized-audio primitives via the Web Audio API — no audio
 * files, sprites, or Howler.js. The AudioContext is created lazily on first
 * use (autoplay policy) and every call is a no-op when muted or unsupported.
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

export function tone(
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

function noiseSlice(c: AudioContext, duration: number): AudioBuffer {
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

export function filteredNoiseSweep(
  fromHz: number,
  toHz: number,
  duration: number,
  peak: number
): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const src = c.createBufferSource();
  src.buffer = noiseSlice(c, duration);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(fromHz, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(toHz, c.currentTime + duration);
  const gain = c.createGain();
  envelope(src, gain, peak, 0.05, duration);
  src.connect(filter);
  filter.connect(gain);
  src.start();
}

export function noiseBurst(duration: number, peak: number): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const src = c.createBufferSource();
  src.buffer = noiseSlice(c, duration);
  const gain = c.createGain();
  envelope(src, gain, peak, 0.005, duration);
  src.connect(gain);
  src.start();
}

/**
 * A short filtered noise transient — the percussive "body" of a mechanical
 * impact. Lowpassed so it reads as a wooden/metal knock rather than a hiss.
 */
export function noiseKnock(
  cutoffHz: number,
  duration: number,
  peak: number,
  when = 0
): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const src = c.createBufferSource();
  src.buffer = noiseSlice(c, duration);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(cutoffHz, c.currentTime + when);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(cutoffHz * 0.35, 80),
    c.currentTime + when + duration
  );
  const gain = c.createGain();
  envelope(src, gain, peak, 0.002, duration, when);
  src.connect(filter);
  filter.connect(gain);
  src.start(c.currentTime + when);
}

/**
 * A pitch-dropping tone — the resonant "thump" that follows an impact.
 * Detuning downward is what makes a hit read as physical rather than as a
 * musical note.
 */
export function thump(
  fromHz: number,
  toHz: number,
  duration: number,
  peak: number,
  when = 0
): void {
  const c = ensureCtx();
  if (!c || muted) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(fromHz, c.currentTime + when);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(toHz, 20),
    c.currentTime + when + duration
  );
  envelope(osc, gain, peak, 0.004, duration, when);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + duration + 0.05);
}

/**
 * Sustained detuned-sawtooth motor whir, used under the reel spin. Returns a
 * stop function so the caller can cut it when the reels finish.
 */
export function motorWhir(peak: number): () => void {
  const c = ensureCtx();
  if (!c || muted) return () => {};
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, c.currentTime + 0.15);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;

  const oscs = [78, 81.5].map((freq) => {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start();
    return osc;
  });

  // Slow vibrato so the whir breathes instead of sitting perfectly static.
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = 3;
  lfo.connect(lfoGain);
  oscs.forEach((osc) => lfoGain.connect(osc.frequency));
  lfo.start();

  filter.connect(gain);
  gain.connect(c.destination);

  return () => {
    const t = c.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    oscs.forEach((osc) => osc.stop(t + 0.25));
    lfo.stop(t + 0.25);
  };
}
