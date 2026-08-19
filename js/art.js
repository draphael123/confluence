/* CONFLUENCE - art.js
   Everything is baked once into offscreen canvases at boot. Per-frame work
   is then only drawImage, which is what keeps a few hundred entities cheap.
*/
(function (CF) {
'use strict';
var T = CF.TILE;
var A = CF.art = {};

function cv(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function ctxOf(c) { var x = c.getContext('2d'); x.imageSmoothingEnabled = true; return x; }
A.cv = cv;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x+r, y);
  g.arcTo(x+w, y,   x+w, y+h, r);
  g.arcTo(x+w, y+h, x,   y+h, r);
  g.arcTo(x,   y+h, x,   y,   r);
  g.arcTo(x,   y,   x+w, y,   r);
  g.closePath();
}
A.rr = rr;

function shade(hex, k) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  if (k > 0) { r += (255-r)*k; g += (255-g)*k; b += (255-b)*k; }
  else { r *= (1+k); g *= (1+k); b *= (1+k); }
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
}
A.shade = shade;

/* ── the static world ───────────────────────────────────────────────
   Ground, road, plots and scenery never move, so they are painted once.
*/
A.bakeStatic = function () {
  var W = CF.COLS*T, H = CF.ROWS*T;
  var c = cv(W, H), g = ctxOf(c);
  var map = CF.map(), p = CF.path();
  var rng = CF.makeRng(4242);

  /* turf */
  g.fillStyle = '#2c4133'; g.fillRect(0, 0, W, H);
  for (var i = 0; i < 2600; i++) {
    var x = rng()*W, y = rng()*H;
    g.fillStyle = rng() < 0.5 ? 'rgba(60,88,64,0.30)' : 'rgba(24,38,29,0.32)';
    g.beginPath(); g.ellipse(x, y, 6+rng()*16, 4+rng()*10, rng()*3.14, 0, 6.283); g.fill();
  }
  /* a cool wash toward the bottom so the board has a light direction */
  var wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, 'rgba(120,150,120,0.10)');
  wash.addColorStop(1, 'rgba(0,10,15,0.28)');
  g.fillStyle = wash; g.fillRect(0, 0, W, H);

  /* the road, stroked as one polyline rather than tile by tile */
  function strokeRoad(width, style, blur) {
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = style; g.lineWidth = width;
    if (blur) { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = blur; }
    g.beginPath();
    g.moveTo(p.pts[0].x, p.pts[0].y);
    for (var k = 1; k < p.pts.length; k++) g.lineTo(p.pts[k].x, p.pts[k].y);
    g.stroke();
    g.restore();
  }
  strokeRoad(T*2.15, '#20301f', 10);
  strokeRoad(T*1.95, '#5f5039', 0);
  strokeRoad(T*1.62, '#6f5f45', 0);
  /* ruts and grit */
  g.save();
  g.globalAlpha = 0.5;
  for (var s = 0; s < p.total; s += 5) {
    var a = CF.posAt(s);
    var nx = -a.uy, ny = a.ux;
    var o = (rng()-0.5)*T*1.1;
    g.fillStyle = rng() < 0.5 ? 'rgba(40,32,22,0.5)' : 'rgba(150,132,100,0.28)';
    g.fillRect(a.x + nx*o - 1.5, a.y + ny*o - 1.5, 3, 3);
  }
  g.restore();

  /* plots: a prepared foundation. It has to say "build here", not "rock" --
     corner brackets and a dashed rim read as surveyor's marks. */
  Object.keys(map.plots).forEach(function (k) {
    var pr = k.split(','), cx = (+pr[0]+0.5)*T, cy = (+pr[1]+0.5)*T;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath(); g.ellipse(2, 4, T*0.50, T*0.24, 0, 0, 6.283); g.fill();
    var pad = g.createRadialGradient(0, -4, 2, 0, 0, T*0.52);
    pad.addColorStop(0, '#6d6857');
    pad.addColorStop(1, '#494437');
    g.fillStyle = pad;
    g.beginPath(); g.ellipse(0, 0, T*0.48, T*0.24, 0, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(160,152,126,0.75)'; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(0, 0, T*0.48, T*0.24, 0, 0, 6.283); g.stroke();
    g.strokeStyle = 'rgba(196,186,152,0.55)'; g.lineWidth = 1.4;
    g.setLineDash([4, 5]);
    g.beginPath(); g.ellipse(0, 0, T*0.34, T*0.17, 0, 0, 6.283); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(214,200,150,0.85)'; g.lineWidth = 2;
    for (var q = 0; q < 4; q++) {
      var sx = q < 2 ? -1 : 1, sy = (q % 2) ? 1 : -1;
      g.beginPath();
      g.moveTo(sx*T*0.44, sy*T*0.10);
      g.lineTo(sx*T*0.44, sy*T*0.19);
      g.lineTo(sx*T*0.30, sy*T*0.22);
      g.stroke();
    }
    g.restore();
  });

  /* scenery */
  Object.keys(map.blocked).forEach(function (k) {
    var pr = k.split(','), cx = (+pr[0]+0.5)*T, cy = (+pr[1]+0.5)*T;
    var kind = rng();
    g.save(); g.translate(cx + (rng()-0.5)*8, cy + (rng()-0.5)*8);
    if (kind < 0.62) {                       // tree
      var hgt = T*0.75 + rng()*T*0.5;
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.beginPath(); g.ellipse(2, 6, T*0.30, T*0.16, 0, 0, 6.283); g.fill();
      g.fillStyle = '#3b2c1e';
      g.fillRect(-2.5, -hgt*0.30, 5, hgt*0.34);
      var lob = 3 + (rng()*2|0);
      for (var L = 0; L < lob; L++) {
        var lx = (rng()-0.5)*T*0.46, ly = -hgt*0.42 + (rng()-0.5)*T*0.34;
        var rad = T*0.24 + rng()*T*0.14;
        g.fillStyle = shade('#2a4a30', (rng()-0.35)*0.35);
        g.beginPath(); g.arc(lx, ly, rad, 0, 6.283); g.fill();
      }
      g.fillStyle = 'rgba(150,190,140,0.18)';
      g.beginPath(); g.arc(-T*0.12, -hgt*0.52, T*0.16, 0, 6.283); g.fill();
    } else if (kind < 0.86) {                // rock
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.beginPath(); g.ellipse(2, 5, T*0.28, T*0.15, 0, 0, 6.283); g.fill();
      g.fillStyle = '#5b5c58';
      g.beginPath();
      for (var v = 0; v < 7; v++) {
        var av = v/7*6.283, rv = T*(0.20+rng()*0.13);
        g[v?'lineTo':'moveTo'](Math.cos(av)*rv, Math.sin(av)*rv*0.8 - 3);
      }
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(190,195,190,0.22)';
      g.beginPath(); g.ellipse(-T*0.06, -T*0.10, T*0.11, T*0.07, -0.5, 0, 6.283); g.fill();
    } else {                                 // scrub
      for (var b = 0; b < 5; b++) {
        g.strokeStyle = shade('#3d5a3a', (rng()-0.4)*0.4);
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo((b-2)*3, 6);
        g.quadraticCurveTo((b-2)*4, -2, (b-2)*6, -9); g.stroke();
      }
    }
    g.restore();
  });

  /* the mouth they come out of, and the gate they are trying to reach */
  var a0 = CF.posAt(T*1.6), a1 = CF.posAt(p.total - T*0.8);
  drawArch(g, a0.x, a0.y);
  drawGate(g, a1.x, a1.y);

  return c;
};

