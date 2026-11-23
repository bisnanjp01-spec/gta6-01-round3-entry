// Emberline — sound, synthesized live with WebAudio. No audio files:
// rain hiss, engine hum, sirens, gunshots and a slow neon bass line are
// all oscillators and noise buffers built at run time. Everything is
// guarded so a browser without audio, or one that has not been clicked
// yet, never throws.
export function makeAudio() {
  return {
    ctx: null, master: null, muted: false, musicTimer: 0, engineOsc: null,
    engineGain: null, rainGain: null, started: false,
  };
}

function ensure(audio) {
  if (audio.ctx) return audio.ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    return audio.ctx;
  } catch (e) {
    return null;
  }
}

export function audioUnlock(audio) {
  const ctx = ensure(audio);
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  if (ctx && !audio.started) {
    audio.started = true;
    startRain(audio);
    startEngine(audio);
  }
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function startRain(audio) {
  try {
    const ctx = audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    audio.rainGain = ctx.createGain();
    audio.rainGain.gain.value = 0.05;
    src.connect(filter).connect(audio.rainGain).connect(audio.master);
    src.start();
  } catch (e) {}
}

function startEngine(audio) {
  try {
    const ctx = audio.ctx;
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = "sawtooth";
    audio.engineOsc.frequency.value = 55;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    audio.engineOsc.connect(filter).connect(audio.engineGain).connect(audio.master);
    audio.engineOsc.start();
  } catch (e) {}
}

export function audioEngine(audio, speed, maxSpeed) {
  if (!audio.ctx || !audio.engineOsc) return;
  try {
    const f = 50 + (Math.abs(speed) / maxSpeed) * 130;
    audio.engineOsc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.08);
    audio.engineGain.gain.setTargetAtTime(audio.master ? 0.05 : 0, audio.ctx.currentTime, 0.1);
  } catch (e) {}
}

function blip(audio, freq, dur, type, vol, slideTo) {
  const ctx = ensure(audio);
  if (!ctx || !audio.master) return;
  try {
    const osc = ctx.createOscillator();
    osc.type = type || "square";
    osc.frequency.value = freq;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = vol || 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(audio.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch (e) {}
}

function noiseBurst(audio, dur, vol, freq) {
  const ctx = ensure(audio);
  if (!ctx || !audio.master) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq || 2400;
    const g = ctx.createGain();
    g.gain.value = vol || 0.2;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(audio.master);
    src.start();
  } catch (e) {}
}

export function audioShot(audio) { noiseBurst(audio, 0.12, 0.25, 3000); blip(audio, 160, 0.08, "square", 0.1, 60); }
export function audioPickup(audio) { blip(audio, 660, 0.12, "sine", 0.14, 990); }
export function audioCash(audio) { blip(audio, 880, 0.1, "sine", 0.14); setTimeout(() => blip(audio, 1320, 0.14, "sine", 0.14), 90); }
export function audioCrash(audio) { noiseBurst(audio, 0.3, 0.3, 900); }
export function audioSiren(audio) { blip(audio, 700, 0.4, "sine", 0.05, 950); }
export function audioBusted(audio) { blip(audio, 220, 0.5, "sawtooth", 0.12, 110); }
export function audioClick(audio) { blip(audio, 440, 0.05, "sine", 0.08); }

export function audioMusicStep(audio, dt, step) {
  if (!audio.ctx || audio.muted) return;
  audio.musicTimer -= dt;
  if (audio.musicTimer > 0) return;
  audio.musicTimer = 0.42;
  // Slow neon bass line in A minor, deterministic from the step counter.
  const scale = [55, 65.41, 82.41, 98, 110, 130.81, 164.81];
  const note = scale[step % scale.length];
  blip(audio, note, 0.4, "triangle", 0.07);
  if (step % 8 === 4) blip(audio, note * 2, 0.3, "sine", 0.05);
}

export function audioSetMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
}
