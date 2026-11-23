// audio.js — all sound is synthesised with WebAudio. No audio files,
// no network: oscillators and filtered noise make the engine, siren,
// gunshots, pickups and a small bassline loop.

var AudioSys = {
  ctx: null,
  enabled: true,
  musicOn: true,
  engineOsc: null,
  engineGain: null,
  sirenOsc: null,
  sirenGain: null,
  sirenTimer: 0,
  musicStep: 0,
  musicTimer: null,
  bassNotes: [55, 0, 55, 65.4, 55, 0, 82.4, 73.4, 55, 0, 55, 65.4, 98, 82.4, 73.4, 65.4]
};

AudioSys.init = function () {
  if (this.ctx) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    var engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
    this.startMusic();
  } catch (e) {
    this.ctx = null;
  }
};

AudioSys.resume = function () {
  if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
};

AudioSys.setEngine = function (speedNorm, driving) {
  if (!this.ctx || !this.engineGain) return;
  var target = driving ? 0.045 + speedNorm * 0.06 : 0.0;
  this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 165, this.ctx.currentTime, 0.08);
};

AudioSys.setSiren = function (on) {
  if (!this.ctx || !this.sirenGain) return;
  this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.1);
  if (on) {
    this.sirenTimer += 1;
    var high = this.sirenTimer % 40 < 20;
    this.sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, this.ctx.currentTime, 0.05);
  }
};

AudioSys.blip = function (freq) {
  if (!this.ctx || !this.enabled) return;
  var t = this.ctx.currentTime;
  var o = this.ctx.createOscillator();
  var g = this.ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq || 660;
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g);
  g.connect(this.ctx.destination);
  o.start(t);
  o.stop(t + 0.2);
};

AudioSys.shot = function () {
  if (!this.ctx || !this.enabled) return;
  var t = this.ctx.currentTime;
  var dur = 0.14;
  var buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  var src = this.ctx.createBufferSource();
  src.buffer = buffer;
  var filter = this.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  var g = this.ctx.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(this.ctx.destination);
  src.start(t);
};

AudioSys.crash = function () {
  if (!this.ctx || !this.enabled) return;
  var t = this.ctx.currentTime;
  var o = this.ctx.createOscillator();
  var g = this.ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(this.ctx.destination);
  o.start(t);
  o.stop(t + 0.3);
};

AudioSys.startMusic = function () {
  var self = this;
  if (this.musicTimer) return;
  this.musicTimer = setInterval(function () {
    if (!self.ctx || !self.musicOn || !self.enabled) return;
    var note = self.bassNotes[self.musicStep % self.bassNotes.length];
    self.musicStep++;
    if (!note) return;
    var t = self.ctx.currentTime;
    var o = self.ctx.createOscillator();
    var g = self.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = note;
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g);
    g.connect(self.ctx.destination);
    o.start(t);
    o.stop(t + 0.34);
  }, 170);
};

AudioSys.toggleMusic = function () {
  this.musicOn = !this.musicOn;
  return this.musicOn;
};
