/* CONFLUENCE - sim.js
   The whole game rule-set, with no DOM and no canvas in it, so that the
   same code runs in the browser and in node for balance work.

   THE ONE RULE lives in CF.applyElement(): an enemy holds ONE aura.
   A second, different element reacts and consumes both.
*/
(function (CF) {
'use strict';

var T = CF.TILE;

/* The simulation stays free of any browser API -- it just says what happened
   and something else decides whether to make a noise about it. That is what
   keeps the whole rule-set runnable in node. */
CF.onEvent = null;
function say(kind, a, b) { if (CF.onEvent) CF.onEvent(kind, a, b); }
CF.say = say;

/* ── seeded rng ───────────────────────────────────────────────────── */
CF.makeRng = function (seed) {
  var s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
};

/* ── the road ─────────────────────────────────────────────────────── */
var PATH = null;
function buildPath() {
  var pts = CF.PATH.map(function (p) { return { x:(p[0]+0.5)*T, y:(p[1]+0.5)*T }; });
  var segs = [], total = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i+1];
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    segs.push({ a:a, b:b, len:len, at:total, ux:dx/len, uy:dy/len });
    total += len;
  }
  return { pts:pts, segs:segs, total:total };
}
CF.path = function () { if (!PATH) PATH = buildPath(); return PATH; };

CF.posAt = function (d) {
  var p = CF.path();
  if (d <= 0) { var s0 = p.segs[0]; return { x:s0.a.x + s0.ux*d, y:s0.a.y + s0.uy*d, ux:s0.ux, uy:s0.uy }; }
  for (var i = 0; i < p.segs.length; i++) {
    var s = p.segs[i];
    if (d <= s.at + s.len) {
      var k = d - s.at;
      return { x:s.a.x + s.ux*k, y:s.a.y + s.uy*k, ux:s.ux, uy:s.uy };
    }
  }
  var e = p.segs[p.segs.length-1];
  return { x:e.b.x, y:e.b.y, ux:e.ux, uy:e.uy };
};