function drawArch(g, x, y) {
  g.save(); g.translate(x, y);
  g.fillStyle = '#1a1410';
  g.beginPath(); g.ellipse(0, 0, T*0.55, T*1.0, 0, 0, 6.283); g.fill();
  g.strokeStyle = '#4b4034'; g.lineWidth = 7;
  g.beginPath(); g.ellipse(0, 0, T*0.62, T*1.05, 0, 0, 6.283); g.stroke();
  g.strokeStyle = '#6b5b45'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, T*0.62, T*1.05, 0, 0, 6.283); g.stroke();
  var gl = g.createRadialGradient(0, 0, 2, 0, 0, T*0.9);
  gl.addColorStop(0, 'rgba(120,60,150,0.55)');
  gl.addColorStop(1, 'rgba(120,60,150,0)');
  g.fillStyle = gl;
  g.beginPath(); g.ellipse(0, 0, T*0.5, T*0.95, 0, 0, 6.283); g.fill();
  g.restore();
}

function drawGate(g, x, y) {
  g.save(); g.translate(x - T*0.35, y);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(-T*0.5, -T*1.5, T*1.4, T*3.0);
  g.fillStyle = '#6d6455';
  g.fillRect(-T*0.42, -T*1.42, T*1.2, T*2.85);
  g.fillStyle = '#7e7565';
  for (var r = 0; r < 8; r++) {
    for (var c2 = 0; c2 < 3; c2++) {
      var ox = (r % 2) ? T*0.2 : 0;
      g.fillRect(-T*0.40 + c2*T*0.40 + ox*0.4, -T*1.40 + r*T*0.36, T*0.36, T*0.32);
    }
  }
  g.fillStyle = '#33291f';
  rr(g, -T*0.30, -T*0.62, T*0.62, T*1.25, 10); g.fill();
  g.fillStyle = '#c9a227';
  g.beginPath(); g.arc(T*0.01, 0, 6, 0, 6.283); g.fill();
  g.restore();
}

