/* CONFLUENCE - game.js
   Screens, input and the loop. The loop is dt-driven and has a watchdog,
   because a hidden panel stops firing requestAnimationFrame entirely.
*/
(function (CF) {
'use strict';
var T = CF.TILE, A = CF.art, R = CF.render;
var G = CF.game = {};

var S = null, cv, gx, raf = null, last = 0, speed = 1, paused = false;
var picked = null;                 // tower key currently being placed
var ended = false;                 // latch so the result screen fires exactly once
var seen = {};                     // bestiary entries earned by meeting them

function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function screen(name) {
  ['title','play','result'].forEach(function (s) {
    var n = $('scr-' + s);
    if (n) n.classList.toggle('on', s === name);
  });
}

/* ── boot ───────────────────────────────────────────────────────────── */
G.boot = function () {
  cv = $('board');
  gx = cv.getContext('2d');
  cv.width = CF.COLS*T; cv.height = CF.ROWS*T;

  CF.loadSettings();
  CF.applyDifficulty();

  /* browsers will not start audio before a gesture */
  function wake() { CF.audio.start(); CF.audio.resume(); CF.audio.syncVolume(); }
  document.addEventListener('pointerdown', wake, { once:false });
  document.addEventListener('keydown', wake, { once:false });

  CF.onEvent = function (kind, a) {
    if (kind === 'spawn') {
      if (G.markMet(a)) {
        var dd = CF.ENEMIES[a];
        toast(dd.name + ' — ' + dd.demand);
      }
      return;
    }
    var au = CF.audio;
    if (!au.ready()) return;
    if (kind === 'reaction') au.reaction(a);
    else if (kind === 'spawn') { /* handled below, before the audio guard */ }
    else if (kind === 'shot') au.shot(a);
    else if (kind === 'death') au.death(a);
    else if (kind === 'leak') au.leak();
    else if (kind === 'build') au.build();
    else if (kind === 'sell') au.sell();
    else if (kind === 'wave') au.wave();
    else if (kind === 'ability') au.ability(a);
    else if (kind === 'win') au.win();
    else if (kind === 'lose') au.lose();
  };

  A.build();
  buildPalette();
  buildCodex();
  buildSettings();
  startIntro();

  $('btn-begin').onclick = function () { newRun(); };
  $('btn-codex').onclick = function () { $('codex').classList.add('on'); };
  $('btn-settings').onclick = openSettings;
  $('btn-settings2').onclick = openSettings;
  $('settings-close').onclick = function () { $('settings').classList.remove('on'); };
  $('settings-reset').onclick = function () {
    CF.resetSettings(); CF.applyDifficulty(); buildSettings();
  };
  $('btn-codex2').onclick = function () { $('codex').classList.add('on'); };
  $('codex-close').onclick = function () { $('codex').classList.remove('on'); };
  $('btn-again').onclick = function () { newRun(); };
  $('btn-menu').onclick = function () { screen('title'); startIntro(); };
  $('btn-wave').onclick = function () { if (S) CF.startWave(S); };
  $('btn-pause').onclick = function () { togglePause(); };
  $('pz-resume').onclick = function () { togglePause(false); };
  $('pz-book').onclick = function () { $('codex').classList.add('on'); };
  $('pz-set').onclick = openSettings;
  $('pz-quit').onclick = function () {
    togglePause(false);
    stopIntro();
    screen('title');
    startIntro();
  };
  [1,2,3].forEach(function (m) {
    $('sp-' + m).onclick = function () { setSpeed(m); };
  });

  cv.addEventListener('mousemove', onMove);
  cv.addEventListener('mouseleave', function () { R.view.hover = null; R.view.ghost = null; });
  cv.addEventListener('click', onClick);
  cv.addEventListener('contextmenu', onRight);
  document.addEventListener('keydown', onKey);

  screen('title');
  CF.booted = true;
  $('boot').remove();

  /* A hidden panel or a background tab never fires rAF. The watchdog covers
     that -- but it has to advance by the time that ACTUALLY elapsed, sliced
     for stability. Stepping a flat 33ms per fire runs the game in slow
     motion for as long as the tab is not composited. */
  loop(performance.now());
  setInterval(function () {
    var now = performance.now();
    if (now - last <= 400) return;
    var dt = Math.min(1.0, (now - last)/1000);
    last = now;
    var slices = Math.max(1, Math.ceil(dt/0.05));
    for (var i = 0; i < slices; i++) tick(dt/slices);
  }, 250);
};

/* exposed so a run can be inspected and driven from the console */
G.state = function () { return S; };
G.setSpeed = function (m) { setSpeed(m); };

function newRun() {
  CF.applyDifficulty();
  S = CF.newGame((Math.random()*1e9)|0);
  seen = {};
  picked = null; paused = false; ended = false; taught = {};
  hudPrev = { gold:null, lives:null, wave:0 };
  $('pause-veil').classList.remove('on');
  R.view = { hover:null, sel:null, ghost:null, heroSel:S.heroes[0] };
  setSpeed(parseInt(CF.settings.speed, 10) || 1);
  stopIntro();
  screen('play');
  buildHeroBar();
  syncPalette();
  toast('Wave 1 approaches. Lay an element, then lay a different one on top of it.');
}

/* ── loop ───────────────────────────────────────────────────────────── */
function loop(now) {
  raf = requestAnimationFrame(loop);
  var dt = Math.min(0.05, (now - last)/1000);
  last = now;
  tick(dt);
}

function tick(dt) {
  if (S && !paused && !S.over) {
    if (!CF.settings.autowave && !S.waveActive && S.wave > 0) S.gap = 1e9;
    for (var i = 0; i < speed; i++) CF.step(S, dt);
    S.enemies.forEach(function (e) { seen[e.key] = true; });
    tutorialTick();
  }
  /* Outside the guard above, and latched: the run can end on any path, and a
     finished run that never shows its result is the worst failure here. */
  if (S && S.over && !ended) { ended = true; endRun(); }
  if (S) {
    R.draw(gx, S, dt);
    syncHud();
  }
  introTick(dt);
}

function setSpeed(m) {
  speed = m; paused = false;
  [1,2,3].forEach(function (k) { $('sp-' + k).classList.toggle('on', k === m); });
  $('btn-pause').textContent = 'PAUSE';
}
function togglePause(force) {
  paused = (force === undefined) ? !paused : force;
  $('btn-pause').textContent = paused ? 'RESUME' : 'PAUSE';
  var veil = $('pause-veil');
  veil.classList.toggle('on', paused);
  if (paused && S) {
    var left = CF.WAVES.length - S.wave;
    $('pause-sub').textContent = S.wave === 0
      ? 'Nothing has come up ' + CF.PLACE.road + ' yet.'
      : left > 0
        ? 'Wave ' + S.wave + ' of ' + CF.WAVES.length + '. ' + left +
          ' still to come, and ' + S.lives + ' may pass you.'
        : 'The last of them.';
  }
}

/* ── the wall: tower palette ─────────────────────────────────────────── */
function buildPalette() {
  var host = $('palette');
  host.innerHTML = '';
  CF.TOWER_ORDER.forEach(function (key, i) {
    var d = CF.TOWERS[key], e = CF.EL[d.el];
    var b = el('button', 'pal');
    b.dataset.key = key;
    b.innerHTML =
      '<span class="pal-key">' + (i+1) + '</span>' +
      '<span class="pal-badge" style="--c:' + e.col + '"></span>' +
      '<span class="pal-name">' + d.name + '</span>' +
      '<span class="pal-el" style="color:' + e.col + '">' + e.name + '</span>' +
      '<span class="pal-cost">' + d.cost + '</span>';
    b.onclick = function () { pick(key); };
    b.onmouseenter = function () { hint(d.name + ' — ' + d.blurb); };
    b.onmouseleave = function () { hint(''); };
    host.appendChild(b);
  });
}
function pick(key) {
  picked = (picked === key) ? null : key;
  R.view.sel = null;
  syncPalette();
}
function syncPalette() {
  if (!S) return;
  [].forEach.call(document.querySelectorAll('.pal'), function (b) {
    var d = CF.TOWERS[b.dataset.key];
    b.classList.toggle('on', picked === b.dataset.key);
    b.classList.toggle('poor', S.gold < d.cost);
  });
}

/* ── heroes ──────────────────────────────────────────────────────────── */
function buildHeroBar() {
  var host = $('heroes');
  host.innerHTML = '';
  var cap = el('div', 'hero-cap',
    'Field ' + S.heroes.length + ' of ' + CF.HERO_SLOTS +
    ' \u2014 pick the element your towers lack');
  host.appendChild(cap);
  CF.HERO_ORDER.forEach(function (key) {
    var d = CF.HEROES[key];
    var owned = S.heroes.some(function (h) { return h.key === key; });
    var full = S.heroes.length >= CF.HERO_SLOTS;
    var card = el('div', 'hero' + (owned ? '' : ' locked'));
    card.dataset.key = key;
    card.innerHTML =
      '<div class="hero-top" style="--c:' + CF.EL[d.el].col + '">' +
        '<b>' + d.name + '</b><i>' + CF.EL[d.el].name + '</i></div>' +
      '<div class="hero-hp"><i></i></div>' +
      (owned
        ? '<button class="hero-ab">' + d.ability.name + '</button>' +
          (d.free ? '' : '<button class="hero-go">DISMISS</button>')
        : '<button class="hero-buy"' + (full ? ' disabled' : '') + '>' +
          (full ? 'NO SLOT' : 'HIRE ' + d.cost) + '</button>');
    host.appendChild(card);

    if (owned) {
      card.querySelector('.hero-ab').onclick = function (ev) {
        ev.stopPropagation();
        var h = heroOf(key);
        if (!CF.heroAbility(S, h)) toast(h.alive ? d.ability.name + ' is not ready.' : d.name + ' has fallen.');
      };
      card.onclick = function () {
        R.view.heroSel = heroOf(key);
        syncHeroBar();
        hint('Click the board to send ' + d.name + ' there.');
      };
      var go = card.querySelector('.hero-go');
      if (go) go.onclick = function (ev) {
        ev.stopPropagation();
        var h = heroOf(key);
        CF.dismissHero(S, h);
        if (R.view.heroSel === h) R.view.heroSel = S.heroes[0] || null;
        buildHeroBar();
        toast(d.name + ' goes home. The slot is free for another element.');
      };
    } else {
      card.querySelector('.hero-buy').onclick = function (ev) {
        ev.stopPropagation();
        if (S.heroes.length >= CF.HERO_SLOTS) {
          toast('You may field ' + CF.HERO_SLOTS + '. Dismiss one to make room \u2014 ' +
                'a third would add nothing anyway.');
          return;
        }
        if (S.gold < d.cost) { toast('Not enough gold to hire ' + d.name + '.'); return; }
        S.gold -= d.cost; S.stats.spent += d.cost;
        var h = CF.addHero(S, key);
        R.view.heroSel = h;
        buildHeroBar();
        toast(d.name + ' takes the field. ' + CF.EL[d.el].name +
              ' now goes wherever you send ' + d.name + '.');
      };
    }
    card.onmouseenter = function () { hint(d.name + ', ' + d.title + ' — ' + d.blurb + ' ' + d.ability.blurb); };
    card.onmouseleave = function () { hint(''); };
  });
  syncHeroBar();
}
function heroOf(key) {
  for (var i = 0; i < S.heroes.length; i++) if (S.heroes[i].key === key) return S.heroes[i];
  return null;
}
function syncHeroBar() {
  [].forEach.call(document.querySelectorAll('.hero'), function (card) {
    var h = heroOf(card.dataset.key);
    card.classList.toggle('sel', !!h && R.view.heroSel === h);
    if (!h) {
      var buy = card.querySelector('.hero-buy');
      if (buy && !buy.disabled) buy.classList.toggle('poor', S.gold < CF.HEROES[card.dataset.key].cost);
      return;
    }
    var bar = card.querySelector('.hero-hp i');
    if (bar) bar.style.width = Math.round(100*Math.max(0, h.hp/h.maxHp)) + '%';
    var ab = card.querySelector('.hero-ab');
    if (ab) {
      var ready = h.alive && h.cd <= 0;
      ab.classList.toggle('cool', !ready);
      ab.textContent = h.alive
        ? (ready ? h.def.ability.name : Math.ceil(h.cd) + 's')
        : 'DOWN ' + Math.ceil(h.respawnT) + 's';
    }
  });
}

/* ── HUD ─────────────────────────────────────────────────────────────── */
var hudPrev = { gold:null, lives:null, wave:0 };

function flash(id, amount) {
  var n = $(id);
  if (!n) return;
  n.textContent = (amount > 0 ? '+' : '') + amount;
  n.className = 'delta show ' + (amount > 0 ? 'up' : 'down');
  setTimeout(function () { n.className = 'delta'; }, 1000);
}

function syncHud() {
  var gold = Math.floor(S.gold);
  $('hud-gold').textContent = gold;
  $('hud-lives').textContent = S.lives;
  $('hud-wave').textContent = Math.max(1, S.wave) + ' / ' + CF.WAVES.length;
  var lv = $('hud-lives');
  lv.classList.toggle('low', S.lives <= 5);

  /* money and the toll are the two numbers worth watching, so a change to
     either has to be visible without staring at it */
  if (hudPrev.gold !== null && gold !== hudPrev.gold) {
    var dg = gold - hudPrev.gold;
    if (Math.abs(dg) >= 5) flash('hud-gold-d', dg);
  }
  if (hudPrev.lives !== null && S.lives < hudPrev.lives) {
    flash('hud-lives-d', S.lives - hudPrev.lives);
    lv.classList.remove('hurt'); void lv.offsetWidth; lv.classList.add('hurt');
  }
  hudPrev.gold = gold; hudPrev.lives = S.lives;

  if (S.wave !== hudPrev.wave) {
    if (S.wave > 0) showBanner(S.wave);
    hudPrev.wave = S.wave;
  }

  /* the bar shows either how far through the wave you are, or how long the
     quiet lasts -- both are things you are actually waiting on */
  var bar = $('hud-wavebar'), box = bar && bar.parentNode;
  if (bar) {
    if (S.waveActive) {
      var w = CF.WAVES[S.wave-1];
      var total = 0;
      w.g.forEach(function (gp) { total += gp[1]; });
      var left = S.spawnQueue.length + S.enemies.length;
      box.classList.remove('rest');
      bar.style.width = Math.round(100*(1 - Math.min(1, left/Math.max(1, total)))) + '%';
    } else {
      box.classList.add('rest');
      bar.style.width = Math.round(100*(1 - Math.max(0, Math.min(1, S.gap/CF.WAVE_GAP)))) + '%';
    }
  }

  /* what is actually coming next, so the wall can be prepared for it */
  var nx = $('hud-next');
  if (nx) {
    var idx = S.waveActive ? S.wave : S.wave;      // the wave not yet begun
    var nw = CF.WAVES[idx];
    if (!nw) nx.innerHTML = '';
    else {
      var kinds = {};
      nw.g.forEach(function (gp) { kinds[gp[0]] = (kinds[gp[0]] || 0) + gp[1]; });
      var names = Object.keys(kinds).slice(0, 3).map(function (k) {
        return '<b>' + kinds[k] + '\u00d7</b> ' + CF.ENEMIES[k].name;
      });
      nx.innerHTML = 'next: ' + names.join(', ') +
        (Object.keys(kinds).length > 3 ? ' \u2026' : '');
    }
  }

  var btn = $('btn-wave');
  if (S.waveActive) {
    btn.disabled = true;
    btn.textContent = 'WAVE ' + S.wave + ' IN PROGRESS';
  } else if (S.wave >= CF.WAVES.length) {
    btn.disabled = true; btn.textContent = '—';
  } else {
    btn.disabled = false;
    btn.textContent = S.wave === 0 ? 'BEGIN' : 'CALL WAVE ' + (S.wave+1) + '  (+gold)';
  }
  syncPalette();
  syncHeroBar();
  syncSel();
}

function syncSel() {
  var box = $('sel'), t = R.view.sel;
  if (!t) { box.classList.remove('on'); return; }
  box.classList.add('on');
  var st = CF.stat(t), up = CF.upgradeCost(t), e = CF.EL[t.el];
  box.innerHTML =
    '<div class="sel-head" style="--c:' + e.col + '"><b>' + t.def.name +
      '</b><span>tier ' + (t.tier+1) + ' / 3</span></div>' +
    '<div class="sel-stats">' +
      '<span>element</span><b style="color:' + e.col + '">' + e.name + '</b>' +
      '<span>damage</span><b>' + st.dmg + '</b>' +
      '<span>every</span><b>' + st.rof.toFixed(2) + 's</b>' +
      '<span>range</span><b>' + st.range.toFixed(1) + '</b>' +
    '</div>' +
    '<div class="sel-btns">' +
      (up != null
        ? '<button id="sel-up"' + (S.gold < up ? ' class="poor"' : '') + '>UPGRADE ' + up + '</button>'
        : '<button disabled>MAX TIER</button>') +
      '<button id="sel-sell" class="ghost">SELL ' + Math.floor(t.invested*CF.SELL_RATE) + '</button>' +
    '</div>';
  var u = $('sel-up');
  if (u) u.onclick = function () {
    if (!CF.upgradeTower(S, t)) toast('Not enough gold.');
  };
  $('sel-sell').onclick = function () { CF.sellTower(S, t); R.view.sel = null; };
}

var hintT = 0;
function hint(txt) { $('hint').textContent = txt; }
function toast(txt) {
  var n = $('toast');
  n.textContent = txt;
  n.classList.add('on');
  clearTimeout(hintT);
  hintT = setTimeout(function () { n.classList.remove('on'); }, 4200);
}

/* ── input ───────────────────────────────────────────────────────────── */
function toBoard(ev) {
  var b = cv.getBoundingClientRect();
  return {
    x: (ev.clientX - b.left) * (cv.width / b.width),
    y: (ev.clientY - b.top) * (cv.height / b.height)
  };
}
function onMove(ev) {
  if (!S) return;
  var p = toBoard(ev);
  var c = Math.floor(p.x/T), r = Math.floor(p.y/T);
  if (picked) {
    var ok = CF.canBuild(S, c, r) && S.gold >= CF.TOWERS[picked].cost;
    R.view.ghost = { key:picked, x:(c+0.5)*T, y:(r+0.5)*T, ok:ok };
    R.view.hover = null;
  } else {
    R.view.ghost = null;
    R.view.hover = S.towerAt[c+','+r] || null;
  }
}
function onClick(ev) {
  if (!S || S.over) return;
  var p = toBoard(ev);
  var c = Math.floor(p.x/T), r = Math.floor(p.y/T);

  if (picked) {
    var d = CF.TOWERS[picked];
    if (!CF.canBuild(S, c, r)) { CF.audio.deny(); toast('Towers only go on the flagstone plots.'); return; }
    if (S.gold < d.cost) { CF.audio.deny(); toast('Not enough gold for a ' + d.name + '.'); return; }
    var t = CF.placeTower(S, picked, c, r);
    if (t) {
      R.view.sel = t;
      if (!ev.shiftKey) { picked = null; R.view.ghost = null; }
      syncPalette();
    }
    return;
  }
  var hit = S.towerAt[c+','+r];
  if (hit) { R.view.sel = hit; return; }
  if (R.view.heroSel && R.view.heroSel.alive) {
    CF.setRally(S, R.view.heroSel, p.x, p.y);
    return;
  }
  R.view.sel = null;
}
function onRight(ev) {
  ev.preventDefault();
  if (!S) return;
  if (picked) { picked = null; R.view.ghost = null; syncPalette(); return; }
  var p = toBoard(ev);
  if (R.view.heroSel && R.view.heroSel.alive) CF.setRally(S, R.view.heroSel, p.x, p.y);
}
function onKey(ev) {
  if (!S) return;
  var k = ev.key.toLowerCase();
  if (k >= '1' && k <= '4') { pick(CF.TOWER_ORDER[+k - 1]); return; }
  if (k === 'escape') {
    if ($('codex').classList.contains('on')) { $('codex').classList.remove('on'); return; }
    if ($('settings').classList.contains('on')) { $('settings').classList.remove('on'); return; }
    if (paused) { togglePause(false); return; }
    if (picked || R.view.sel) { picked = null; R.view.ghost = null; R.view.sel = null; syncPalette(); return; }
    togglePause(true);
    return;
  }
  if (k === ' ') { ev.preventDefault(); if (!S.waveActive) CF.startWave(S); return; }
  if (k === 'p') togglePause();
  if (k === 'c') $('codex').classList.toggle('on');
  if (k === 'q' || k === 'w' || k === 'e') {
    var idx = { q:0, w:1, e:2 }[k];
    var h = S.heroes[idx];
    if (h) CF.heroAbility(S, h);
  }
}

/* ── settings ────────────────────────────────────────────────────────── */
function openSettings() { buildSettings(); $('settings').classList.add('on'); }

function buildSettings() {
  var host = $('settings-body');
  host.innerHTML = '';
  CF.SETTINGS_DEF.forEach(function (d) {
    var row = el('div', 'set-row');
    row.innerHTML = '<div class="set-label">' + d.label + '</div>' +
                    '<div class="set-note">' + d.note + '</div>';
    var ctl = el('div', 'set-ctl');

    function mk(label, val) {
      var b = el('button', null, label);
      if (CF.settings[d.key] === val) b.className = 'on';
      b.onclick = function () {
        CF.settings[d.key] = val;
        CF.saveSettings();
        if (d.key === 'difficulty') CF.applyDifficulty();
        if (d.key === 'volume') { CF.audio.start(); CF.audio.syncVolume(); }
        if (d.key === 'speed' && S) setSpeed(parseInt(val, 10) || 1);
        buildSettings();
      };
      ctl.appendChild(b);
    }

    if (d.type === 'toggle') {
      mk('ON', true); mk('OFF', false);
    } else {
      d.options.forEach(function (o) {
        var lbl = d.key === 'difficulty' ? CF.DIFFICULTY[o].name
                : d.key === 'speed' ? o + '\u00d7'
                : o.charAt(0).toUpperCase() + o.slice(1);
        mk(lbl, o);
      });
    }
    row.appendChild(ctl);

    if (d.key === 'difficulty') {
      var dd = CF.DIFFICULTY[CF.settings.difficulty];
      var note = el('div', 'set-diff',
        dd.blurb + '  \u2014  ' + dd.lives + ' may reach the gate.');
      row.appendChild(note);
    }
    host.appendChild(row);
  });
}

/* ── the title screen teaches the rule before you press anything ──────
   A tiny scripted loop on a background canvas: something walks in, takes an
   element, takes a DIFFERENT element, and reacts. That is the whole game.
*/
var introOn = false, introT = 0, introS = null, introStep = 0;
var INTRO_PAIRS = [
  ['ember','gale'], ['tide','gale'], ['ember','tide'],
  ['gale','stone'], ['tide','stone'], ['ember','stone']
];
var introIdx = 0;

function startIntro() {
  var c = $('introcv');
  if (!c) return;
  c.width = CF.COLS*T; c.height = CF.ROWS*T;
  introS = CF.newGame(99);
  introReset();
  introOn = true;
}
function stopIntro() { introOn = false; }
var INTRO_FROM = 0.40;          // the demo plays on a stretch that is on screen
function introReset() {
  introS.enemies.length = 0;
  introS.fx.length = 0;
  introS.zones.length = 0;
  introS.shots.length = 0;
  introT = 0; introStep = 0;
  var kinds = ['husk','golem','cinder','drowned','husk','acolyte'];
  var base = CF.path().total * INTRO_FROM;
  for (var i = 0; i < 6; i++) {
    var e = CF.spawnEnemy(introS, kinds[(introIdx + i) % kinds.length]);
    e.d = base - i*46;
    var pp = CF.posAt(e.d); e.x = pp.x; e.y = pp.y;
    e.born = introS.t - 1;
  }
}
function introTick(dt) {
  if (!introOn || !introS) return;
  var quiet = CF.onEvent; CF.onEvent = null;   // the menu demo stays silent
  try { introBody(dt); } finally { CF.onEvent = quiet; }
}
function introBody(dt) {
  if (!$('scr-title').classList.contains('on')) return;
  introT += dt;

  var pair = INTRO_PAIRS[introIdx % INTRO_PAIRS.length];
  var live = introS.enemies.filter(function (e) { return !e.dead; });

  if (introStep === 0 && introT > 1.6 && live.length) {
    live.forEach(function (e) { CF.applyElement(introS, e, pair[0]); });
    introStep = 1;
    setCap('a foe takes ' + CF.EL[pair[0]].name.toUpperCase());
  } else if (introStep === 1 && introT > 3.0 && live.length) {
    live.forEach(function (e) { CF.applyElement(introS, e, pair[1]); });
    introStep = 2;
    var rr = CF.REACT[CF.rk(pair[0], pair[1])];
    setCap(CF.EL[pair[0]].name + ' + ' + CF.EL[pair[1]].name + '  \u2192  ' + rr.name);
  } else if (introStep === 2 && introT > 5.2) {
    introIdx++; introReset();
  }
  if (introT < 1.4) setCap('');

  CF.step(introS, dt);

  var g2 = $('introcv').getContext('2d');
  CF.render.draw(g2, introS, dt);
}
function setCap(t) {
  var n = $('intro-cap');
  if (n && n.textContent !== t) n.textContent = t;
}

/* Waves get a name so the run has landmarks rather than a counter. */
var WAVE_NAMES = [
  'First light', 'Stragglers', 'The green flood', 'Two who are warded',
  'Stonework', 'A wider flood', 'Hooves on the ruts', 'Coalsmen',
  'Stone and ward', 'The wet company', 'Coal and cairn', 'A choir of wards',
  'Everything at a run', 'The long press', 'Drowned column', 'Plate and hoof',
  'All of it', 'THE SUNDERED IDOL'
];

function showBanner(n) {
  var b = $('banner');
  if (!b) return;
  var w = CF.WAVES[n-1];
  var kinds = {};
  w.g.forEach(function (gp) { kinds[gp[0]] = (kinds[gp[0]] || 0) + gp[1]; });
  var line = Object.keys(kinds).map(function (k) {
    return kinds[k] + '\u00d7 ' + CF.ENEMIES[k].name;
  }).join('   \u00b7   ');
  b.innerHTML =
    '<div class="bn-w">' + (w.boss ? 'the last of them' : 'wave ' + n) + '</div>' +
    '<div class="bn-n">' + (WAVE_NAMES[n-1] || ('Wave ' + n)) + '</div>' +
    '<div class="bn-s">' + line + '</div>';
  b.classList.remove('on');
  void b.offsetWidth;                       // restart the animation
  b.classList.add('on');
}

/* ── the book -────────────────────────────────────────────────────────
   Four tabs. The bestiary only fills in as you actually meet things, and
   what it records is the VERB each foe demands -- which is the only thing
   about it you can act on.
*/
var codexTab = 'react';

function metKey() { return 'confluence.met.v1'; }
function loadMet() {
  try { return JSON.parse(localStorage.getItem(metKey()) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveMet(m) {
  try { localStorage.setItem(metKey(), JSON.stringify(m)); } catch (e) {}
}
var met = loadMet();
G.markMet = function (key) {
  if (met[key]) return false;
  met[key] = 1; saveMet(met);
  return true;
};

function buildCodex() {
  var head = document.querySelector('#codex .tabs');
  if (head && !head._wired) {
    head._wired = true;
    [].forEach.call(head.querySelectorAll('.tab'), function (b) {
      b.onclick = function () {
        codexTab = b.dataset.tab;
        [].forEach.call(head.querySelectorAll('.tab'), function (o) {
          o.classList.toggle('on', o === b);
        });
        renderCodex();
      };
    });
  }
  renderCodex();
}

function renderCodex() {
  var host = $('codex-body');
  if (!host) return;
  host.innerHTML = '';
  if (codexTab === 'react') codexReactions(host);
  else if (codexTab === 'best') codexBestiary(host);
  else if (codexTab === 'wall') codexWall(host);
  else codexKeys(host);
}

function codexReactions(host) {
  host.appendChild(el('p', 'codex-lede',
    'A foe carries <b>one</b> element. Lay a second, <b>different</b> element on ' +
    'it and the two react, spend themselves, and leave it unable to hold anything ' +
    'new for a moment. Doubling one element never reacts \u2014 a wall of one colour ' +
    'is a wall that does almost nothing.'));

  var grid = el('div', 'react-grid');
  CF.REACT_TABLE.forEach(function (pair) {
    var r = CF.REACT[CF.rk(pair[0], pair[1])];
    var a = CF.EL[pair[0]], b = CF.EL[pair[1]];
    var card = el('div', 'react-card');
    card.style.setProperty('--c', r.col);
    card.innerHTML =
      '<div class="rc-pair">' +
        '<span class="dot" style="--d:' + a.col + '"></span>' + a.name +
        '<em>+</em>' +
        '<span class="dot" style="--d:' + b.col + '"></span>' + b.name +
      '</div>' +
      '<div class="rc-name">' + r.name + '</div>' +
      '<div class="rc-blurb">' + r.blurb + '</div>';
    grid.appendChild(card);
  });
  host.appendChild(grid);

  host.appendChild(el('p', 'codex-foot-note',
    'Order matters. The tower that fires first lays the element; the next one ' +
    'that reaches the same foe decides what happens. An element is laid by the ' +
    'shot that was <b>aimed</b> \u2014 a splash wounds a clump but leaves only its ' +
    'target carrying anything.'));
}

function codexBestiary(host) {
  var total = Object.keys(CF.ENEMIES).length;
  var known = Object.keys(CF.ENEMIES).filter(function (k) { return met[k]; }).length;
  host.appendChild(el('p', 'codex-lede',
    'Recorded on ' + CF.PLACE.road + ': <b>' + known + ' of ' + total + '</b>. ' +
    'Entries fill in when a thing actually reaches you.'));

  var list = el('div', 'best-grid');
  Object.keys(CF.ENEMIES).forEach(function (k) {
    var d = CF.ENEMIES[k];
    var seen = !!met[k];
    var card = el('div', 'best-card' + (seen ? '' : ' unknown') + (d.boss ? ' boss' : ''));

    var art = el('div', 'best-art');
    var img = CF.art.enemies && CF.art.enemies[k];
    if (img) {
      var c2 = CF.art.cv(78, 78);
      var g2 = c2.getContext('2d');
      var sc = Math.min(70/img.width, 70/img.height);
      g2.translate(39, 39);
      g2.scale(sc, sc);
      if (!seen) { g2.filter = 'brightness(0)'; g2.globalAlpha = 0.55; }
      g2.drawImage(img, -img.width/2, -img.height/2);
      art.appendChild(c2);
    }
    card.appendChild(art);

    var body = el('div', 'best-body');
    if (seen) {
      body.innerHTML =
        '<div class="bc-name">' + d.name + (d.boss ? '<em>toll-breaker</em>' : '') + '</div>' +
        '<div class="bc-stats">' +
          '<span>vigour</span><b>' + d.hp + '</b>' +
          '<span>pace</span><b>' + d.speed.toFixed(2) + '</b>' +
          (d.armor ? '<span>plate</span><b>' + d.armor + '</b>' : '') +
          '<span>toll</span><b>' + d.leak + '</b>' +
        '</div>' +
        '<div class="bc-demand"><i>demands</i>' + d.demand + '</div>' +
        '<div class="bc-note">' + d.note + '</div>';
    } else {
      body.innerHTML =
        '<div class="bc-name">&mdash;</div>' +
        '<div class="bc-note">Not yet seen on this road.</div>';
    }
    card.appendChild(body);
    list.appendChild(card);
  });
  host.appendChild(list);
}

function codexWall(host) {
  host.appendChild(el('p', 'codex-lede',
    'Every tower is an <b>applier</b> first and a weapon second. What matters is ' +
    'how often it lands its element and where, not what it does per shot.'));

  var grid = el('div', 'react-grid');
  CF.TOWER_ORDER.forEach(function (k) {
    var d = CF.TOWERS[k], e = CF.EL[d.el], t0 = d.tiers[0];
    var card = el('div', 'react-card');
    card.style.setProperty('--c', e.col);
    card.innerHTML =
      '<div class="rc-pair"><span class="dot" style="--d:' + e.col + '"></span>' +
        e.name + '<em>\u00b7</em>' + d.cost + 'g</div>' +
      '<div class="rc-name" style="font-size:15px">' + d.name + '</div>' +
      '<div class="rc-stats">' +
        '<span>hits for</span><b>' + t0.dmg + '</b>' +
        '<span>every</span><b>' + t0.rof.toFixed(2) + 's</b>' +
        '<span>reach</span><b>' + t0.range.toFixed(1) + '</b>' +
        '<span>lays element</span><b>' + (60/t0.rof/60).toFixed(2) + '/s</b>' +
      '</div>' +
      '<div class="rc-blurb">' + d.blurb + '</div>';
    grid.appendChild(card);
  });
  host.appendChild(grid);

  host.appendChild(el('h3', null, 'Those who walk'));
  var hg = el('div', 'react-grid');
  CF.HERO_ORDER.forEach(function (k) {
    var d = CF.HEROES[k], e = CF.EL[d.el];
    var card = el('div', 'react-card');
    card.style.setProperty('--c', e.col);
    card.innerHTML =
      '<div class="rc-pair"><span class="dot" style="--d:' + e.col + '"></span>' +
        e.name + '<em>\u00b7</em>' + (d.cost ? d.cost + 'g' : 'sworn') + '</div>' +
      '<div class="rc-name" style="font-size:15px">' + d.name + ', ' + d.title + '</div>' +
      '<div class="rc-blurb">' + d.blurb + ' <b style="color:' + e.col + '">' +
        d.ability.name + ':</b> ' + d.ability.blurb + '</div>';
    hg.appendChild(card);
  });
  host.appendChild(hg);
  host.appendChild(el('p', 'codex-foot-note',
    'You may field <b>' + CF.HERO_SLOTS + '</b>. A third would add nothing \u2014 a foe ' +
    'can only be reacted so often, however many appliers you own. Send one home ' +
    'to make room for a different element.'));
}

function codexKeys(host) {
  var k = el('div', 'keys');
  k.innerHTML =
    '<b>1 \u2013 4</b><span>choose a tower, then click a foundation</span>' +
    '<b>Click a tower</b><span>inspect, upgrade or sell it</span>' +
    '<b>Click a hero, then the board</b><span>send them there</span>' +
    '<b>Q W E</b><span>hero abilities</span>' +
    '<b>Space</b><span>call the next wave early, for gold</span>' +
    '<b>Shift + click</b><span>keep placing the same tower</span>' +
    '<b>Right-click</b><span>cancel placement, or send the selected hero</span>' +
    '<b>P</b><span>pause</span>' +
    '<b>C</b><span>open and close this book</span>' +
    '<b>Esc</b><span>close whatever is open</span>';
  host.appendChild(k);
  host.appendChild(el('p', 'codex-foot-note',
    'You hold ' + CF.PLACE.gate + ' on ' + CF.PLACE.road + '. They come out of ' +
    CF.PLACE.arch + ' and they only ever go one way.'));
}

/* ── teaching the one rule ────────────────────────────────────────────
   The book explains it, but a player who never opens the book will build a
   wall of one colour and conclude the game is unfair. These fire once, in
   response to what the player has actually done.
*/
var taught = {};
function teach(key, msg) {
  if (taught[key]) return;
  taught[key] = 1;
  toast(msg);
}

function tutorialTick() {
  if (!S || S.wave === 0) return;
  var els = {};
  S.towers.forEach(function (t) { els[t.el] = (els[t.el] || 0) + 1; });
  var kinds = Object.keys(els).length;
  var total = 0;
  Object.keys(S.stats.reactions).forEach(function (k) { total += S.stats.reactions[k]; });

  if (S.towers.length >= 1 && kinds === 1) {
    teach('one', 'One element on its own never reacts. Put a DIFFERENT element ' +
                 'further along the road and watch what happens when they meet.');
  }
  if (kinds >= 2 && total === 0 && S.wave >= 2) {
    teach('order', 'Two elements, but nothing is pairing. They have to reach the ' +
                   'same foe — put them close enough that the first aura is still ' +
                   'on it when the second arrives.');
  }
  if (total >= 1) {
    teach('first', 'That was a confluence. The two elements spent themselves, and ' +
                   'that foe will not hold a new one for a moment.');
  }
  if (S.stats.leaks > 0) {
    teach('leak', 'One got through. The toll is what you are actually defending — ' +
                  'at zero, the road is theirs.');
  }
  var golems = S.enemies.some(function (e) { return e.def.armor > 0 && e.shredT <= 0; });
  if (golems && !els.gale) {
    teach('grit', 'Plate turns almost everything. Gale and Stone together scour it ' +
                  'off — without that, your wall is barely scratching them.');
  }
}

/* ── ending -─────────────────────────────────────────────────────────── */
function endRun() {
  screen('result');
  var won = S.won;
  $('r-title').textContent = won ? 'THE ROAD HELD' : 'THE TOLL IS BROKEN';
  $('r-title').className = won ? 'win' : 'lose';
  $('r-over').textContent = won ? 'the ninth toll stands' : CF.PLACE.gate;
  $('r-sub').textContent = won
    ? 'Eighteen waves up ' + CF.PLACE.road + ', and the pairs never failed you.'
    : 'They reached the gate on wave ' + S.wave + ' of ' + CF.WAVES.length + '.';

  var tot = 0;
  Object.keys(S.stats.reactions).forEach(function (k) { tot += S.stats.reactions[k]; });
  var share = S.stats.dmgReact + S.stats.dmgDirect > 0
    ? Math.round(100*S.stats.dmgReact/(S.stats.dmgReact + S.stats.dmgDirect)) : 0;

  var rows = [
    ['Slain', S.stats.kills],
    ['Leaked past you', S.stats.leaks],
    ['Reactions triggered', tot],
    ['Damage from reactions', share + '%'],
    ['Gold earned', Math.round(S.stats.earned)]
  ];
  var knownNow = Object.keys(CF.ENEMIES).filter(function (k) { return met[k]; }).length;
  rows.push(['Recorded in the book', knownNow + ' of ' + Object.keys(CF.ENEMIES).length]);
  var box = $('r-lines');
  box.innerHTML = rows.map(function (r) {
    return '<div class="ledger-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
  }).join('');

  var best = el('div', 'r-react');
  best.innerHTML = '<h4>Which reactions you leaned on</h4>';
  var maxv = Math.max(1, Math.max.apply(null, Object.keys(S.stats.reactions).map(function (k) { return S.stats.reactions[k]; })));
  CF.REACT_TABLE.forEach(function (pair) {
    var r = CF.REACT[CF.rk(pair[0], pair[1])];
    var v = S.stats.reactions[r.key] || 0;
    var bar = el('div', 'rbar');
    bar.innerHTML = '<span>' + r.name + '</span>' +
      '<i style="width:' + Math.round(100*v/maxv) + '%;background:' + r.col + '"></i>' +
      '<b>' + v + '</b>';
    best.appendChild(bar);
  });
  box.appendChild(best);

  /* say something true about how THIS run went, not a stock line */
  var top = null, topN = -1, used = 0;
  Object.keys(S.stats.reactions).forEach(function (k) {
    if (S.stats.reactions[k] > 0) used++;
    if (S.stats.reactions[k] > topN) { topN = S.stats.reactions[k]; top = k; }
  });
  var line;
  if (tot === 0) {
    line = 'Not one confluence the whole way. A wall of one colour is a wall ' +
           'that does almost nothing \u2014 that is the entire lesson of this road.';
  } else if (used <= 2) {
    line = 'You leaned on ' + used + ' of the six. There is a pairing for every ' +
           'thing that walks up here, and most of them you never reached for.';
  } else if (share >= 70) {
    line = 'Most of what you did was done by the pairs, not the towers. That is ' +
           'the road being played the way it was built.';
  } else if (won) {
    line = 'Held, and mostly by ' + top.toUpperCase() + '. Worth asking what ' +
           'the other five would have saved you.';
  } else {
    line = 'It came apart at wave ' + S.wave + '. Look at which pairing you never ' +
           'once had ready, and put it on the road earlier.';
  }
  $('r-closing').textContent = line;
}

window.addEventListener('DOMContentLoaded', function () {
  try { G.boot(); }
  catch (err) {
    console.error(err);
    var b = $('boot');
    if (b) { b.innerHTML = '<b>Failed to start.</b><br>' + err.message; b.style.color = '#d4553f'; }
  }
});

})(window.CF);