/* shortest distance from a point to the road centreline, in pixels */
CF.roadDist = function (x, y) {
  var p = CF.path(), best = 1e9;
  for (var i = 0; i < p.segs.length; i++) {
    var s = p.segs[i];
    var vx = x - s.a.x, vy = y - s.a.y;
    var t = Math.max(0, Math.min(s.len, vx*s.ux + vy*s.uy));
    var dx = vx - s.ux*t, dy = vy - s.uy*t;
    var d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
};

/* ── the map ──────────────────────────────────────────────────────────
   You may only build on marked PLOTS. There are far fewer plots than
   there are towers you could afford, so the question stops being "can I
   afford another tower" and becomes "which element goes here". That is
   the whole game, so the map has to enforce it.
*/
function buildMap() {
  var rng = CF.makeRng(20260819);
  var p = CF.path();
  var road = {}, plots = {}, blocked = {};

  for (var r = 0; r < CF.ROWS; r++) {
    for (var c = 0; c < CF.COLS; c++) {
      var rd = CF.roadDist((c+0.5)*T, (r+0.5)*T);
      if (rd < CF.PATH_HALF*T) road[c+','+r] = true;
    }
  }

  /* walk the road and offer plots to either side at two set distances */
  var stepPx = CF.PLOT_SPACING * T;
  var offsets = [1.75, 2.85];
  for (var d = stepPx*0.5; d < p.total; d += stepPx) {
    var a = CF.posAt(d);
    var nx = -a.uy, ny = a.ux;                    // perpendicular to the road
    for (var side = -1; side <= 1; side += 2) {
      for (var oi = 0; oi < offsets.length; oi++) {
        var px = a.x + nx*offsets[oi]*T*side;
        var py = a.y + ny*offsets[oi]*T*side;
        var cc = Math.floor(px/T), rr = Math.floor(py/T);
        if (cc < 0 || rr < 0 || cc >= CF.COLS || rr >= CF.ROWS) continue;
        var key = cc+','+rr;
        if (road[key] || plots[key]) continue;
        if (CF.roadDist((cc+0.5)*T, (rr+0.5)*T) < (CF.PATH_HALF+0.35)*T) continue;
        plots[key] = true;
        break;                                    // one plot per side per step
      }
    }
  }

  /* everything that is neither road nor plot is scenery to look at */
  for (var r2 = 0; r2 < CF.ROWS; r2++) {
    for (var c2 = 0; c2 < CF.COLS; c2++) {
      var k2 = c2+','+r2;
      if (road[k2] || plots[k2]) continue;
      var rd2 = CF.roadDist((c2+0.5)*T, (r2+0.5)*T);
      if (rd2 > 1.5*T && rng() < 0.30) blocked[k2] = true;
    }
  }
  return { road:road, plots:plots, blocked:blocked, plotCount:Object.keys(plots).length };
}
var MAP = null;
CF.map = function () { if (!MAP) MAP = buildMap(); return MAP; };

/* Choosing a road invalidates every cached derivation of it. Forgetting one
   of these is exactly how you get a new map drawn over the old map's plots. */
CF.setMap = function (i) {
  i = Math.max(0, Math.min(CF.MAPS.length - 1, i|0));
  CF.mapIndex = i;
  CF.PATH = CF.MAPS[i].path;
  CF.PLOT_SPACING = CF.MAPS[i].plotSpacing;
  PATH = null;
  MAP = null;
  return CF.MAPS[i];
};

CF.canBuild = function (S, c, r) {
  if (c < 0 || r < 0 || c >= CF.COLS || r >= CF.ROWS) return false;
  var k = c+','+r;
  if (!CF.map().plots[k]) return false;
  return !S.towerAt[k];
};

/* ── state ────────────────────────────────────────────────────────── */
CF.newGame = function (seed) {
  var S = {
    t:0, seed:seed||1, rng:CF.makeRng(seed||1),
    gold:CF.START_GOLD, lives:CF.START_LIVES,
    wave:0, waveActive:false, gap:CF.WAVE_GAP, pending:[], spawnQueue:[],
    enemies:[], towers:[], towerAt:{}, shots:[], zones:[], fx:[], heroes:[],
    over:false, won:false,
    stats:{ kills:0, leaks:0, reactions:{}, dmgDirect:0, dmgReact:0, spent:0, earned:0 }
  };
  Object.keys(CF.REACT).forEach(function (k) { S.stats.reactions[CF.REACT[k].key] = 0; });
  CF.addHero(S, 'ashlin');
  return S;
};

/* ── heroes ───────────────────────────────────────────────────────── */
CF.addHero = function (S, key) {
  var d = CF.HEROES[key];
  if (!d) return null;
  if (S.heroes.some(function (h) { return h.key === key; })) return null;
  if (S.heroes.length >= CF.HERO_SLOTS) return null;
  var start = CF.posAt(CF.path().total * 0.72);
  var h = {
    key:key, def:d, el:d.el,
    x:start.x, y:start.y + 60, rx:start.x, ry:start.y + 60,
    hp:d.hp, maxHp:d.hp, alive:true, respawnT:0,
    atkT:0, cd:0, target:null, swing:0
  };
  S.heroes.push(h);
  return h;
};

/* ── building ─────────────────────────────────────────────────────── */
CF.placeTower = function (S, key, c, r) {
  var def = CF.TOWERS[key];
  if (!def || !CF.canBuild(S, c, r)) return null;
  if (S.gold < def.cost) return null;
  S.gold -= def.cost; S.stats.spent += def.cost;
  var t = {
    key:key, def:def, el:def.el, c:c, r:r,
    x:(c+0.5)*T, y:(r+0.5)*T,
    tier:0, cool:0, ang:0, invested:def.cost, flash:0, shots:0
  };
  S.towers.push(t);
  S.towerAt[c+','+r] = t;
  say('build');
  return t;
};

CF.upgradeCost = function (t) {
  var nx = t.def.tiers[t.tier+1];
  return nx ? nx.cost : null;
};
CF.upgradeTower = function (S, t) {
  var cost = CF.upgradeCost(t);
  if (cost == null || S.gold < cost) return false;
  S.gold -= cost; S.stats.spent += cost;
  t.invested += cost; t.tier++;
  S.fx.push({ kind:'upgrade', x:t.x, y:t.y - CF.TILE*0.4, t:0.6, max:0.6,
              col:CF.EL[t.el].col, seed:S.rng() });
  say('build');
  return true;
};
CF.sellTower = function (S, t) {
  var i = S.towers.indexOf(t);
  if (i < 0) return false;
  S.towers.splice(i, 1);
  delete S.towerAt[t.c+','+t.r];
  S.gold += Math.floor(t.invested * CF.SELL_RATE);
  say('sell');
  return true;
};
CF.stat = function (t) { return t.def.tiers[t.tier]; };

/* ── waves ────────────────────────────────────────────────────────── */
CF.startWave = function (S) {
  if (S.waveActive || S.wave >= CF.WAVES.length) return false;
  var early = Math.max(0, S.gap);
  if (S.wave > 0 && early > 0) {
    var bonus = Math.round(CF.WAVES[S.wave-1].bonus * (early / CF.WAVE_GAP) * 0.5);
    S.gold += bonus; S.stats.earned += bonus;
    S.lastEarly = bonus;
  } else S.lastEarly = 0;
  var w = CF.WAVES[S.wave];
  S.wave++;
  S.waveActive = true;
  S.gap = 0;
  S.spawnQueue = [];
  w.g.forEach(function (g) {
    for (var i = 0; i < g[1]; i++) {
      var jt = g[0] === 'idol' ? 0 : (S.rng()-0.5)*g[2]*0.7;
      S.spawnQueue.push({ key:g[0], at:S.t + g[3] + i*g[2] + jt });
    }
  });
  S.spawnQueue.sort(function (a, b) { return a.at - b.at; });
  say('wave');
  return true;
};

function spawnEnemy(S, key) {
  var d = CF.ENEMIES[key];
  var jit = d.boss ? 1 : 0.93 + S.rng()*0.14;      // no two are quite alike
  var e = {
    key:key, def:d, spd:d.speed*jit,
    hp:d.hp*CF.HP_MUL, maxHp:d.hp*CF.HP_MUL, d:0, x:0, y:0,
    aura:null, auraT:0, reactCd:0,
    phase:S.rng()*6.283, born:S.t, face:1,
    slow:0, slowT:0, freezeT:0, shredT:0, immuneT:0,
    burns:[], selfT:0, shatterT:(d.shatter?d.shatter.every:0),
    engaged:null, hitFlash:0, r:d.r, dead:false
  };
  var p = CF.posAt(0); e.x = p.x; e.y = p.y;
  S.enemies.push(e);
  say('spawn', key);
  return e;
}
CF.spawnEnemy = spawnEnemy;

/* ── damage ───────────────────────────────────────────────────────── */
CF.hurt = function (S, e, amount, opts) {
  opts = opts || {};
  if (e.dead || e.immuneT > 0) return 0;
  /* A ward sheds everything except the moment a reaction triggers, and it
     sheds a fixed amount then, whichever reaction it was. That is what makes
     "ANY reaction" a true promise rather than a lookup table. */
  if (e.def.wardImmune && !opts.wardBreak) return 0;
  if (!opts.reaction) {
    var armor = e.shredT > 0 ? 0 : e.def.armor;
    amount = Math.max(1, amount - armor);      // GRIT is what makes plate answerable
    S.stats.dmgDirect += amount;
  } else {
    S.stats.dmgReact += amount;                // reactions ignore armour
  }
  e.hp -= amount;
  e.hitFlash = 0.12;
  if (CF.SHOW_DMG && amount >= 1) {
    S.fx.push({ kind:'dmg', x:e.x + (S.rng()-0.5)*10, y:e.y - e.r*0.6,
                t:0.6, max:0.6, n:Math.round(amount),
                col:opts.reaction ? '#ffd98a' : '#e8e0cc' });
  }
  e.knock = Math.min(1, (e.knock || 0) + (opts.reaction ? 0.9 : 0.45));
  if (e.hp <= 0) {
    e.dead = true;
    var b = Math.round(e.def.bounty * CF.GOLD_MUL);
    S.gold += b; S.stats.earned += b; S.stats.kills++;
    say('death', e.def.boss);
    S.fx.push({ kind:'death', x:e.x, y:e.y, t:0.4, max:0.4, col:e.def.col, r:e.r });
    S.fx.push({ kind:'coin', x:e.x, y:e.y - e.r, t:0.85, max:0.85, col:'#d8b04a', n:b });
  }
  return amount;
};

function enemiesNear(S, x, y, radiusPx, skip) {
  var out = [];
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (e.dead || e === skip) continue;
    if (Math.hypot(e.x-x, e.y-y) <= radiusPx + e.r) out.push(e);
  }
  return out;
}
CF.enemiesNear = enemiesNear;

