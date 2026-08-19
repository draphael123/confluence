/* CONFLUENCE - audio.js
   Everything is synthesised in the browser. No asset files, nothing to load,
   nothing to 404, and it stays inside the same "self-contained, no CDN"
   constraint as the rest of the game.

   The point is not decoration. Each of the six reactions gets its own VOICE,
   so the reaction that fired is legible with your eyes elsewhere on the board
   -- a third channel for the core rule, alongside colour and shape.
*/
(function (CF) {
'use strict';

var A = CF.audio = {};
var ctx = null, master = null, started = false;
var lastAt = {};                    // per-voice throttle, so 40 kills is not 40 clicks

A.ready = function () { return !!ctx; };

/* Browsers refuse to start audio before a gesture, so this is called from the
   first click or key rather than at boot. */
A.start = function () {
  if (started) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch (e) { return; }
  master = ctx.createGain();
  master.gain.value = vol();
  master.connect(ctx.destination);
  started = true;
};
A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };

function vol() {
  var v = CF.settings && CF.settings.volume;
  if (v === 'off') return 0;
  if (v === 'low') return 0.16;
  if (v === 'high') return 0.55;
  return 0.32;
}
A.syncVolume = function () { if (master) master.gain.value = vol(); };

function now() { return ctx.currentTime; }

/* throttle a voice so a crowd cannot machine-gun it */
function gate(key, minGap) {
  var t = ctx.currentTime;
  if (lastAt[key] && t - lastAt[key] < minGap) return false;
  lastAt[key] = t;
  return true;
}

/* ── primitives ─────────────────────────────────────────────────────── */
function env(node, t0, attack, hold, release, peak) {
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0001, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone(type, f0, f1, t0, dur, peak, detune) {
  var o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  if (detune) o.detune.value = detune;
  env(o, t0, Math.min(0.012, dur*0.2), dur*0.25, dur*0.75, peak);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
  return o;
}

var noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    var n = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random()*2 - 1;
  }
  var s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function noiseHit(t0, dur, type, f0, f1, q, peak) {
  var s = noise();
  var f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q || 1;
  f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  s.connect(f);
  env(f, t0, 0.006, dur*0.2, dur*0.85, peak);
  s.start(t0);
  s.stop(t0 + dur + 0.08);
  return s;
}

/* ── the six reactions, each with its own voice ─────────────────────── */
var REACT_VOICE = {
  /* a scalding hiss that falls away as it pushes them back */
  steam: function (t) {
    noiseHit(t, 0.55, 'bandpass', 4200, 900, 1.4, 0.42);
    tone('sine', 720, 300, t, 0.28, 0.10);
  },
  /* a whoosh with a bright crackling tail as it leaps target to target */
  firestorm: function (t) {
    noiseHit(t, 0.42, 'lowpass', 900, 2600, 0.9, 0.40);
    tone('sawtooth', 180, 90, t, 0.30, 0.14);
    for (var i = 0; i < 5; i++) {
      noiseHit(t + 0.06 + i*0.055, 0.09, 'highpass', 2600, 3400, 1, 0.12);
    }
  },
  /* a deep tearing rumble: the ground opening */
  magma: function (t) {
    tone('sawtooth', 90, 38, t, 0.7, 0.30);
    noiseHit(t, 0.75, 'lowpass', 320, 120, 0.8, 0.34);
    tone('square', 62, 46, t + 0.04, 0.5, 0.12);
  },
  /* a hard glassy snap, then stillness -- it must SOUND like a stop */
  frost: function (t) {
    noiseHit(t, 0.10, 'highpass', 5200, 6400, 1, 0.34);
    tone('triangle', 1900, 1300, t, 0.16, 0.20);
    tone('triangle', 2600, 2100, t + 0.02, 0.13, 0.12);
    tone('sine', 420, 300, t + 0.05, 0.32, 0.08);
  },
  /* thick, wet, low -- the only reaction that is not bright */
  mire: function (t) {
    noiseHit(t, 0.45, 'lowpass', 420, 160, 1.6, 0.34);
    tone('sine', 150, 74, t, 0.36, 0.16);
    tone('sine', 96, 62, t + 0.09, 0.28, 0.10);
  },
  /* a rasping scour, metal being stripped */
  grit: function (t) {
    noiseHit(t, 0.34, 'bandpass', 1800, 3400, 3.2, 0.40);
    noiseHit(t + 0.02, 0.22, 'highpass', 3000, 4200, 1, 0.20);
    tone('square', 300, 190, t, 0.14, 0.10);
  }
};

A.reaction = function (key) {
  if (!ctx || !REACT_VOICE[key]) return;
  if (!gate('r:' + key, 0.07)) return;
  REACT_VOICE[key](now());
};

/* ── towers, one timbre per element ─────────────────────────────────── */
var SHOT = {
  ember: function (t) { tone('sawtooth', 420, 200, t, 0.10, 0.07); },
  tide:  function (t) { tone('sine', 300, 150, t, 0.13, 0.09); },
  gale:  function (t) { noiseHit(t, 0.07, 'highpass', 2800, 3800, 1, 0.05); },
  stone: function (t) { tone('square', 150, 80, t, 0.16, 0.10);
                        noiseHit(t, 0.14, 'lowpass', 500, 220, 1, 0.10); }
};
A.shot = function (el) {
  if (!ctx || !SHOT[el]) return;
  if (!gate('s:' + el, 0.055)) return;      // a wall of towers must not buzz
  SHOT[el](now());
};

A.hit = function () {
  if (!ctx || !gate('hit', 0.05)) return;
  noiseHit(now(), 0.05, 'bandpass', 1400, 800, 1.2, 0.07);
};

A.death = function (boss) {
  if (!ctx || !gate('death', boss ? 0 : 0.06)) return;
  var t = now();
  if (boss) {
    tone('sawtooth', 150, 40, t, 1.5, 0.38);
    noiseHit(t, 1.6, 'lowpass', 700, 90, 0.8, 0.40);
  } else {
    noiseHit(t, 0.16, 'lowpass', 900, 260, 1, 0.14);
    tone('triangle', 240, 110, t, 0.14, 0.08);
  }
};

/* a leak has to cut through everything else -- it is the only thing that
   actually costs you the run */
A.leak = function () {
  if (!ctx) return;
  var t = now();
  tone('square', 320, 150, t, 0.22, 0.26);
  tone('square', 240, 110, t + 0.13, 0.34, 0.22);
  noiseHit(t, 0.4, 'lowpass', 600, 160, 1, 0.18);
};

A.build = function () {
  if (!ctx) return;
  var t = now();
  tone('square', 200, 400, t, 0.07, 0.14);
  noiseHit(t + 0.03, 0.16, 'lowpass', 900, 300, 1, 0.16);
};
A.sell = function () {
  if (!ctx) return;
  tone('square', 400, 180, now(), 0.14, 0.12);
};
A.deny = function () {
  if (!ctx) return;
  tone('square', 180, 120, now(), 0.13, 0.14);
};
A.wave = function () {
  if (!ctx) return;
  var t = now();
  [392, 523.25, 659.25].forEach(function (f, i) {
    tone('triangle', f, f, t + i*0.09, 0.34, 0.13);
  });
};
A.ability = function (el) {
  if (!ctx) return;
  var t = now();
  tone('sawtooth', 260, 620, t, 0.22, 0.16);
  noiseHit(t, 0.3, 'bandpass', 900, 2400, 1.2, 0.18);
};
A.win = function () {
  if (!ctx) return;
  var t = now();
  [392, 493.88, 587.33, 783.99].forEach(function (f, i) {
    tone('triangle', f, f, t + i*0.16, 0.7, 0.16);
  });
};
A.lose = function () {
  if (!ctx) return;
  var t = now();
  [330, 262, 196, 147].forEach(function (f, i) {
    tone('sawtooth', f, f*0.98, t + i*0.2, 0.8, 0.14);
  });
};

})(window.CF);
