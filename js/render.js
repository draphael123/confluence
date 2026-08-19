/* CONFLUENCE - render.js
   Draw order matters: ground, zones, road entities, then anything that must
   never be hidden -- auras, reaction pops, and the aim overlay.
*/
(function (CF) {
'use strict';
var T = CF.TILE, A = CF.art;
var R = CF.render = {};

R.view = { hover:null, sel:null, ghost:null, showRanges:false, heroSel:null };

/* stable per-effect randomness: the same effect must look the same every
   frame it is alive, or it boils */
function mulberry(a) {
  var t = (a * 4294967296) >>> 0;
  return function () {
    t += 0x6D2B79F5; t >>>= 0;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function ring(g, x, y, rad, col, w, alpha) {
  g.save();
  g.globalAlpha = alpha == null ? 1 : alpha;
  g.strokeStyle = col; g.lineWidth = w || 2;
  g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.stroke();
  g.restore();
}

R.draw = function (g, S, dt) {
  var FLASH = CF.flashScale ? CF.flashScale() : 1;
  var W = CF.COLS*T, H = CF.ROWS*T;
  g.clearRect(0, 0, W, H);
  if (A.statics) g.drawImage(A.statics, 0, 0);
  else { g.fillStyle = '#2c4133'; g.fillRect(0, 0, W, H); }

  /* cloud shadow drifting across the field -- one baked texture scrolled,
     which is far cheaper than building gradients every frame */
  if (A.clouds) {
    var off = (S.t*9) % W;
    g.save();
    g.globalAlpha = 0.22;
    g.drawImage(A.clouds, -off, Math.sin(S.t*0.05)*8);
    g.drawImage(A.clouds, W - off, Math.sin(S.t*0.05)*8);
    g.restore();
  }

  /* ── ground zones left by MAGMA and MIRE ── */
  S.zones.forEach(function (z) {
    var k = Math.max(0, z.t/z.max);
    g.save();
    g.globalAlpha = 0.20 + 0.45*k;
    var gr = g.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
    if (z.kind === 'magma') {
      gr.addColorStop(0, 'rgba(255,220,120,0.95)');
      gr.addColorStop(0.45, 'rgba(232,85,42,0.75)');
      gr.addColorStop(1, 'rgba(120,20,0,0)');
    } else {
      gr.addColorStop(0, 'rgba(120,100,64,0.9)');
      gr.addColorStop(0.6, 'rgba(90,74,46,0.6)');
      gr.addColorStop(1, 'rgba(50,40,24,0)');
    }
    g.fillStyle = gr;
    g.beginPath(); g.arc(z.x, z.y, z.r, 0, 6.283); g.fill();
    g.globalAlpha = 0.5*k;
    g.strokeStyle = z.col; g.lineWidth = 1.5;
    g.beginPath(); g.arc(z.x, z.y, z.r*0.96, 0, 6.283); g.stroke();

    var zr = mulberry(z.seed || 0.3);
    if (z.kind === 'magma') {                    // fissures and rising embers
      g.globalAlpha = 0.55*k;
      g.strokeStyle = '#ffbe6a'; g.lineCap = 'round';
      for (var mc = 0; mc < 5; mc++) {
        var am = zr()*6.283, lm = z.r*(0.3 + zr()*0.55);
        g.lineWidth = 1 + zr()*2;
        g.beginPath();
        g.moveTo(z.x + Math.cos(am)*z.r*0.15, z.y + Math.sin(am)*z.r*0.15);
        g.lineTo(z.x + Math.cos(am)*lm, z.y + Math.sin(am)*lm);
        g.stroke();
      }
      g.globalCompositeOperation = 'lighter';
      for (var em = 0; em < 5; em++) {
        var ae = zr()*6.283, re = z.r*zr()*0.85;
        var rise = ((S.t*34 + em*40) % 40);
        g.globalAlpha = 0.6*k*(1 - rise/40);
        g.fillStyle = '#ffd07a';
        g.beginPath();
        g.arc(z.x + Math.cos(ae)*re, z.y + Math.sin(ae)*re - rise*0.5, 1.8, 0, 6.283);
        g.fill();
      }
    } else {                                     // mud that bubbles
      for (var mb = 0; mb < 6; mb++) {
        var ab2 = zr()*6.283, rb2 = z.r*zr()*0.8;
        var ph2 = (S.t*1.4 + zr()*6) % 2;
        var pop = ph2 < 1 ? ph2 : 2 - ph2;
        g.globalAlpha = 0.5*k*pop;
        g.fillStyle = '#a08a5a';
        g.beginPath();
        g.arc(z.x + Math.cos(ab2)*rb2, z.y + Math.sin(ab2)*rb2, 1.5 + pop*3.5, 0, 6.283);
        g.fill();
      }
    }
    g.restore();
  });

  /* ── range overlay for the selected or hovered plot ── */
  var showT = R.view.sel || R.view.hover;
  if (showT && showT.def) {
    var st = CF.stat(showT);
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.055)';
    g.beginPath(); g.arc(showT.x, showT.y, st.range*T, 0, 6.283); g.fill();
    ring(g, showT.x, showT.y, st.range*T, CF.EL[showT.el].col, 2, 0.75);
    g.restore();
  }

  /* a pool of the tower's own element on the ground: depth, and it makes the
     element layout of the whole board readable at a glance */
  g.save();
  g.globalCompositeOperation = 'lighter';
  S.towers.forEach(function (t) {
    var lg = g.createRadialGradient(t.x, t.y, 2, t.x, t.y, T*1.5);
    lg.addColorStop(0, CF.EL[t.el].col);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.11 + 0.03*t.tier;
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(t.x, t.y + T*0.1, T*1.5, T*1.1, 0, 0, 6.283); g.fill();
  });
  g.restore();

  /* ── towers ── */
  S.towers.forEach(function (t) {
    var img = A.towers && A.towers[t.key] && A.towers[t.key][t.tier];
    if (!img) return;
    g.drawImage(img, t.x - img.width/2, t.y - img.height/2 - T*0.28);
    if (t.flash > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = t.flash*4*FLASH;
      var fg = g.createRadialGradient(t.x, t.y - T*0.5, 1, t.x, t.y - T*0.5, T*0.7);
      fg.addColorStop(0, CF.EL[t.el].col);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg;
      g.beginPath(); g.arc(t.x, t.y - T*0.5, T*0.7, 0, 6.283); g.fill();
      g.restore();
    }
  });

  /* ── projectiles ── */
  S.shots.forEach(function (s) {
    var col = CF.EL[s.el].col;
    g.save();
    g.globalCompositeOperation = 'lighter';
    var vx = s.lx - s.x, vy = s.ly - s.y, vl = Math.hypot(vx, vy) || 1;
    var tg = g.createLinearGradient(s.x, s.y, s.x - vx/vl*22, s.y - vy/vl*22);
    tg.addColorStop(0, col);
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    g.strokeStyle = tg; g.lineWidth = 4; g.lineCap = 'round';
    g.globalAlpha = 0.75*FLASH;
    g.beginPath();
    g.moveTo(s.x, s.y);
    g.lineTo(s.x - vx/vl*22, s.y - vy/vl*22);
    g.stroke();
    g.globalAlpha = 1;
    var gr2 = g.createRadialGradient(s.x, s.y, 0.5, s.x, s.y, 9);
    gr2.addColorStop(0, '#ffffff');
    gr2.addColorStop(0.35, col);
    gr2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr2;
    g.beginPath(); g.arc(s.x, s.y, 9, 0, 6.283); g.fill();
    g.restore();
  });

  /* ── enemies ── */
  S.enemies.forEach(function (e) {
    var img = A.enemies && A.enemies[e.key];

    /* the aura is the single most important thing on the screen: it is the
       half-finished reaction, so it gets a solid ring in the element hue */
    if (e.aura) {
      var ec = CF.EL[e.aura];
      var pulse = 0.55 + 0.45*Math.sin(S.t*7 + e.d*0.05);
      g.save();
      g.globalCompositeOperation = 'lighter';
      var ag = g.createRadialGradient(e.x, e.y, e.r*0.55, e.x, e.y, e.r*1.30);
      ag.addColorStop(0, 'rgba(0,0,0,0)');
      ag.addColorStop(0.65, ec.col);
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.45*pulse;
      g.fillStyle = ag;
      g.beginPath(); g.arc(e.x, e.y, e.r*1.30, 0, 6.283); g.fill();
      g.restore();
      ring(g, e.x, e.y, e.r*1.12, ec.col, 2.6, 0.95);
      /* hue alone is not an acceptable single channel for a rule-set
         entirely built on colour, so an optional shape rides along */
      if (CF.settings.glyphs) CF.drawGlyph(g, e.aura, e.x, e.y - e.r*1.34, e.r*0.34, ec.col);
    } else if (e.reactCd > 0) {
      /* spent, and not yet able to hold a new element -- a different hue,
         not merely a fainter one, so it is legible next to a live aura */
      ring(g, e.x, e.y, e.r*1.12, '#6f6f72', 1.6, 0.55*(e.reactCd/CF.REACT_COOLDOWN));
    }

    if (img) {
      /* Motion is applied at draw time rather than baked into frames: a gait
         phase per enemy, so a crowd never bobs in lockstep, and everything
         stops dead while frozen -- which is what sells FROST. */
      var moving = e.freezeT <= 0 && !e.engaged;
      var rate = e.def.boss ? 2.0 : 3.4 + e.def.speed*1.6;
      var ph = S.t*rate + e.phase;
      var bob = 0, sx = 1, sy = 1, tilt = 0;
      if (moving) {
        bob  = -Math.abs(Math.sin(ph)) * (e.def.boss ? 2.0 : e.r*0.17);
        sy   = 1 + Math.sin(ph*2)*0.05;
        sx   = 1 - Math.sin(ph*2)*0.05;
        tilt = Math.sin(ph)*0.05;
      } else if (e.freezeT <= 0) {
        bob = Math.sin(S.t*2.2 + e.phase)*1.2;      // idle breath while blocked
      }
      if (e.key === 'sprite') { bob = Math.sin(ph*1.6)*e.r*0.42; sx = sy = 1; tilt = Math.sin(ph)*0.16; }
      if (e.key === 'gorehoof') tilt += 0.16;        // permanently pitched into the charge
      if (e.key === 'idol') { sy = 1 + Math.sin(S.t*1.5)*0.03; sx = 1 - Math.sin(S.t*1.5)*0.03; }

      /* a short pop as it walks out of the arch */
      var age = S.t - e.born, birth = age < 0.35 ? 0.55 + 0.45*(age/0.35) : 1;

      g.save();
      g.translate(e.x, e.y + bob);
      g.rotate(tilt * e.face);
      g.scale(e.face * sx * birth, sy * birth);
      if (e.freezeT > 0) g.globalAlpha = 0.92;
      g.drawImage(img, -img.width/2, -img.height/2);
      g.restore();
    }

    if (e.freezeT > 0) {                     // frozen must read instantly
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      g.fillStyle = '#9fe8ff';
      g.beginPath(); g.arc(e.x, e.y, e.r*1.05, 0, 6.283); g.fill();
      g.restore();
      g.strokeStyle = '#dff6ff'; g.lineWidth = 1.6;
      for (var s2 = 0; s2 < 3; s2++) {
        var as = s2*2.09 + 0.4;
        g.beginPath();
        g.moveTo(e.x + Math.cos(as)*e.r*0.4, e.y + Math.sin(as)*e.r*0.4);
        g.lineTo(e.x + Math.cos(as)*e.r*1.25, e.y + Math.sin(as)*e.r*1.25);
        g.stroke();
      }
    }
    if (e.shredT > 0) ring(g, e.x, e.y, e.r*1.38, '#ded1a8', 1.4, 0.6);
    if (e.burns.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.25*Math.sin(S.t*14);
      g.fillStyle = '#ffb03a';
      g.beginPath(); g.arc(e.x, e.y - e.r*0.3, e.r*0.85, 0, 6.283); g.fill();
      g.restore();
    }
    if (e.immuneT > 0) ring(g, e.x, e.y, e.r*1.45, '#e8dcff', 3, 0.85);
    if (e.hitFlash > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = e.hitFlash*4*FLASH;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(e.x, e.y, e.r*0.95, 0, 6.283); g.fill();
      g.restore();
    }

    /* health */
    if (e.hp < e.maxHp) {
      var bw = Math.max(20, e.r*2.0), bh = e.def.boss ? 6 : 4;
      var by = e.y - e.r - (e.def.boss ? 16 : 10);
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillRect(e.x - bw/2 - 1, by - 1, bw + 2, bh + 2);
      var frac = Math.max(0, e.hp/e.maxHp);
      g.fillStyle = e.def.wardImmune ? '#b79be0' : (frac > 0.5 ? '#7fc46a' : frac > 0.22 ? '#e0c14a' : '#d4553f');
      g.fillRect(e.x - bw/2, by, bw*frac, bh);
    }
  });

  /* ── heroes ── */
  S.heroes.forEach(function (h) {
    if (!h.alive) {
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = CF.EL[h.el].col; g.lineWidth = 2;
      g.beginPath(); g.arc(h.x, h.y, 16, -1.57, -1.57 + 6.283*(1 - h.respawnT/CF.HERO_RESPAWN));
      g.stroke();
      g.restore();
      return;
    }
    if (R.view.heroSel === h) {
      ring(g, h.rx, h.ry, 13, CF.EL[h.el].col, 2, 0.5);
      g.save();
      g.setLineDash([5, 5]);
      g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(h.rx, h.ry); g.stroke();
      g.restore();
      ring(g, h.x, h.y, 20, '#ffffff', 1.6, 0.45);
    }
    var img2 = A.heroes && A.heroes[h.key];
    if (img2) g.drawImage(img2, h.x - img2.width/2, h.y - img2.height/2 - 4);
    if (h.swing > 0 && h.target) {
      var ang = Math.atan2(h.target.y - h.y, h.target.x - h.x);
      g.save();
      g.strokeStyle = CF.EL[h.el].col; g.lineWidth = 3; g.globalAlpha = h.swing*5;
      g.beginPath(); g.arc(h.x, h.y, h.def.range*T*0.85, ang - 0.7, ang + 0.7); g.stroke();
      g.restore();
    }
    var hw = 30;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(h.x - hw/2 - 1, h.y - 27, hw + 2, 5);
    g.fillStyle = '#6fc9d8';
    g.fillRect(h.x - hw/2, h.y - 26, hw*Math.max(0, h.hp/h.maxHp), 3);
  });

  /* ── effects, always on top ── */
  S.fx.forEach(function (f) {
    var k = 1 - f.t/f.max;
    g.save();
    if (f.kind === 'react') {
      /* Each reaction gets the SHAPE of its verb. They used to share one white
         radial burst, which meant the printed name was doing all the work and
         the system could not be learned by watching. */
      var rnd = mulberry(f.seed || 0.5);
      var grow = 0.35 + k*1.15;

      if (f.rk === 'steam') {
        /* billows -- several soft lobes, and it shoves them back */
        g.globalAlpha = (1-k)*0.8*FLASH;
        for (var b = 0; b < 6; b++) {
          var ab = rnd()*6.283, rb = rnd();
          var bx = f.x + Math.cos(ab)*f.r*rb*grow;
          var by = f.y + Math.sin(ab)*f.r*rb*grow - k*10;
          var bg = g.createRadialGradient(bx, by, 1, bx, by, f.r*0.55*grow);
          bg.addColorStop(0, 'rgba(240,252,255,0.95)');
          bg.addColorStop(1, 'rgba(200,230,240,0)');
          g.fillStyle = bg;
          g.beginPath(); g.arc(bx, by, f.r*0.55*grow, 0, 6.283); g.fill();
        }
        g.globalAlpha = (1-k)*0.9;
        g.strokeStyle = f.col; g.lineWidth = 2;
        for (var ps = 0; ps < 3; ps++) {         // push streaks, against travel
          var oy = (ps-1)*9;
          g.beginPath();
          g.moveTo(f.x + f.ux*k*26, f.y + f.uy*k*26 + oy);
          g.lineTo(f.x - f.ux*(10 + k*20), f.y - f.uy*(10 + k*20) + oy);
          g.stroke();
        }

      } else if (f.rk === 'frost') {
        /* sharp shards, not a soft blob -- a hard stop should look hard */
        g.globalAlpha = (1-k);
        g.fillStyle = f.col;
        g.strokeStyle = '#eafaff'; g.lineWidth = 1.4;
        for (var sp = 0; sp < 9; sp++) {
          var asp = sp*0.698 + (f.seed||0)*6.283;
          var len = f.r*(0.55 + rnd()*0.75)*grow;
          var wid = f.r*0.13;
          g.save();
          g.translate(f.x, f.y); g.rotate(asp);
          g.beginPath();
          g.moveTo(f.r*0.16, 0); g.lineTo(len, -wid); g.lineTo(len + f.r*0.16, 0); g.lineTo(len, wid);
          g.closePath(); g.fill(); g.stroke();
          g.restore();
        }

      } else if (f.rk === 'firestorm') {
        /* a burst that throws licks outward; the chain arcs carry the rest */
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1-k)*0.85*FLASH;
        for (var fl = 0; fl < 10; fl++) {
          var af = fl*0.628 + rnd()*0.4;
          var rf = f.r*(0.3 + rnd()*0.9)*grow;
          var fx2 = f.x + Math.cos(af)*rf, fy2 = f.y + Math.sin(af)*rf - k*8;
          var fg2 = g.createRadialGradient(fx2, fy2, 0.5, fx2, fy2, f.r*0.30);
          fg2.addColorStop(0, '#fff2c0');
          fg2.addColorStop(0.45, f.col);
          fg2.addColorStop(1, 'rgba(180,40,0,0)');
          g.fillStyle = fg2;
          g.beginPath(); g.arc(fx2, fy2, f.r*0.30, 0, 6.283); g.fill();
        }

      } else if (f.rk === 'grit') {
        /* a directional blast, plus the plate it just scoured off */
        g.globalAlpha = (1-k)*0.95;
        var gx2 = f.ux, gy2 = f.uy;
        g.strokeStyle = f.col;
        for (var st2 = 0; st2 < 12; st2++) {
          var spread = (rnd()-0.5)*1.1;
          var cs = Math.cos(spread), sn = Math.sin(spread);
          var dx2 = gx2*cs - gy2*sn, dy2 = gx2*sn + gy2*cs;
          var l0 = f.r*0.2 + rnd()*f.r*0.4, l1 = l0 + f.r*(0.4 + k*0.9);
          g.lineWidth = 1 + rnd()*1.6;
          g.beginPath();
          g.moveTo(f.x + dx2*l0, f.y + dy2*l0);
          g.lineTo(f.x + dx2*l1, f.y + dy2*l1);
          g.stroke();
        }
        g.fillStyle = '#b9b0a0';                 // armour fragments
        for (var sh = 0; sh < 5; sh++) {
          var ash = rnd()*6.283, rsh = f.r*(0.4 + k*1.0);
          g.save();
          g.translate(f.x + Math.cos(ash)*rsh, f.y + Math.sin(ash)*rsh);
          g.rotate(ash + k*3);
          g.fillRect(-3, -1.6, 6, 3.2);
          g.restore();
        }

      } else if (f.rk === 'magma') {
        /* the ground breaking open */
        g.globalAlpha = (1-k)*0.95;
        g.strokeStyle = f.col; g.lineCap = 'round';
        for (var cr2 = 0; cr2 < 6; cr2++) {
          var ac = cr2*1.047 + (f.seed||0)*3;
          g.lineWidth = 3.2 - k*2;
          g.beginPath();
          g.moveTo(f.x, f.y);
          var seg = f.r*grow*0.55;
          var px2 = f.x, py2 = f.y, aa = ac;
          for (var q2 = 0; q2 < 3; q2++) {
            aa += (rnd()-0.5)*0.8;
            px2 += Math.cos(aa)*seg; py2 += Math.sin(aa)*seg;
            g.lineTo(px2, py2);
          }
          g.stroke();
        }
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1-k)*0.7*FLASH;
        var mg = g.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.r*0.7*grow);
        mg.addColorStop(0, '#ffd48a'); mg.addColorStop(1, 'rgba(200,50,0,0)');
        g.fillStyle = mg;
        g.beginPath(); g.arc(f.x, f.y, f.r*0.7*grow, 0, 6.283); g.fill();

      } else {                                    /* mire */
        /* opaque, heavy, bubbling -- the only reaction that is not bright */
        g.globalAlpha = (1-k)*0.9;
        g.fillStyle = '#5f4c2c';
        g.beginPath(); g.arc(f.x, f.y, f.r*0.75*grow, 0, 6.283); g.fill();
        g.fillStyle = f.col;
        for (var bu = 0; bu < 7; bu++) {
          var abu = rnd()*6.283, rbu = f.r*rnd()*0.8*grow;
          var brad = 2 + rnd()*5*(1-k);
          g.beginPath();
          g.arc(f.x + Math.cos(abu)*rbu, f.y + Math.sin(abu)*rbu - k*6, brad, 0, 6.283);
          g.fill();
        }
      }

      g.globalCompositeOperation = 'source-over';
      if (!CF.settings.names) { g.restore(); return; }
      g.globalAlpha = Math.min(1, (1-k)*2);
      g.font = '700 13px Georgia, serif';
      g.textAlign = 'center';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,0.85)';
      /* stagger by the effect's own seed so two reactions firing near each
         other do not print their names on the same line */
      var ly = f.y - 22 - k*24 - (f.seed || 0)*22;
      g.strokeText(f.name, f.x, ly);
      g.fillStyle = f.col;
      g.fillText(f.name, f.x, ly);
    } else if (f.kind === 'arc') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (1-k);
      g.strokeStyle = f.col; g.lineWidth = 3 - k*2;
      g.beginPath(); g.moveTo(f.x1, f.y1);
      var mx = (f.x1+f.x2)/2 + (f.y2-f.y1)*0.18;
      var my = (f.y1+f.y2)/2 - (f.x2-f.x1)*0.18;
      g.quadraticCurveTo(mx, my, f.x2, f.y2); g.stroke();
    } else if (f.kind === 'shatter') {
      g.globalAlpha = (1-k)*0.9;
      g.strokeStyle = f.col; g.lineWidth = 4 - k*3;
      g.beginPath(); g.arc(f.x, f.y, f.r*(0.2 + k), 0, 6.283); g.stroke();
      g.globalAlpha = Math.min(1, (1-k)*2);
      g.font = '700 14px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = f.col;
      g.fillText('SHATTER', f.x, f.y - f.r*0.5 - k*16);
    } else if (f.kind === 'ability') {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (1-k)*0.75;
      g.strokeStyle = f.col; g.lineWidth = 5 - k*4;
      g.beginPath(); g.arc(f.x, f.y, f.r*(0.25 + k*0.85), 0, 6.283); g.stroke();
    } else if (f.kind === 'death') {
      g.globalAlpha = (1-k)*0.8;
      g.fillStyle = f.col;
      for (var d2 = 0; d2 < 6; d2++) {
        var ad = d2*1.047;
        var rd = (f.r||10) * (0.3 + k*1.5);
        g.beginPath();
        g.arc(f.x + Math.cos(ad)*rd, f.y + Math.sin(ad)*rd, 3*(1-k)+1, 0, 6.283);
        g.fill();
      }
    } else if (f.kind === 'fizzle') {
      g.globalAlpha = (1-k);
      g.strokeStyle = f.col; g.lineWidth = 2;
      g.beginPath(); g.arc(f.x, f.y - k*12, 6*(1-k)+2, 0, 6.283); g.stroke();
    } else if (f.kind === 'leak') {
      g.globalAlpha = (1-k);
      g.strokeStyle = f.col; g.lineWidth = 3;
      g.beginPath(); g.arc(f.x, f.y, 10 + k*26, 0, 6.283); g.stroke();
    }
    g.restore();
  });

  /* ── placement ghost ── */
  var gh = R.view.ghost;
  if (gh) {
    var ok = gh.ok;
    g.save();
    g.globalAlpha = 0.55;
    var img3 = A.towers && A.towers[gh.key] && A.towers[gh.key][0];
    if (img3 && ok) g.drawImage(img3, gh.x - img3.width/2, gh.y - img3.height/2 - T*0.28);
    g.globalAlpha = 1;
    g.strokeStyle = ok ? '#8fe08a' : '#d4553f';
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(gh.x, gh.y, T*0.46, T*0.40, 0, 0, 6.283); g.stroke();
    if (ok) {
      g.globalAlpha = 0.10; g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(gh.x, gh.y, CF.TOWERS[gh.key].tiers[0].range*T, 0, 6.283); g.fill();
      g.globalAlpha = 0.6;
      ring(g, gh.x, gh.y, CF.TOWERS[gh.key].tiers[0].range*T, CF.EL[CF.TOWERS[gh.key].el].col, 2, 0.6);
    } else {
      g.strokeStyle = '#d4553f'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(gh.x - 9, gh.y - 9); g.lineTo(gh.x + 9, gh.y + 9);
      g.moveTo(gh.x + 9, gh.y - 9); g.lineTo(gh.x - 9, gh.y + 9);
      g.stroke();
    }
    g.restore();
  }

  /* vignette last, baked once, so the eye sits in the middle of the board */
  if (!R._vig || R._vig.width !== W) {
    R._vig = A.cv(W, H);
    var vg = R._vig.getContext('2d');
    var rg2 = vg.createRadialGradient(W/2, H/2, Math.min(W, H)*0.30,
                                      W/2, H/2, Math.max(W, H)*0.72);
    rg2.addColorStop(0, 'rgba(0,0,0,0)');
    rg2.addColorStop(1, 'rgba(6,8,10,0.55)');
    vg.fillStyle = rg2; vg.fillRect(0, 0, W, H);
  }
  g.drawImage(R._vig, 0, 0);

  /* ── every plot, faintly, while placing ── */
  if (R.view.ghost) {
    var mp = CF.map();
    g.save(); g.globalAlpha = 0.35;
    Object.keys(mp.plots).forEach(function (k2) {
      if (S.towerAt[k2]) return;
      var pr2 = k2.split(',');
      ring(g, (+pr2[0]+0.5)*T, (+pr2[1]+0.5)*T, T*0.40, '#cfe6b0', 1.6, 0.5);
    });
    g.restore();
  }
};

})(window.CF);