/* ── THE ONE RULE ─────────────────────────────────────────────────── */
CF.applyElement = function (S, e, el, srcx, srcy) {
  if (e.dead) return null;
  if (e.immuneT > 0) return null;
  if (e.reactCd > 0) return null;      // the last reaction has not settled yet
  if (e.def.burnsOff === el) {                 // a Cinder Knight boils Tide off
    S.fx.push({ kind:'fizzle', x:e.x, y:e.y-e.r, t:0.35, max:0.35, col:CF.EL[el].col });
    return null;
  }
  if (e.aura && e.aura !== el) {
    var pair = [e.aura, el];
    e.aura = null; e.auraT = 0;
    e.reactCd = CF.REACT_COOLDOWN;
    return CF.react(S, e, pair[0], pair[1], srcx, srcy);
  }
  e.aura = el; e.auraT = CF.AURA_TIME;
  return null;
};

CF.react = function (S, e, a, b, srcx, srcy) {
  var r = CF.REACT[CF.rk(a, b)];
  if (!r) return null;
  S.stats.reactions[r.key]++;
  say('reaction', r.key);
  S.fx.push({ kind:'react', rk:r.key, x:e.x, y:e.y, t:0.7, max:0.7,
              col:r.col, name:r.name, seed:S.rng(),
              ux:(e.ux||1), uy:(e.uy||0),
              r:(r.splash || (r.zone && r.zone.radius) || 1.2)*T });

  CF.hurt(S, e, e.def.wardImmune ? e.def.wardBreak : r.dmg,
          { reaction:true, wardBreak:true });
  if (r.splash) {
    enemiesNear(S, e.x, e.y, r.splash*T, e).forEach(function (o) {
      var amt = o.def.wardImmune ? Math.round(o.def.wardBreak*0.5) : Math.round(r.dmg*0.5);
      CF.hurt(S, o, amt, { reaction:true, wardBreak:true });
    });
  }

  var ap = r.apply;
  if (ap) {
    var victims = [e];
    if (r.splash) victims = victims.concat(enemiesNear(S, e.x, e.y, r.splash*T, e));
    victims.forEach(function (v) {
      if (ap.freeze) v.freezeT = Math.max(v.freezeT, ap.freeze);
      if (ap.slow)   { v.slow = Math.max(v.slow, ap.slow); v.slowT = Math.max(v.slowT, ap.slowTime); }
      if (ap.shred)  v.shredT = Math.max(v.shredT, ap.shred);
      if (ap.push)   v.d = Math.max(0, v.d - ap.push*T);   // STEAM drives them back
    });
  }

  if (r.chain) {
    var near = enemiesNear(S, e.x, e.y, r.chain.radius*T, e).slice(0, r.chain.count);
    near.forEach(function (o) {
      o.burns.push({ dps:r.chain.burnDps, t:r.chain.burnTime });
      S.fx.push({ kind:'arc', x1:e.x, y1:e.y, x2:o.x, y2:o.y, t:0.3, max:0.3, col:r.col });
    });
    e.burns.push({ dps:r.chain.burnDps, t:r.chain.burnTime });
  }

  if (r.zone) {
    S.zones.push({ x:e.x, y:e.y, r:r.zone.radius*T, t:r.zone.time, max:r.zone.time,
                   dps:r.zone.dps||0, slow:r.zone.slow||0, kind:r.zone.kind,
                   col:r.col, seed:S.rng() });
  }
  return r;
};

