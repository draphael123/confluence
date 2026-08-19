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
  $('btn-pause').onclick = togglePause;
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
  picked = null; paused = false; ended = false;
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
function togglePause() {
  paused = !paused;
  $('btn-pause').textContent = paused ? 'RESUME' : 'PAUSE';
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
  CF.HERO_ORDER.forEach(function (key) {
    var d = CF.HEROES[key];
    var owned = S.heroes.some(function (h) { return h.key === key; });
    var card = el('div', 'hero' + (owned ? '' : ' locked'));
    card.dataset.key = key;
    card.innerHTML =
      '<div class="hero-top" style="--c:' + CF.EL[d.el].col + '">' +
        '<b>' + d.name + '</b><i>' + CF.EL[d.el].name + '</i></div>' +
      '<div class="hero-hp"><i></i></div>' +
      (owned
        ? '<button class="hero-ab">' + d.ability.name + '</button>'
        : '<button class="hero-buy">HIRE ' + d.cost + '</button>');
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
    } else {
      card.querySelector('.hero-buy').onclick = function (ev) {
        ev.stopPropagation();
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
      if (buy) buy.classList.toggle('poor', S.gold < CF.HEROES[card.dataset.key].cost);
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
function syncHud() {
  $('hud-gold').textContent = Math.floor(S.gold);
  $('hud-lives').textContent = S.lives;
  $('hud-wave').textContent = Math.max(1, S.wave) + ' / ' + CF.WAVES.length;
  var lv = $('hud-lives');
  lv.classList.toggle('low', S.lives <= 5);

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
    if (!CF.canBuild(S, c, r)) { toast('Towers only go on the flagstone plots.'); return; }
    if (S.gold < d.cost) { toast('Not enough gold for a ' + d.name + '.'); return; }
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
  if (k === 'escape') { picked = null; R.view.ghost = null; R.view.sel = null; syncPalette(); return; }
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

/* ── codex -──────────────────────────────────────────────────────────── */
function buildCodex() {
  var host = $('codex-body');
  host.innerHTML = '';

  var intro = el('p', 'codex-lede',
    'An enemy carries <b>one</b> element at a time. Lay a second, different ' +
    'element on it and the two react, spend themselves, and leave the target ' +
    'unable to hold anything new for a moment. Doubling up on one element ' +
    'never reacts — so a wall of one colour is a wall that does almost nothing.');
  host.appendChild(intro);

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

  host.appendChild(el('h3', null, 'What comes down the road'));
  var list = el('div', 'bestiary');
  Object.keys(CF.ENEMIES).forEach(function (k) {
    var d = CF.ENEMIES[k];
    var row = el('div', 'best-row');
    row.dataset.key = k;
    row.innerHTML =
      '<span class="best-swatch" style="--c:' + d.col + '"></span>' +
      '<span class="best-name">' + d.name + '</span>' +
      '<span class="best-demand">' + d.demand + '</span>';
    list.appendChild(row);
  });
  host.appendChild(list);
}

/* ── ending ──────────────────────────────────────────────────────────── */
function endRun() {
  screen('result');
  var won = S.won;
  $('r-title').textContent = won ? 'THE ROAD HELD' : 'THE GATE IS BROKEN';
  $('r-title').className = won ? 'win' : 'lose';
  $('r-sub').textContent = won
    ? 'Eighteen waves, and the confluence never failed you.'
    : 'You reached wave ' + S.wave + ' of ' + CF.WAVES.length + '.';

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
