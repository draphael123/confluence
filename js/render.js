/* CONFLUENCE - render.js
   Draw order matters: ground, zones, road entities, then anything that must
   never be hidden -- auras, reaction pops, and the aim overlay.
*/
(function (CF) {
'use strict';
var T = CF.TILE, A = CF.art;
var R = CF.render = {};

R.view = { hover:null, sel:null, ghost:null, showRanges:false, heroSel:null };

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
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (1-k)*0.9*FLASH;
      var rr2 = (f.r || T) * (0.35 + k*1.15);
      var rg = g.createRadialGradient(f.x, f.y, rr2*0.2, f.x, f.y, rr2);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.4, f.col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(f.x, f.y, rr2, 0, 6.283); g.fill();
      g.globalCompositeOperation = 'source-over';
      if (!CF.settings.names) { g.restore(); return; }
      g.globalAlpha = Math.min(1, (1-k)*2);
      g.font = '700 13px Georgia, serif';
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText(f.name, f.x, f.y - 18 - k*22);
      g.fillStyle = f.col;
      g.fillText(f.name, f.x, f.y - 18 - k*22);
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