/* ── the step ─────────────────────────────────────────────────────── */
CF.step = function (S, dt) {
  if (S.over) return;
  dt = Math.min(dt, 0.05);
  S.t += dt;

  /* wave flow */
  if (!S.waveActive) {
    if (S.wave > 0 && S.wave < CF.WAVES.length) {
      S.gap -= dt;
      if (S.gap <= 0) CF.startWave(S);
    }
  } else {
    while (S.spawnQueue.length && S.spawnQueue[0].at <= S.t) {
      spawnEnemy(S, S.spawnQueue.shift().key);
    }
    if (!S.spawnQueue.length && !S.enemies.length) {
      S.waveActive = false;
      S.gap = CF.WAVE_GAP;
      if (S.wave >= CF.WAVES.length) { S.over = true; S.won = true; say('win'); }
    }
  }

  var total = CF.path().total;

  /* Who does a hero actually stop? A hero used to halt EVERY foe in contact
     range at once, so parking one on the road was a wall the whole column
     ground against -- and a wall is not what a hero is for here. The cap makes
     it structural: a hero holds up at most so many, nearest first, and the
     rest walk straight past. */
  for (var hz = 0; hz < S.heroes.length; hz++) S.heroes[hz].holding = 0;
  for (var ez = 0; ez < S.enemies.length; ez++) S.enemies[ez].engaged = null;
  if (CF.HERO_BLOCK_CAP > 0) {
    for (var hq = 0; hq < S.heroes.length; hq++) {
      var hero = S.heroes[hq];
      if (!hero.alive) continue;
      var near = [];
      for (var eq = 0; eq < S.enemies.length; eq++) {
        var en2 = S.enemies[eq];
        if (en2.dead || en2.engaged) continue;
        var dq = Math.hypot(en2.x - hero.x, en2.y - hero.y);
        if (dq < en2.r + 16) near.push({ e:en2, d:dq });
      }
      near.sort(function (a, b) { return a.d - b.d; });
      var take = Math.min(near.length, CF.HERO_BLOCK_CAP);
      for (var nq = 0; nq < take; nq++) { near[nq].e.engaged = hero; hero.holding++; }
    }
  }

  /* enemies */
  for (var i = S.enemies.length - 1; i >= 0; i--) {
    var e = S.enemies[i];
    if (e.dead) { S.enemies.splice(i, 1); continue; }

    if (e.auraT  > 0) { e.auraT -= dt; if (e.auraT <= 0) e.aura = null; }
    if (e.reactCd> 0) e.reactCd -= dt;
    if (e.slowT   > 0) { e.slowT   -= dt; if (e.slowT   <= 0) e.slow = 0; }
    if (e.freezeT > 0) e.freezeT -= dt;
    if (e.shredT  > 0) e.shredT  -= dt;
    if (e.immuneT > 0) e.immuneT -= dt;
    if (e.hitFlash> 0) e.hitFlash-= dt;
    if (e.knock    > 0) e.knock = Math.max(0, e.knock - dt*5);

    for (var bi = e.burns.length - 1; bi >= 0; bi--) {
      var bn = e.burns[bi];
      CF.hurt(S, e, bn.dps*dt, { reaction:true });
      bn.t -= dt;
      if (bn.t <= 0) e.burns.splice(bi, 1);
    }
    if (e.dead) { S.enemies.splice(i, 1); continue; }

    /* a Drowned Marcher keeps re-laying its own Tide */
    if (e.def.selfAura) {
      e.selfT -= dt;
      if (e.selfT <= 0) {
        e.selfT = e.def.selfAura.every;
        CF.applyElement(S, e, e.def.selfAura.el, e.x, e.y);
      }
    }

    /* the Idol sheds every aura around it, then stands immune a moment */
    if (e.def.shatter) {
      e.shatterT -= dt;
      if (e.shatterT <= 0) {
        e.shatterT = e.def.shatter.every;
        e.immuneT = e.def.shatter.immune;
        enemiesNear(S, e.x, e.y, e.def.shatter.radius*T, null).forEach(function (o) {
          o.aura = null; o.auraT = 0;
        });
        e.aura = null; e.auraT = 0;
        S.fx.push({ kind:'shatter', x:e.x, y:e.y, t:0.6, max:0.6,
                    col:'#c9b6e8', r:e.def.shatter.radius*T });
      }
    }

    /* ground zones */
    var zslow = 0;
    for (var zi = 0; zi < S.zones.length; zi++) {
      var z = S.zones[zi];
      if (Math.hypot(e.x-z.x, e.y-z.y) <= z.r) {
        if (z.dps) CF.hurt(S, e, z.dps*dt, { reaction:true });
        if (z.slow > zslow) zslow = z.slow;
      }
    }
    if (e.dead) { S.enemies.splice(i, 1); continue; }

    /* engagement is decided in a capped pre-pass, before this loop */
    if (e.engaged) {
      e.engaged.hp -= (e.def.dps || Math.max(8, e.def.hp*0.09)) * dt;
      if (e.engaged.hp <= 0) CF.killHero(S, e.engaged);
    } else if (e.freezeT <= 0) {
      var mul = (1 - Math.max(e.slow, zslow));
      e.d += e.spd * T * mul * dt;
    }

    var p = CF.posAt(e.d);
    e.x = p.x; e.y = p.y;
    if (p.ux > 0.15) e.face = 1; else if (p.ux < -0.15) e.face = -1;
    e.ux = p.ux; e.uy = p.uy;

    if (e.d >= total) {
      S.lives -= e.def.leak; S.stats.leaks += e.def.leak;
      say('leak');
      S.fx.push({ kind:'leak', x:e.x, y:e.y, t:0.6, max:0.6, col:'#ff5a5a' });
      S.enemies.splice(i, 1);
      if (S.lives <= 0) { S.lives = 0; S.over = true; S.won = false; say('lose'); }
    }
  }

  /* zones age out */
  for (var zj = S.zones.length - 1; zj >= 0; zj--) {
    S.zones[zj].t -= dt;
    if (S.zones[zj].t <= 0) S.zones.splice(zj, 1);
  }

  /* towers */
  for (var ti = 0; ti < S.towers.length; ti++) {
    var tw = S.towers[ti];
    var st = CF.stat(tw);
    if (tw.flash > 0) tw.flash -= dt;
    if (tw.recoil > 0) tw.recoil = Math.max(0, tw.recoil - dt*6);
    tw.cool -= dt;
    if (tw.cool > 0) continue;
    var tgt = null, bestD = -1;
    for (var ei = 0; ei < S.enemies.length; ei++) {
      var en = S.enemies[ei];
      if (en.dead) continue;
      if (Math.hypot(en.x-tw.x, en.y-tw.y) > st.range*T + en.r) continue;
      if (en.d > bestD) { bestD = en.d; tgt = en; }
    }
    if (!tgt) continue;
    tw.cool = st.rof;
    say('shot', tw.el);
    tw.ang = Math.atan2(tgt.y-tw.y, tgt.x-tw.x);
    tw.flash = 0.12; tw.shots++;
    tw.recoil = 1;
    var spd = tw.el === 'gale' ? 18 : tw.el === 'stone' ? 9 : 13;
    S.shots.push({
      x:tw.x, y:tw.y, tgt:tgt, el:tw.el, dmg:st.dmg,
      splash:st.splash || 0, auraSplash:st.auraSplash || 0, spd:spd*T,
      lx:tgt.x, ly:tgt.y, dead:false
    });
  }

  /* projectiles */
  for (var si = S.shots.length - 1; si >= 0; si--) {
    var s = S.shots[si];
    if (s.tgt && !s.tgt.dead) { s.lx = s.tgt.x; s.ly = s.tgt.y; }
    var dx = s.lx - s.x, dy = s.ly - s.y, dd = Math.hypot(dx, dy);
    var stepd = s.spd*dt;
    if (dd <= stepd || dd < 1) {
      s.x = s.lx; s.y = s.ly;
      CF.impact(S, s);
      S.shots.splice(si, 1);
    } else {
      s.x += dx/dd*stepd; s.y += dy/dd*stepd;
    }
  }

  /* heroes */
  for (var hj = 0; hj < S.heroes.length; hj++) CF.stepHero(S, S.heroes[hj], dt);

  /* effects */
  for (var fi = S.fx.length - 1; fi >= 0; fi--) {
    S.fx[fi].t -= dt;
    if (S.fx[fi].t <= 0) S.fx.splice(fi, 1);
  }
};