/* ── towers ─────────────────────────────────────────────────────────
   Each element gets one dominant mass so the four read apart at a glance:
   a wide bowl, a tall column, a thin ringed mast, a heavy block.
*/
A.bakeTower = function (key, tier) {
  var def = CF.TOWERS[key], el = CF.EL[def.el];
  var SZ = T*3.0, c = cv(SZ, SZ), g = ctxOf(c);
  g.translate(SZ/2, SZ/2 + T*0.55);
  var lift = 1 + tier*0.12;

  /* grounding shadow, tight to the base so nothing floats */
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(3, 2, T*0.52, T*0.22, 0, 0, 6.283); g.fill();

  /* a drum: elliptical top face over a straight body. Every tower is built
     from these so they share a language and still differ in mass. */
  function drum(w, h, yBase, side, top, rim) {
    var hw = w/2, ry = w*0.20;
    g.fillStyle = side;
    g.beginPath();
    g.moveTo(-hw, yBase - h);
    g.lineTo(-hw, yBase);
    g.ellipse(0, yBase, hw, ry, 0, Math.PI, 0, true);
    g.lineTo(hw, yBase - h);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.moveTo(hw*0.28, yBase - h); g.lineTo(hw, yBase - h);
    g.lineTo(hw, yBase); g.lineTo(hw*0.28, yBase);
    g.closePath(); g.fill();
    g.fillStyle = top;
    g.beginPath(); g.ellipse(0, yBase - h, hw, ry, 0, 0, 6.283); g.fill();
    if (rim) {
      g.strokeStyle = rim; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(0, yBase - h, hw, ry, 0, 0, 6.283); g.stroke();
    }
    return yBase - h;
  }
  function glow(x, y, rad, col, core) {
    var gg = g.createRadialGradient(x, y, 1, x, y, rad);
    gg.addColorStop(0, core || '#ffffff');
    gg.addColorStop(0.38, col);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg;
    g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
  }

  if (key === 'emberhearth') {
    /* dominant mass: a wide brazier bowl */
    var y1 = drum(T*0.86, T*0.34, 0, '#4a4239', '#5d5449', '#6f6555');
    var y2 = drum(T*1.16*lift, T*0.40, y1 + 2, '#6b6153', '#3a332a', '#8a7d67');
    g.fillStyle = '#2a231c';
    g.beginPath(); g.ellipse(0, y2, T*0.44*lift, T*0.16*lift, 0, 0, 6.283); g.fill();
    for (var ce = 0; ce < 7; ce++) {
      var ax = (ce/6 - 0.5)*T*0.72*lift;
      g.fillStyle = ce % 2 ? '#ff8a3c' : '#c4381c';
      g.beginPath(); g.arc(ax, y2 + Math.sin(ce)*3, 3.2, 0, 6.283); g.fill();
    }
    glow(0, y2 - T*0.30*lift, T*0.62*lift, el.col, '#fff3c8');

  } else if (key === 'tidespring') {
    /* dominant mass: a tall column standing in a wide basin */
    var b1 = drum(T*1.22, T*0.26, 0, '#464e54', '#39464e', '#5f6b73');
    g.fillStyle = 'rgba(74,168,216,0.35)';
    g.beginPath(); g.ellipse(0, b1, T*0.50, T*0.19, 0, 0, 6.283); g.fill();
    var b2 = drum(T*0.60, T*1.02*lift, b1 + 1, '#5a636b', '#6f7a84', '#8794a0');
    g.strokeStyle = 'rgba(150,215,245,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-T*0.16, b2 + T*0.24); g.lineTo(-T*0.16, b1 - T*0.10); g.stroke();
    g.beginPath(); g.moveTo( T*0.16, b2 + T*0.30); g.lineTo( T*0.16, b1 - T*0.14); g.stroke();
    glow(0, b2 - T*0.14, T*0.50*lift, el.col, '#e8faff');

  } else if (key === 'galeharp') {
    /* dominant mass: a solid drum with FILLED vanes. A thin ring vanished
       against dark ground, so the blades are solid shapes now. */
    var g1 = drum(T*0.98, T*0.30, 0, '#4b4a44', '#5a5952', '#6f6d63');
    var g2 = drum(T*0.52, T*0.62*lift, g1 + 1, '#63615a', '#75736a', '#8a887d');
    g.save();
    g.translate(0, g2 - T*0.06);
    for (var vb = 0; vb < 5; vb++) {
      var av = vb*1.2566 - 0.5;
      g.save(); g.rotate(av);
      g.fillStyle = vb % 2 ? el.col : shade(el.col, -0.30);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(T*0.30*lift, -T*0.10, T*0.46*lift, T*0.10*lift);
      g.quadraticCurveTo(T*0.26*lift, T*0.10, 0, 0);
      g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = '#cfd8d2';
    g.beginPath(); g.arc(0, 0, T*0.11, 0, 6.283); g.fill();
    g.restore();
    glow(0, g2 - T*0.06, T*0.44*lift, el.col);

  } else {
    /* dominant mass: a heavy block, the widest footprint on the board */
    var s1 = drum(T*1.30, T*0.30, 0, '#4a443a', '#57503f', '#6b6353');
    var s2 = drum(T*1.02*lift, T*0.86*lift, s1 + 1, '#5f5647', '#736954', '#8b7f66');
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(-T*0.50*lift, s2 + T*0.30, T*1.00*lift, T*0.09);
    /* the crystal is the element, so it is large and lit */
    var ch = T*0.52*lift;
    g.fillStyle = el.col;
    g.beginPath();
    g.moveTo(0, s2 - ch);
    g.lineTo(T*0.28*lift, s2 - ch*0.30);
    g.lineTo(T*0.16*lift, s2 + T*0.06);
    g.lineTo(-T*0.16*lift, s2 + T*0.06);
    g.lineTo(-T*0.28*lift, s2 - ch*0.30);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(0, s2 - ch); g.lineTo(T*0.10*lift, s2 - ch*0.28);
    g.lineTo(-T*0.02*lift, s2 + T*0.04); g.lineTo(-T*0.10*lift, s2 - ch*0.30);
    g.closePath(); g.fill();
    glow(0, s2 - ch*0.5, T*0.46*lift, el.col);
  }

  /* tier pips on the pad, so an upgrade shows on the board not just a panel */
  for (var p2 = 0; p2 <= tier; p2++) {
    var px = -T*0.26 + p2*T*0.26;
    g.fillStyle = el.col;
    g.beginPath(); g.arc(px, T*0.20, 3.6, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 1.2; g.stroke();
  }
  return c;
};

/* ── enemies ────────────────────────────────────────────────────────
   The Acolyte's ward and the Golem's plate must be visible, because the
   whole point is that you can see what a thing demands before it reaches you.
*/
A.bakeEnemy = function (key) {
  var d = CF.ENEMIES[key];
  var SZ = d.r*4.6, c = cv(SZ, SZ), g = ctxOf(c);
  g.translate(SZ/2, SZ/2);
  var R = d.r;

  /* Every creature gets a dark outline and ONE dominant mass. Without both,
     a sprite this size on a busy road reads as a coloured dot. */
  function outline(w) { g.strokeStyle = 'rgba(12,10,9,0.85)'; g.lineWidth = w || 2.6; g.stroke(); }
  function eyes(col, sp, yy, rad) {
    g.fillStyle = 'rgba(10,8,7,0.9)';
    g.beginPath(); g.arc(-sp, yy, rad*1.5, 0, 6.283); g.fill();
    g.beginPath(); g.arc( sp, yy, rad*1.5, 0, 6.283); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.arc(-sp, yy, rad, 0, 6.283); g.fill();
    g.beginPath(); g.arc( sp, yy, rad, 0, 6.283); g.fill();
  }
  function shadow(w, h) {
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath(); g.ellipse(0, R*0.86, w, h, 0, 0, 6.283); g.fill();
  }
  function poly(pts, fill) {
    g.beginPath();
    pts.forEach(function (pt, i) { g[i ? 'lineTo' : 'moveTo'](pt[0], pt[1]); });
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  }

  if (key === 'husk') {
    /* tall, hunched, ragged: the plain thing everything else is measured against */
    shadow(R*0.66, R*0.26);
    poly([[-R*0.50,R*0.80],[-R*0.62,-R*0.18],[-R*0.34,-R*0.72],[R*0.34,-R*0.72],
          [R*0.62,-R*0.18],[R*0.50,R*0.80],[R*0.22,R*0.56],[0,R*0.86],[-R*0.22,R*0.56]], d.col);
    outline();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    poly([[R*0.10,-R*0.70],[R*0.62,-R*0.18],[R*0.50,R*0.80],[R*0.22,R*0.56]]); g.fill();
    g.fillStyle = '#5d564a';
    poly([[-R*0.66,-R*0.20],[-R*0.30,-R*0.44],[-R*0.30,R*0.02],[-R*0.66,R*0.14]]); g.fill(); outline(1.8);
    poly([[R*0.66,-R*0.20],[R*0.30,-R*0.44],[R*0.30,R*0.02],[R*0.66,R*0.14]]); g.fill(); outline(1.8);
    eyes('#f0e6cc', R*0.20, -R*0.40, R*0.09);

  } else if (key === 'sprite') {
    /* a four-pointed star, never mistakable for a small anything-else */
    g.save();
    g.globalAlpha = 0.35; g.fillStyle = d.col;
    g.beginPath(); g.arc(0, 0, R*1.5, 0, 6.283); g.fill();
    g.restore();
    poly([[0,-R*1.35],[R*0.34,-R*0.34],[R*1.35,0],[R*0.34,R*0.34],
          [0,R*1.35],[-R*0.34,R*0.34],[-R*1.35,0],[-R*0.34,-R*0.34]], d.col);
    outline(2);
    g.fillStyle = '#f2ffe2';
    g.beginPath(); g.arc(0, 0, R*0.42, 0, 6.283); g.fill();
    g.fillStyle = '#40532f';
    g.beginPath(); g.arc(-R*0.14, -R*0.06, R*0.10, 0, 6.283); g.fill();
    g.beginPath(); g.arc( R*0.14, -R*0.06, R*0.10, 0, 6.283); g.fill();

  } else if (key === 'golem') {
    /* the WIDEST thing on the road, and visibly plated */
    shadow(R*0.90, R*0.30);
    poly([[-R*0.96,R*0.10],[-R*0.74,-R*0.56],[-R*0.20,-R*0.80],[R*0.20,-R*0.80],
          [R*0.74,-R*0.56],[R*0.96,R*0.10],[R*0.62,R*0.76],[-R*0.62,R*0.76]], d.col);
    outline(3);
    g.fillStyle = '#a49a88';
    [[-1,-0.42],[-1,0.16],[1,-0.42],[1,0.16]].forEach(function (o) {
      poly([[o[0]*R*0.98, R*o[1]],
            [o[0]*R*0.58, R*(o[1]-0.16)],
            [o[0]*R*0.52, R*(o[1]+0.34)],
            [o[0]*R*0.92, R*(o[1]+0.46)]]);
      g.fill(); outline(1.8);
    });
    g.fillStyle = '#8d8474';
    poly([[-R*0.34,-R*0.78],[R*0.34,-R*0.78],[R*0.26,-R*0.34],[-R*0.26,-R*0.34]]); g.fill(); outline(1.8);
    eyes('#ffd98a', R*0.24, -R*0.54, R*0.10);
    g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-R*0.30, R*0.14); g.lineTo(R*0.26, R*0.30); g.stroke();

  } else if (key === 'acolyte') {
    /* a tall narrow robe inside a visible ward: the ward IS the mechanic */
    shadow(R*0.44, R*0.18);
    g.save();
    g.globalAlpha = 0.16; g.fillStyle = '#9a7fc4';
    g.beginPath(); g.arc(0, 0, R*1.30, 0, 6.283); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(186,160,232,0.95)'; g.lineWidth = 2.6;
    g.beginPath(); g.arc(0, 0, R*1.28, 0, 6.283); g.stroke();
    g.strokeStyle = 'rgba(220,205,255,0.5)'; g.lineWidth = 1.4;
    for (var w2 = 0; w2 < 8; w2++) {
      var aw = w2*0.785;
      g.beginPath(); g.arc(0, 0, R*1.16, aw, aw + 0.34); g.stroke();
    }
    poly([[0,-R*1.02],[R*0.46,-R*0.22],[R*0.60,R*0.80],[-R*0.60,R*0.80],[-R*0.46,-R*0.22]], d.col);
    outline();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    poly([[R*0.06,-R*0.98],[R*0.46,-R*0.22],[R*0.60,R*0.80],[R*0.06,R*0.80]]); g.fill();
    g.fillStyle = '#1d1526';
    g.beginPath(); g.ellipse(0, -R*0.46, R*0.30, R*0.36, 0, 0, 6.283); g.fill();
    eyes('#e6d4ff', R*0.13, -R*0.48, R*0.07);

  } else if (key === 'cinder') {
    /* angular armour, horned helm, fire off the pauldrons */
    shadow(R*0.66, R*0.26);
    g.save();
    g.globalCompositeOperation = 'lighter';
    var cg = g.createRadialGradient(0, -R*0.30, 1, 0, -R*0.30, R*1.5);
    cg.addColorStop(0, 'rgba(255,170,60,0.55)');
    cg.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, -R*0.30, R*1.5, 0, 6.283); g.fill();
    g.restore();
    poly([[-R*0.54,R*0.80],[-R*0.46,-R*0.30],[0,-R*0.62],[R*0.46,-R*0.30],[R*0.54,R*0.80]], d.col);
    outline();
    g.fillStyle = '#8f3a28';
    poly([[-R*0.46,-R*0.34],[-R*1.00,-R*0.10],[-R*0.72,R*0.20],[-R*0.44,R*0.06]]); g.fill(); outline(2);
    poly([[R*0.46,-R*0.34],[R*1.00,-R*0.10],[R*0.72,R*0.20],[R*0.44,R*0.06]]); g.fill(); outline(2);
    g.fillStyle = '#4a2118';
    poly([[-R*0.34,-R*0.56],[-R*0.52,-R*1.02],[-R*0.16,-R*0.74],
          [R*0.16,-R*0.74],[R*0.52,-R*1.02],[R*0.34,-R*0.56]]); g.fill(); outline(2);
    eyes('#ffd06a', R*0.17, -R*0.60, R*0.08);
    g.fillStyle = '#ffb03a';
    for (var fl = 0; fl < 3; fl++) {
      var fx = (fl-1)*R*0.52;
      poly([[fx,-R*1.10],[fx+R*0.13,-R*0.78],[fx-R*0.13,-R*0.78]]); g.fill();
    }

  } else if (key === 'drowned') {
    /* draped and dripping, with long trailing arms */
    shadow(R*0.60, R*0.24);
    g.strokeStyle = 'rgba(90,180,210,0.75)'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(0, 0, R*1.18, 0, 6.283); g.stroke();
    poly([[-R*0.52,R*0.82],[-R*0.58,-R*0.24],[-R*0.24,-R*0.74],[R*0.24,-R*0.74],
          [R*0.58,-R*0.24],[R*0.52,R*0.82]], d.col);
    outline();
    g.fillStyle = '#2f5a68';
    poly([[-R*0.58,-R*0.20],[-R*0.94,R*0.16],[-R*0.74,R*0.70],[-R*0.50,R*0.34]]); g.fill(); outline(1.8);
    poly([[R*0.58,-R*0.20],[R*0.94,R*0.16],[R*0.74,R*0.70],[R*0.50,R*0.34]]); g.fill(); outline(1.8);
    g.strokeStyle = 'rgba(150,215,238,0.85)'; g.lineWidth = 2;
    for (var dr = 0; dr < 4; dr++) {
      var xd = -R*0.42 + dr*R*0.28;
      g.beginPath(); g.moveTo(xd, R*0.72);
      g.lineTo(xd, R*0.72 + R*(0.24 + (dr % 2)*0.26)); g.stroke();
    }
    eyes('#bfefff', R*0.20, -R*0.40, R*0.09);

  } else if (key === 'gorehoof') {
    /* a QUADRUPED: horizontal, low, horns forward. Nothing else is this shape. */
    shadow(R*0.86, R*0.24);
    g.fillStyle = '#3a1c16';
    [-0.62, -0.20, 0.24, 0.62].forEach(function (lx) {
      g.fillRect(R*lx - R*0.09, R*0.20, R*0.18, R*0.62);
    });
    g.fillStyle = d.col;
    g.beginPath(); g.ellipse(-R*0.08, 0, R*0.92, R*0.50, -0.10, 0, 6.283); g.fill();
    outline(2.8);
    g.fillStyle = '#8d4433';
    g.beginPath(); g.ellipse(-R*0.60, -R*0.06, R*0.38, R*0.40, 0, 0, 6.283); g.fill(); outline(2);
    g.fillStyle = d.col;
    g.beginPath(); g.ellipse(R*0.78, R*0.06, R*0.36, R*0.28, 0.18, 0, 6.283); g.fill(); outline(2.2);
    g.fillStyle = '#e2d8c2';
    poly([[R*0.72,-R*0.18],[R*1.52,-R*0.56],[R*1.30,-R*0.06],[R*0.88,R*0.02]]); g.fill(); outline(2);
    poly([[R*0.70,R*0.14],[R*1.42,R*0.30],[R*1.16,R*0.46],[R*0.84,R*0.30]]); g.fill(); outline(1.8);
    g.fillStyle = '#ffd0a0';
    g.beginPath(); g.arc(R*0.86, -R*0.02, R*0.09, 0, 6.283); g.fill();

  } else {
    /* the idol: a broken monolith with a carved face */
    shadow(R*1.00, R*0.34);
    g.save();
    g.globalAlpha = 0.20; g.fillStyle = '#8f7fc0';
    g.beginPath(); g.arc(0, 0, R*1.34, 0, 6.283); g.fill();
    g.restore();
    poly([[0,-R*1.10],[R*0.62,-R*0.86],[R*0.90,-R*0.10],[R*0.70,R*0.86],
          [-R*0.70,R*0.86],[-R*0.90,-R*0.10],[-R*0.62,-R*0.86]], d.col);
    outline(3.4);
    g.fillStyle = '#8b7fa8';
    for (var cr = 0; cr < 5; cr++) {
      var cx2 = (cr-2)*R*0.30;
      poly([[cx2-R*0.10,-R*0.88],[cx2,-R*1.34 + (cr%2)*R*0.20],[cx2+R*0.10,-R*0.88]]);
      g.fill(); outline(1.6);
    }
    g.fillStyle = '#15101c';
    poly([[-R*0.46,-R*0.40],[R*0.46,-R*0.40],[R*0.34,R*0.14],[-R*0.34,R*0.14]]); g.fill();
    eyes('#dcc6ff', R*0.22, -R*0.16, R*0.11);
    g.strokeStyle = 'rgba(20,14,26,0.55)'; g.lineWidth = 2.2;
    for (var ck = 0; ck < 4; ck++) {
      var a2 = -0.9 + ck*0.62;
      g.beginPath();
      g.moveTo(Math.cos(a2)*R*0.34, Math.sin(a2)*R*0.34 + R*0.34);
      g.lineTo(Math.cos(a2)*R*0.84, Math.sin(a2)*R*0.84 + R*0.50);
      g.stroke();
    }
    g.strokeStyle = 'rgba(201,182,232,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, R*1.24, 0, 6.283); g.stroke();
  }
  return c;
};

