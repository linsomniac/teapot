// AudioContext lifecycle (§11.2): created/resumed on the FIRST user gesture
// (autoplay policy); on every resume-from-pause gesture and on the
// context's statechange event, resume() again whenever state !== 'running'
// — this covers Safari's 'interrupted' re-suspension (kept per C1 even
// though Safari is not acceptance-gated in v1).

export interface AudioSystem {
  // Call on ANY user gesture (start keypress, title click, resume click/P).
  ensureRunning(): void;
  context(): AudioContext | null;
  output(): GainNode | null; // master gain (mute lives here)
  setMuted(muted: boolean): void;
  muted(): boolean;
}

export function createAudioSystem(initialMuted: boolean): AudioSystem {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let mutedFlag = initialMuted;

  function applyMute(): void {
    if (master !== null) {
      master.gain.value = mutedFlag ? 0 : 1;
    }
  }

  return {
    ensureRunning(): void {
      if (ctx === null) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyMute();
        ctx.addEventListener('statechange', () => {
          if (ctx !== null && ctx.state !== 'running') {
            void ctx.resume().catch(() => {
              // A rejected resume just waits for the next gesture.
            });
          }
        });
      }
      if (ctx.state !== 'running') {
        void ctx.resume().catch(() => {});
      }
    },
    context: () => ctx,
    output: () => master,
    setMuted(muted: boolean): void {
      mutedFlag = muted;
      applyMute();
    },
    muted: () => mutedFlag,
  };
}