CF.impact = function (S, s) {
  var hit = [];
  if (s.tgt && !s.tgt.dead) hit.push(s.tgt);
  if (s.splash) {
    enemiesNear(S, s.x, s.y, s.splash*T, s.tgt).forEach(function (o) { hit.push(o); });
  }
  hit.forEach(function (e, idx) {
    CF.hurt(S, e, idx === 0 ? s.dmg : Math.round(s.dmg*0.7));
    if (e.dead) return;
    if (idx === 0 || CF.SPLASH_LAYS_AURA) CF.applyElement(S, e, s.el, s.x, s.y);
  });

  /* An AURA splash lays the element without dealing damage. A tower that
     hits hard but rarely can still be half of a reaction often -- which is
     what an applier has to be in this game. Damage balance is untouched. */
  if (s.auraSplash) {
    enemiesNear(S, s.x, s.y, s.auraSplash*T, null).forEach(function (o) {
      if (hit.indexOf(o) < 0 && !o.dead) CF.applyElement(S, o, s.el, s.x, s.y);
    });
  }
};

/* ── hero step ────────────────────────────────────────────────────── */
CF.killHero = function (S, h) {
  h.alive = false; h.hp = 0; h.respawnT = CF.HERO_RESPAWN;
  S.fx.push({ kind:'death', x:h.x, y:h.y, t:0.5, max:0.5, col:'#e8e0cc', r:16 });
};

