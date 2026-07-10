// Synthesized SFX (§11.2): oscillators/noise + envelopes, no assets, no
// music. One distinct sound per listed event; SimEvent[] → sounds. Exact
// synthesis parameters are the implementer's choice — per-SFX audible
// distinctness is verified by the §15 manual checklist (decision C3).

import type { SimEvent } from '../sim/types';
import type { AudioSystem } from './context';

interface ToneSpec {
  wave: OscillatorType;
  f0: number; // start frequency
  f1: number; // end frequency (exponential glide)
  t: number; // duration seconds
  g: number; // peak gain
  delay?: number; // seconds after "now"
}

function tone(ac: AudioContext, out: AudioNode, spec: ToneSpec): void {
  const start = ac.currentTime + (spec.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = spec.wave;
  osc.frequency.setValueAtTime(Math.max(1, spec.f0), start);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(1, spec.f1),
    start + spec.t,
  );
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(spec.g, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.t);
  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(start + spec.t + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

function noise(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  g: number,
  delay = 0,
): void {
  if (noiseBuffer === null || noiseBuffer.sampleRate !== ac.sampleRate) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1; // render-side entropy is fine (§12.2)
    }
  }
  const start = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(g, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + t);
  src.connect(gain);
  gain.connect(out);
  src.start(start);
  src.stop(start + t + 0.02);
}

export interface Sfx {
  onEvents(events: readonly SimEvent[]): void;
}

export function createSfx(audio: AudioSystem): Sfx {
  function play(ev: SimEvent, ac: AudioContext, out: AudioNode): void {
    switch (ev.type) {
      case 'playerShot':
        tone(ac, out, { wave: 'square', f0: 900, f1: 240, t: 0.07, g: 0.12 });
        break;
      case 'enemyShot':
        tone(ac, out, { wave: 'sawtooth', f0: 320, f1: 140, t: 0.12, g: 0.1 });
        break;
      case 'enemyKilled':
        noise(ac, out, 0.14, 0.18);
        tone(ac, out, { wave: 'sawtooth', f0: 240, f1: 60, t: 0.16, g: 0.16 });
        break;
      case 'playerDied':
        noise(ac, out, 0.72, 0.34);
        noise(ac, out, 0.22, 0.2, 0.12);
        tone(ac, out, { wave: 'sawtooth', f0: 180, f1: 24, t: 0.75, g: 0.3 });
        tone(ac, out, {
          wave: 'triangle',
          f0: 520,
          f1: 55,
          t: 0.42,
          g: 0.16,
          delay: 0.06,
        });
        break;
      case 'flip':
        tone(ac, out, { wave: 'triangle', f0: 480, f1: 720, t: 0.06, g: 0.09 });
        break;
      case 'superzap':
        tone(ac, out, { wave: 'sawtooth', f0: 70, f1: 1400, t: 0.4, g: 0.24 });
        noise(ac, out, 0.35, 0.16);
        break;
      case 'warpStart':
        tone(ac, out, { wave: 'sine', f0: 900, f1: 90, t: 1.2, g: 0.2 });
        tone(ac, out, { wave: 'triangle', f0: 1200, f1: 120, t: 1.2, g: 0.08 });
        break;
      case 'spikeHit':
        tone(ac, out, { wave: 'square', f0: 1300, f1: 950, t: 0.035, g: 0.09 });
        break;
      case 'pulseTelegraph':
        tone(ac, out, { wave: 'square', f0: 950, f1: 1500, t: 0.3, g: 0.12 });
        break;
      case 'bonusLife':
        tone(ac, out, { wave: 'square', f0: 660, f1: 660, t: 0.09, g: 0.14 });
        tone(ac, out, {
          wave: 'square',
          f0: 880,
          f1: 880,
          t: 0.09,
          g: 0.14,
          delay: 0.1,
        });
        tone(ac, out, {
          wave: 'square',
          f0: 1320,
          f1: 1320,
          t: 0.16,
          g: 0.14,
          delay: 0.2,
        });
        break;
      case 'highScoreJingle': {
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((f, i) => {
          tone(ac, out, {
            wave: 'triangle',
            f0: f,
            f1: f,
            t: 0.14,
            g: 0.14,
            delay: i * 0.12,
          });
        });
        break;
      }
      case 'uiMove':
        tone(ac, out, { wave: 'square', f0: 600, f1: 600, t: 0.03, g: 0.07 });
        break;
      case 'uiConfirm':
        tone(ac, out, { wave: 'square', f0: 880, f1: 1250, t: 0.07, g: 0.11 });
        break;
    }
  }

  return {
    onEvents(events): void {
      if (events.length === 0 || audio.muted()) return;
      const ac = audio.context();
      const out = audio.output();
      // A still-suspended context (resume() is async) ACCEPTS scheduled
      // sources — they play the moment it reaches running, so the gesture
      // tick's own uiConfirm/shot sounds aren't dropped.
      if (ac === null || out === null) return;
      for (const ev of events) {
        play(ev, ac, out);
      }
    },
  };
}
