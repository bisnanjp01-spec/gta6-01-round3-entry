// audio.js — synthesized sound only (WebAudio). No audio files, no network.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Engine hum: low sawtooth whose pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      this.engineOsc.connect(lp).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      // Police siren: triangle wave wobbling between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (_e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.sirenGain) this.sirenGain.gain.value = 0;
    }
  }

  // Short synthesized blip. freq in Hz, dur in seconds, type, volume 0..1.
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (_e) { /* audio is best-effort */ }
  }

  shoot() { this.blip(880, 0.09, 'square', 0.14); this.blip(220, 0.12, 'sawtooth', 0.1); }
  punch() { this.blip(140, 0.08, 'sine', 0.2); }
  pickup() { this.blip(523, 0.1, 'sine', 0.14); this.blip(784, 0.16, 'sine', 0.14); }
  missionDone() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.18, 'triangle', 0.16), i * 110);
    });
  }
  busted() { this.blip(196, 0.5, 'sawtooth', 0.16); this.blip(147, 0.7, 'sawtooth', 0.16); }
  crash() { this.blip(70, 0.25, 'sawtooth', 0.2); }

  // Called every frame: engine pitch follows speed, siren wails while wanted.
  update(dt, speed01, wanted) {
    if (!this.ctx || this.muted) return;
    this.sirenTimer += dt;
    try {
      if (this.engineGain) {
        this.engineGain.gain.value = speed01 > 0.02 ? 0.03 + speed01 * 0.05 : 0;
        if (this.engineOsc) this.engineOsc.frequency.value = 55 + speed01 * 110;
      }
      if (this.sirenGain && this.sirenOsc) {
        if (wanted > 0) {
          this.sirenGain.gain.value = 0.035;
          const phase = Math.floor(this.sirenTimer * 1.6) % 2;
          this.sirenOsc.frequency.value = phase === 0 ? 700 : 950; // classic two-tone wail
        } else {
          this.sirenGain.gain.value = 0;
        }
      }
    } catch (_e) { /* best-effort */ }
  }
}