CF.stepHero = function (S, h, dt) {
  if (!h.alive) {
    h.respawnT -= dt;
    if (h.respawnT <= 0) {
      h.alive = true; h.hp = h.def.hp;
      var st = CF.posAt(CF.path().total * 0.72);
      h.x = st.x; h.y = st.y + 60; h.rx = h.x; h.ry = h.y;
    }
    return;
  }
  if (h.cd > 0) h.cd -= dt;
  if (h.swing > 0) h.swing -= dt;
  h.hp = Math.min(h.maxHp, h.hp + h.def.regen*dt);

  /* pick a target inside reach */
  var best = null, bd = 1e9;
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (e.dead) continue;
    var d = Math.hypot(e.x-h.x, e.y-h.y);
    if (d < h.def.range*T + e.r && d < bd) { bd = d; best = e; }
  }
  h.target = best;

  /* walk to the rally point unless already fighting */
  if (!best) {
    var dx = h.rx - h.x, dy = h.ry - h.y, dd = Math.hypot(dx, dy);
    if (dd > 3) {
      var stp = Math.min(dd, h.def.speed*T*dt);
      h.x += dx/dd*stp; h.y += dy/dd*stp;
    }
  }

  h.atkT -= dt;
  if (best && h.atkT <= 0) {
    h.atkT = h.def.rof;
    h.swing = 0.18;
    CF.hurt(S, best, h.def.dmg);
    if (!best.dead) CF.applyElement(S, best, h.el, h.x, h.y);
  }
};