/* ── heroes ─────────────────────────────────────────────────────────── */
A.bakeHero = function (key) {
  var d = CF.HEROES[key], el = CF.EL[d.el];
  var R = 15, S = R*4, c = cv(S, S), g = ctxOf(c);
  g.translate(S/2, S/2);

  g.fillStyle = 'rgba(0,0,0,0.40)';
  g.beginPath(); g.ellipse(0, R*0.9, R*0.8, R*0.30, 0, 0, 6.283); g.fill();

  /* cloak, then body, then the element they carry sitting above the head */
  g.fillStyle = el.dim;
  g.beginPath();
  g.moveTo(0, -R*0.5); g.lineTo(R*0.86, R*0.80); g.lineTo(-R*0.86, R*0.80);
  g.closePath(); g.fill();
  g.fillStyle = '#e6dcc4';
  rr(g, -R*0.34, -R*0.52, R*0.68, R*1.10, 5); g.fill();
  g.fillStyle = '#cbbfa2';
  g.beginPath(); g.arc(0, -R*0.62, R*0.30, 0, 6.283); g.fill();

  if (key === 'vess') {                      // a bow, so ranged reads at a glance
    g.strokeStyle = '#8a6d43'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(R*0.62, 0, R*0.60, -1.2, 1.2); g.stroke();
    g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(R*0.84, -R*0.56); g.lineTo(R*0.84, R*0.56); g.stroke();
  } else if (key === 'kestrel') {            // twin knives
    g.strokeStyle = '#d6dde2'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(R*0.40, -R*0.10); g.lineTo(R*0.92, -R*0.46); g.stroke();
    g.beginPath(); g.moveTo(-R*0.40, -R*0.10); g.lineTo(-R*0.92, -R*0.46); g.stroke();
  } else {                                   // a heavy blade
    g.strokeStyle = '#d6dde2'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(R*0.38, R*0.24); g.lineTo(R*1.02, -R*0.62); g.stroke();
    g.strokeStyle = '#8a6d43'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(R*0.30, R*0.34); g.lineTo(R*0.46, R*0.14); g.stroke();
  }

  var hg = g.createRadialGradient(0, -R*1.18, 1, 0, -R*1.18, R*0.62);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.35, el.col);
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hg;
  g.beginPath(); g.arc(0, -R*1.18, R*0.55, 0, 6.283); g.fill();
  return c;
};

