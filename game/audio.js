// audio.js — procedural sound for Solstice City: no audio files, only the
// Web Audio API. Engine hum, sirens, gunshots, pickups and mission jingles,
// all synthesized at play time.
(function () {
  'use strict';

  var ctx = null;
  var muted = false;
  var engineOsc = null;
  var engineGain = null;
  var sirenTimer = null;

  function ensure() {
    if (!ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq, dur, type, vol, slideTo) {
    if (muted) return;
    var ac = ensure();
    if (!ac) return;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }

  function noiseBurst(dur, vol) {
    if (muted) return;
    var ac = ensure();
    if (!ac) return;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource();
    src.buffer = buf;
    var g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(g); g.connect(ac.destination);
    src.start();
  }

  function setEngine(on, speedRatio) {
    if (muted || !on) {
      if (engineOsc) { try { engineOsc.stop(); } catch (e) { /* already stopped */ } engineOsc = null; }
      return;
    }
    var ac = ensure();
    if (!ac) return;
    if (!engineOsc) {
      engineOsc = ac.createOscillator();
      engineGain = ac.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.setValueAtTime(0.03, ac.currentTime);
      engineOsc.connect(engineGain); engineGain.connect(ac.destination);
      engineOsc.start();
    }
    engineOsc.frequency.setValueAtTime(50 + speedRatio * 140, ac.currentTime);
  }

  function setSiren(on) {
    if (on && !sirenTimer && !muted) {
      var high = true;
      sirenTimer = setInterval(function () {
        if (muted) return;
        beep(high ? 660 : 520, 0.28, 'sine', 0.035);
        high = !high;
      }, 300);
    } else if (!on && sirenTimer) {
      clearInterval(sirenTimer);
      sirenTimer = null;
    }
  }

  function play(name) {
    if (muted) return;
    if (name === 'shoot') noiseBurst(0.12, 0.2);
    else if (name === 'pickup') { beep(880, 0.1, 'sine', 0.09); setTimeout(function () { beep(1320, 0.14, 'sine', 0.09); }, 90); }
    else if (name === 'crash') noiseBurst(0.25, 0.25);
    else if (name === 'mission') { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, 'triangle', 0.1); }, i * 130); }); }
    else if (name === 'busted') { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { beep(f, 0.3, 'sawtooth', 0.08); }, i * 200); }); }
    else if (name === 'steal') beep(300, 0.15, 'square', 0.07, 620);
  }

  function toggleMute() {
    muted = !muted;
    if (muted) { setEngine(false, 0); setSiren(false); }
    return muted;
  }

  window.SC.audio = {
    ensure: ensure, beep: beep, noiseBurst: noiseBurst, setEngine: setEngine,
    setSiren: setSiren, play: play, toggleMute: toggleMute,
    isMuted: function () { return muted; }
  };
})();