CF.heroAbility = function (S, h) {
  if (!h.alive || h.cd > 0) return false;
  var a = h.def.ability;
  h.cd = a.cd;
  say('ability', h.el);
  S.fx.push({ kind:'ability', x:h.x, y:h.y, t:0.5, max:0.5,
              col:CF.EL[h.el].col, r:a.radius*T, name:a.name });
  enemiesNear(S, h.x, h.y, a.radius*T, null).forEach(function (e) {
    CF.hurt(S, e, a.dmg);
    if (a.slow) { e.slow = Math.max(e.slow, a.slow); e.slowT = Math.max(e.slowT, a.slowTime); }
    if (!e.dead) CF.applyElement(S, e, h.el, h.x, h.y);
  });
  return true;
};

CF.setRally = function (S, h, x, y) { h.rx = x; h.ry = y; };

/* send one home to free the slot for a different element */
CF.dismissHero = function (S, h) {
  var i = S.heroes.indexOf(h);
  if (i < 0) return false;
  S.heroes.splice(i, 1);
  S.gold += Math.floor((h.def.cost || 0) * CF.HERO_REFUND);
  return true;
};

/* ── headless harness ─────────────────────────────────────────────────
   A scripted policy cannot judge feel and will always understate
   positional play. Use this to catch gross breakage only.
*/
CF.sim = function (opts) {
  opts = opts || {};
  var mix = opts.mix || ['galeharp','stoneward','emberhearth','tidespring'];
  var S = CF.newGame(opts.seed || 1);
  if (opts.goldTax) { S.gold -= opts.goldTax; S.taxDue = opts.goldTax; }
  if (opts.heroes) opts.heroes.forEach(function (k) { CF.addHero(S, k); });

  /* candidate plots, nearest to the road first, spread along it */
  var spots = [];
  for (var r = 0; r < CF.ROWS; r++) for (var c = 0; c < CF.COLS; c++) {
    if (!CF.canBuild(S, c, r)) continue;
    var x = (c+0.5)*T, y = (r+0.5)*T;
    spots.push({ c:c, r:r, rd:CF.roadDist(x, y), along:alongDist(x, y) });
  }
  spots.sort(function (a, b) { return a.along - b.along || a.rd - b.rd; });
  var CAP = opts.cap || spots.length;
  /* A single fixed build is one data point pretending to be a sample.
     Vary which element lands on which plot, the way different players would. */
  var plan = spots.map(function (_, i) { return mix[i % mix.length]; });
  for (var pi = plan.length - 1; pi > 0; pi--) {
    var pj = Math.floor(S.rng()*(pi+1));
    var tmp = plan[pi]; plan[pi] = plan[pj]; plan[pj] = tmp;
  }

  function nextHero() {
    if (!opts.buyHeroes) return null;
    for (var q = 0; q < opts.buyHeroes.length; q++) {
      var kq = opts.buyHeroes[q];
      if (!S.heroes.some(function (h) { return h.key === kq; })) return kq;
    }
    return null;
  }
  /* gold held back so the hero stays reachable while the wall still grows */
  function reserve() {
    if (!opts.heroFirst) return 0;
    var nk = nextHero();
    return nk ? CF.HEROES[nk].cost : 0;
  }

  function buyHeroes() {
    if (!opts.buyHeroes) return;
    /* buy heroes when they can be afforded, so their COST is part of what is
       being measured rather than a number nobody ever pays */

      for (var bh = 0; bh < opts.buyHeroes.length; bh++) {
        var bk = opts.buyHeroes[bh];
        if (S.heroes.some(function (h) { return h.key === bk; })) continue;
        var bc = CF.HEROES[bk].cost;
        var need = bc + (opts.heroFirst ? 0 : (opts.heroReserve || 0));
        if (S.gold >= need) {
          S.gold -= bc; S.stats.spent += bc;
          CF.addHero(S, bk);
        }
        break;                       // one at a time, cheapest first
      }
      }

  var idx = 0, guard = 0, maxT = opts.maxT || 2400;
  while (!S.over && S.t < maxT && guard++ < 4000000) {
    /* spend: place along the road in the given mix, then upgrade */
    if (opts.heroFirst) buyHeroes();
    var placed = true;
    while (placed) {
      placed = false;
      if (idx < spots.length) {
        var key = plan[idx % plan.length];
        if (S.gold >= CF.TOWERS[key].cost + reserve() && S.towers.length < CAP) {
          var sp = spots[idx];
          if (CF.placeTower(S, key, sp.c, sp.r)) { idx++; placed = true; }
          else idx++;
        }
      }
    }
    if (!opts.heroFirst) buyHeroes();
    if (S.towers.length >= CAP || idx >= spots.length) {
      for (var u = 0; u < S.towers.length; u++) {
        var cst = CF.upgradeCost(S.towers[u]);
        if (cst != null && S.gold >= cst + 60 + reserve()) CF.upgradeTower(S, S.towers[u]);
      }
    }
    if (!S.waveActive && S.wave === 0) CF.startWave(S);
    /* heroes: park on the road two thirds along, fire abilities off cooldown */
    S.heroes.forEach(function (h) {
      if (!h.alive) return;
      var pp = CF.posAt(CF.path().total * 0.6);
      CF.setRally(S, h, pp.x, pp.y);
      if (h.cd <= 0 && S.enemies.length > 2) CF.heroAbility(S, h);
    });
    CF.step(S, 1/30);
  }
  return S;
};

function alongDist(x, y) {
  var p = CF.path(), best = 1e9, bestAt = 0;
  for (var i = 0; i < p.segs.length; i++) {
    var s = p.segs[i];
    var vx = x - s.a.x, vy = y - s.a.y;
    var t = Math.max(0, Math.min(s.len, vx*s.ux + vy*s.uy));
    var dx = vx - s.ux*t, dy = vy - s.uy*t, d = Math.hypot(dx, dy);
    if (d < best) { best = d; bestAt = s.at + t; }
  }
  return bestAt;
}
CF.alongDist = alongDist;

})(window.CF);