/* ── a small element badge, reused all over the interface ───────────── */
A.bakeBadge = function (elKey, size) {
  var el = CF.EL[elKey], c = cv(size, size), g = ctxOf(c);
  g.translate(size/2, size/2);
  var rad = size*0.40;
  var gr = g.createRadialGradient(0, 0, 1, 0, 0, rad);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, el.col);
  gr.addColorStop(1, el.dim);
  g.fillStyle = gr;
  if (elKey === 'ember') {
    g.beginPath();
    g.moveTo(0, -rad); g.quadraticCurveTo(rad*0.9, -rad*0.1, 0, rad);
    g.quadraticCurveTo(-rad*0.9, -rad*0.1, 0, -rad); g.fill();
  } else if (elKey === 'tide') {
    g.beginPath(); g.arc(0, 0, rad*0.88, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-rad*0.6, rad*0.1);
    g.quadraticCurveTo(0, -rad*0.45, rad*0.6, rad*0.1); g.stroke();
  } else if (elKey === 'gale') {
    g.beginPath();
    for (var i = 0; i < 3; i++) {
      var a = i*2.094 - 1.57;
      g.moveTo(0, 0);
      g.arc(0, 0, rad, a, a+0.9);
    }
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(0, -rad); g.lineTo(rad*0.86, 0); g.lineTo(0, rad); g.lineTo(-rad*0.86, 0);
    g.closePath(); g.fill();
  }
  return c;
};

/* everything baked once at boot */
A.build = function () {
  A.statics = A.bakeStatic();
  A.towers = {};
  CF.TOWER_ORDER.forEach(function (k) {
    A.towers[k] = [0,1,2].map(function (t) { return A.bakeTower(k, t); });
  });
  A.enemies = {};
  Object.keys(CF.ENEMIES).forEach(function (k) { A.enemies[k] = A.bakeEnemy(k); });
  A.heroes = {};
  CF.HERO_ORDER.forEach(function (k) { A.heroes[k] = A.bakeHero(k); });
  A.badges = {};
  CF.EL_ORDER.forEach(function (k) { A.badges[k] = A.bakeBadge(k, 34); });
  A.ready = true;
};

})(window.CF);
