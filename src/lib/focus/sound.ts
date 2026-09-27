"use client";

/** Synthesized notification sounds (no audio assets, works offline). */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture (e.g. pressing Start) so later sounds are allowed to play. */
export function unlockAudio() {
  audio();
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export type SoundType = "chime" | "bell" | "beep";

export function playSound(type: SoundType, volume = 0.6) {
  const ac = audio();
  if (!ac || volume <= 0) return;
  const t = ac.currentTime + 0.02;
  const v = Math.min(1, volume) * 0.4;
  if (type === "chime") {
    tone(ac, 659.25, t, 0.6, v);
    tone(ac, 987.77, t + 0.18, 0.9, v);
  } else if (type === "bell") {
    tone(ac, 523.25, t, 1.6, v);
    tone(ac, 1046.5, t, 1.2, v * 0.4);
    tone(ac, 1567.98, t, 0.8, v * 0.2);
  } else {
    tone(ac, 880, t, 0.12, v, "square");
    tone(ac, 880, t + 0.2, 0.12, v, "square");
    tone(ac, 880, t + 0.4, 0.12, v, "square");
  }
}
