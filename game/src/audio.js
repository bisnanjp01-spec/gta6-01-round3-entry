// audio.js — all sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, police siren, gunshots, pickups and a small bass-and-hats groove
// are built from oscillators and filtered noise, started only after the player
// presses a button (browsers require a user gesture for audio).
const SoundEngine = {
  ctx: null, master: null, muted: false, musicTimer: null, musicStep: 0,
  engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },
  startEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 320;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  },
  setEngine(speedNorm, driving) {
    if (!this.engineOsc) return;
    const target = driving ? 0.05 + speedNorm * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, this.ctx.currentTime, 0.08);
  },
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "triangle";
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 880;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this._sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this._sirenLfo.stop(); } catch (e) {}
      this.sirenOsc = null;
    }
  },
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type || "square"; o.frequency.value = freq || 660;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.12, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + (dur || 0.12));
  },
  noiseBurst(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * (dur || 0.15));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = freq || 1800;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.25;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
  },
  gunshot() { this.noiseBurst(0.12, 0.3, 2400); this.blip(140, 0.08, "sawtooth", 0.15); },
  punch() { this.noiseBurst(0.08, 0.2, 700); },
  pickup() { this.blip(880, 0.1, "sine", 0.16); this.blip(1320, 0.14, "sine", 0.12); },
  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, "triangle", 0.16), i * 110));
  },
  crash() { this.noiseBurst(0.3, 0.35, 500); },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // A slow sunset groove: bass notes on a fixed pattern, hats from noise.
    const bass = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const note = bass[this.musicStep % bass.length];
      if (note) this.blip(note, 0.24, "triangle", 0.10);
      if (this.musicStep % 2 === 0) this.noiseBurst(0.03, 0.03, 6000);
      this.musicStep++;
    }, 240);
  },
};
