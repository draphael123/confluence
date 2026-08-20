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
   Painted once at boot, so it can afford far more detail than a per-frame
   pass ever could. Everything obeys ONE light direction (upper left), which
   is most of what separates "painted" from "flat fill": warm light on the
   upper-left of every mass, cool shadow on the lower-right, and every cast
   shadow offset the same way.
*/
var LX = -0.58, LY = -0.81;              // direction the light comes FROM
var SHX = 5, SHY = 7;                    // therefore every shadow lands here

A.bakeStatic = function () {
  var W = CF.COLS*T, H = CF.ROWS*T;
  var c = cv(W, H), g = ctxOf(c);
  var map = CF.map(), p = CF.path();
  var rng = CF.makeRng(4242);

  function blob(x, y, rx, ry, rot, col, a) {
    g.save(); g.globalAlpha = a;
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 6.283); g.fill();
    g.restore();
  }

  /* ── 1. turf, built in scales: broad meadow variation first, then
        patches, then blades. Uniform noise alone always reads as static. */
  var base = g.createLinearGradient(0, 0, W*0.35, H);
  base.addColorStop(0, '#3a5945');
  base.addColorStop(0.55, '#314b3b');
  base.addColorStop(1, '#273c30');
  g.fillStyle = base; g.fillRect(0, 0, W, H);

  for (var m = 0; m < 26; m++) {           // broad rolls of lighter/darker turf
    var mx = rng()*W, my = rng()*H;
    var mr = 120 + rng()*260;
    blob(mx, my, mr, mr*(0.5 + rng()*0.4), rng()*3.14,
         rng() < 0.5 ? '#48704f' : '#24382c', 0.18 + rng()*0.14);
  }
  for (var pch = 0; pch < 46; pch++) {     // mid patches, some yellowed, some cold
    var px = rng()*W, py = rng()*H;
    var pr = 34 + rng()*90;
    var tone = rng();
    var col = tone < 0.34 ? '#4a6b41' : tone < 0.62 ? '#5c7444' : tone < 0.85 ? '#2a4436' : '#6b7a45';
    blob(px, py, pr, pr*(0.42 + rng()*0.4), rng()*3.14, col, 0.16 + rng()*0.14);
  }

  /* blades: short strokes, all leaning the same way, as if one wind */
  g.save();
  g.lineCap = 'round';
  for (var b = 0; b < 4200; b++) {
    var bx = rng()*W, by = rng()*H;
    var len = 1.8 + rng()*3.0;
    var lean = (rng() < 0.5 ? 1 : -1) * (0.15 + rng()*0.35);
    var lum = rng();
    g.strokeStyle = lum < 0.42 ? 'rgba(120,158,104,0.30)'
                  : lum < 0.78 ? 'rgba(46,72,52,0.34)'
                               : 'rgba(158,182,116,0.22)';
    g.lineWidth = 0.9 + rng()*1.0;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(bx + len*lean*0.5, by - len*0.6, bx + len*lean, by - len);
    g.stroke();
  }
  g.restore();

  /* a few pale wildflowers: cheap, and they read as "finished" */
  for (var fl = 0; fl < 190; fl++) {
    var fx = rng()*W, fy = rng()*H;
    if (CF.roadDist(fx, fy) < (CF.PATH_HALF + 0.7)*T) continue;
    var fc = rng();
    g.fillStyle = fc < 0.4 ? 'rgba(226,224,180,0.75)'
                : fc < 0.72 ? 'rgba(198,206,224,0.6)' : 'rgba(214,178,196,0.6)';
    g.beginPath(); g.arc(fx, fy, 1.1 + rng()*1.1, 0, 6.283); g.fill();
  }

  /* ── 2. the road: soil bed, worn surface, broken edges ── */
  function strokePath(width, style, cap) {
    g.save();
    g.lineJoin = 'round'; g.lineCap = cap || 'round';
    g.strokeStyle = style; g.lineWidth = width;
    g.beginPath();
    g.moveTo(p.pts[0].x, p.pts[0].y);
    for (var k = 1; k < p.pts.length; k++) g.lineTo(p.pts[k].x, p.pts[k].y);
    g.stroke();
    g.restore();
  }
  strokePath(T*2.30, 'rgba(12,20,14,0.55)');     // the ground dips: soft AO
  strokePath(T*2.10, '#3c3325');                 // turned soil at the verge
  strokePath(T*1.92, '#6a583d');
  strokePath(T*1.70, '#7a6749');                 // worn surface
  strokePath(T*1.20, '#87724f');                 // the part boots actually touch

  /* break the outline so it stops reading as a stroked line */
  for (var e2 = 0; e2 < 620; e2++) {
    var d2 = rng()*p.total;
    var a2 = CF.posAt(d2);
    var nx2 = -a2.uy, ny2 = a2.ux;
    var side = rng() < 0.5 ? -1 : 1;
    var off = (0.86 + rng()*0.26)*T*side;
    var ex = a2.x + nx2*off, ey = a2.y + ny2*off;
    if (rng() < 0.55) {                          // turf spilling onto the road
      blob(ex, ey, 5 + rng()*11, 3 + rng()*7, rng()*3.14, '#33503a', 0.55);
    } else {                                     // dirt spilling onto the turf
      blob(ex, ey, 4 + rng()*9, 3 + rng()*6, rng()*3.14, '#6e5c40', 0.45);
    }
  }

  /* ruts that follow the road, and grit */
  g.save();
  g.lineCap = 'round';
  for (var rt = 0; rt < 3; rt++) {
    var offR = (rt - 1)*T*0.42;
    g.strokeStyle = 'rgba(52,42,28,0.30)';
    g.lineWidth = 2.5 + rng()*2;
    g.beginPath();
    var started = false;
    for (var dd = 0; dd < p.total; dd += 14) {
      var ar = CF.posAt(dd);
      var nxr = -ar.uy, nyr = ar.ux;
      var wob = Math.sin(dd*0.03 + rt)*3;
      var rx2 = ar.x + nxr*(offR + wob), ry2 = ar.y + nyr*(offR + wob);
      if (!started) { g.moveTo(rx2, ry2); started = true; } else g.lineTo(rx2, ry2);
    }
    g.stroke();
  }
  g.restore();
  for (var gr = 0; gr < 1500; gr++) {
    var dg = rng()*p.total, ag = CF.posAt(dg);
    var ng = -ag.uy, mg = ag.ux;
    var og = (rng() - 0.5)*T*1.5;
    var gx = ag.x + ng*og, gy = ag.y + mg*og;
    var gl = rng();
    g.fillStyle = gl < 0.45 ? 'rgba(46,37,24,0.45)'
                : gl < 0.8 ? 'rgba(160,142,108,0.35)' : 'rgba(196,180,140,0.28)';
    g.beginPath(); g.arc(gx, gy, 0.7 + rng()*1.5, 0, 6.283); g.fill();
  }

  /* ── 3. scenery, lit from the same place as everything else ── */
  function castShadow(x, y, rx, ry) {
    g.save(); g.globalAlpha = 0.34; g.fillStyle = '#0d1610';
    g.beginPath(); g.ellipse(x + SHX, y + SHY, rx, ry, 0, 0, 6.283); g.fill();
    g.restore();
  }

  function tree(x, y, scale) {
    var hgt = T*(0.9 + rng()*0.55)*scale;
    var cw = T*(0.46 + rng()*0.2)*scale;
    castShadow(x + 3, y + 4, cw*1.05, cw*0.44);
    g.strokeStyle = '#3a2a1c';
    g.lineWidth = 4.5*scale; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x - 2, y - hgt*0.4, x - 1, y - hgt*0.55); g.stroke();
    var lobes = 5 + (rng()*4|0);
    var cy = y - hgt*0.72;
    for (var L = 0; L < lobes; L++) {           // dark mass first
      var lx = x + (rng()-0.5)*cw*1.7, ly = cy + (rng()-0.5)*cw*1.05;
      g.fillStyle = '#25412b';
      g.beginPath(); g.arc(lx, ly, cw*(0.55 + rng()*0.42), 0, 6.283); g.fill();
    }
    for (var L2 = 0; L2 < lobes; L2++) {        // mid tone
      var lx2 = x + (rng()-0.5)*cw*1.5, ly2 = cy + (rng()-0.5)*cw*0.9;
      g.fillStyle = rng() < 0.5 ? '#2b4b2e' : '#325533';
      g.beginPath(); g.arc(lx2, ly2, cw*(0.42 + rng()*0.34), 0, 6.283); g.fill();
    }
    for (var L3 = 0; L3 < 4; L3++) {            // light catching the upper left
      var lx3 = x + LX*cw*0.75 + (rng()-0.5)*cw*0.7;
      var ly3 = cy + LY*cw*0.55 + (rng()-0.5)*cw*0.5;
      g.fillStyle = rng() < 0.5 ? 'rgba(126,166,104,0.75)' : 'rgba(158,190,120,0.55)';
      g.beginPath(); g.arc(lx3, ly3, cw*(0.20 + rng()*0.20), 0, 6.283); g.fill();
    }
  }

  function bush(x, y, scale) {
    var r0 = T*(0.28 + rng()*0.16)*scale;
    castShadow(x, y + 2, r0*1.2, r0*0.44);
    for (var q = 0; q < 4; q++) {
      var bx2 = x + (rng()-0.5)*r0*1.6, by2 = y - rng()*r0*0.7;
      g.fillStyle = '#233d28';
      g.beginPath(); g.arc(bx2, by2, r0*(0.6 + rng()*0.4), 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(120,160,100,0.55)';
    g.beginPath(); g.arc(x + LX*r0*0.5, y - r0*0.55, r0*0.42, 0, 6.283); g.fill();
    if (rng() < 0.35) {                          // berries
      g.fillStyle = 'rgba(196,86,72,0.85)';
      for (var be = 0; be < 3; be++) {
        g.beginPath();
        g.arc(x + (rng()-0.5)*r0, y - rng()*r0*0.8, 1.6, 0, 6.283); g.fill();
      }
    }
  }

  function rock(x, y, scale) {
    var r0 = T*(0.22 + rng()*0.2)*scale;
    castShadow(x, y + 2, r0*1.25, r0*0.5);
    var pts = [], n = 6 + (rng()*3|0);
    for (var v = 0; v < n; v++) {
      var av = v/n*6.283, rv = r0*(0.75 + rng()*0.45);
      pts.push([x + Math.cos(av)*rv, y + Math.sin(av)*rv*0.78]);
    }
    g.beginPath();
    pts.forEach(function (pt, i) { g[i ? 'lineTo' : 'moveTo'](pt[0], pt[1]); });
    g.closePath();
    g.fillStyle = '#4e5150'; g.fill();
    g.strokeStyle = 'rgba(16,20,20,0.6)'; g.lineWidth = 1.4; g.stroke();
    g.save(); g.clip();                          // lit face, upper left
    g.fillStyle = 'rgba(158,166,162,0.55)';
    g.beginPath();
    g.ellipse(x + LX*r0*0.5, y + LY*r0*0.5, r0*0.8, r0*0.5, -0.5, 0, 6.283);
    g.fill();
    g.fillStyle = 'rgba(180,150,90,0.20)';       // lichen
    g.beginPath(); g.arc(x + r0*0.3, y + r0*0.2, r0*0.35, 0, 6.283); g.fill();
    g.restore();
  }

  function log(x, y, scale) {
    var len = T*(0.7 + rng()*0.5)*scale, rad = T*0.16*scale;
    var rot = rng()*3.14;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.globalAlpha = 0.34; g.fillStyle = '#0d1610';
    rr(g, -len/2 + SHX, -rad + SHY, len, rad*2, rad); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#4a3826';
    rr(g, -len/2, -rad, len, rad*2, rad); g.fill();
    g.fillStyle = 'rgba(124,98,66,0.7)';
    rr(g, -len/2, -rad, len, rad*0.8, rad*0.5); g.fill();
    g.fillStyle = '#6b533a';
    g.beginPath(); g.ellipse(len/2, 0, rad*0.45, rad, 0, 0, 6.283); g.fill();
    g.restore();
  }

  /* blocked tiles get the big pieces; the gaps get filler so the field does
     not look like objects sitting on a grid */
  var placed = [];
  Object.keys(map.blocked).forEach(function (k) {
    var pr = k.split(','), cx = (+pr[0]+0.5)*T, cy = (+pr[1]+0.5)*T;
    cx += (rng()-0.5)*14; cy += (rng()-0.5)*14;
    placed.push([cx, cy]);
    var kind = rng();
    if (kind < 0.52) tree(cx, cy, 0.85 + rng()*0.6);
    else if (kind < 0.76) rock(cx, cy, 0.85 + rng()*0.7);
    else if (kind < 0.92) bush(cx, cy, 0.9 + rng()*0.5);
    else log(cx, cy, 0.9 + rng()*0.4);
  });
  for (var fi = 0; fi < 62; fi++) {             // small filler, never on road
    var fx2 = rng()*W, fy2 = rng()*H;
    if (CF.roadDist(fx2, fy2) < (CF.PATH_HALF + 1.15)*T) continue;
    var kk = fx2/T | 0, rr2 = fy2/T | 0;
    if (map.plots[kk + ',' + rr2]) continue;
    if (rng() < 0.55) bush(fx2, fy2, 0.42 + rng()*0.3);
    else rock(fx2, fy2, 0.34 + rng()*0.3);
  }

  /* ── 4. plots: something a mason built, not a grey disc ── */
  Object.keys(map.plots).forEach(function (k) {
    var pr = k.split(','), cx = (+pr[0]+0.5)*T, cy = (+pr[1]+0.5)*T;
    g.save();
    g.translate(cx, cy);
    g.globalAlpha = 0.4; g.fillStyle = '#0d1610';
    g.beginPath(); g.ellipse(SHX*0.6, SHY*0.6 + 2, T*0.52, T*0.27, 0, 0, 6.283); g.fill();
    g.globalAlpha = 1;

    var rimN = 9;
    function ringPath(rad, sq) {
      g.beginPath();
      for (var q = 0; q < rimN; q++) {
        var aq = q/rimN*6.283 - 0.3;
        var xq = Math.cos(aq)*rad, yq = Math.sin(aq)*rad*sq;
        g[q ? 'lineTo' : 'moveTo'](xq, yq);
      }
      g.closePath();
    }
    g.fillStyle = '#3f3a30'; ringPath(T*0.50, 0.52); g.fill();        // kerb, shadow side
    g.fillStyle = '#6c6455'; ringPath(T*0.47, 0.52); g.fill();        // kerb top
    g.fillStyle = '#8b8270';                                          // lit edge
    g.save(); g.clip();
    g.beginPath(); g.ellipse(LX*T*0.2, LY*T*0.18, T*0.5, T*0.3, 0, 0, 6.283); g.fill();
    g.restore();

    var pad = g.createRadialGradient(LX*T*0.16, LY*T*0.12, 2, 0, 0, T*0.44);
    pad.addColorStop(0, '#7b735f');
    pad.addColorStop(1, '#4e4839');
    g.fillStyle = pad; ringPath(T*0.40, 0.52); g.fill();

    g.strokeStyle = 'rgba(28,24,18,0.55)'; g.lineWidth = 1.2;          // flagstone joints
    for (var j = 0; j < 3; j++) {
      var aj = j*1.047 + 0.3;
      g.beginPath();
      g.moveTo(Math.cos(aj)*T*0.40, Math.sin(aj)*T*0.21);
      g.lineTo(Math.cos(aj + 3.14)*T*0.40, Math.sin(aj + 3.14)*T*0.21);
      g.stroke();
    }
    g.fillStyle = 'rgba(70,102,64,0.5)';                               // moss in the cracks
    for (var ms = 0; ms < 5; ms++) {
      var am = rng()*6.283, rm = T*0.38*(0.6 + rng()*0.4);
      g.beginPath();
      g.ellipse(Math.cos(am)*rm, Math.sin(am)*rm*0.52, 3.5, 2, 0, 0, 6.283); g.fill();
    }
    g.restore();
  });

  /* ── 5. the ends of the road ── */
  var a0 = CF.posAt(CF.ARCH_D), a1 = CF.posAt(p.total - T*0.8);
  drawArch(g, a0.x, a0.y);
  drawGate(g, a1.x, a1.y);

  return c;
};

/* slow cloud shadow, scrolled across the board each frame. One baked texture
   drawn twice is far cheaper than building gradients per frame. */
A.bakeClouds = function () {
  var W = CF.COLS*T, H = CF.ROWS*T;
  var c = cv(W, H), g = ctxOf(c);
  var rng = CF.makeRng(1717);
  for (var i = 0; i < 7; i++) {
    var x = rng()*W, y = rng()*H, r = 300 + rng()*420;
    var gr = g.createRadialGradient(x, y, r*0.15, x, y, r);
    gr.addColorStop(0, 'rgba(10,20,16,0.16)');
    gr.addColorStop(1, 'rgba(8,16,12,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, r, r*0.62, rng()*3.14, 0, 6.283); g.fill();
  }
  return c;
};

function drawArch(g, x, y) {
  g.save(); g.translate(x, y);
  g.globalAlpha = 0.4; g.fillStyle = '#0d1610';
  g.beginPath(); g.ellipse(SHX, SHY, T*0.78, T*1.18, 0, 0, 6.283); g.fill();
  g.globalAlpha = 1;
  /* weathered stone jambs */
  g.fillStyle = '#4b4438';
  g.beginPath(); g.ellipse(0, 0, T*0.72, T*1.15, 0, 0, 6.283); g.fill();
  g.fillStyle = '#635a49';
  g.beginPath(); g.ellipse(LX*3, LY*3, T*0.70, T*1.12, 0, 0, 6.283); g.fill();
  g.fillStyle = '#0b0810';
  g.beginPath(); g.ellipse(0, 0, T*0.52, T*0.96, 0, 0, 6.283); g.fill();
  var gl = g.createRadialGradient(0, 0, 2, 0, 0, T*0.9);
  gl.addColorStop(0, 'rgba(150,80,190,0.65)');
  gl.addColorStop(0.6, 'rgba(96,44,140,0.35)');
  gl.addColorStop(1, 'rgba(80,30,120,0)');
  g.fillStyle = gl;
  g.beginPath(); g.ellipse(0, 0, T*0.52, T*0.96, 0, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(190,150,230,0.5)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, T*0.52, T*0.96, 0, 0, 6.283); g.stroke();
  g.restore();
}

function drawGate(g, x, y) {
  g.save(); g.translate(x - T*0.30, y);
  g.globalAlpha = 0.42; g.fillStyle = '#0d1610';
  g.fillRect(-T*0.46 + SHX, -T*1.56 + SHY, T*1.36, T*3.12);
  g.globalAlpha = 1;
  var wall = g.createLinearGradient(-T*0.5, 0, T*0.9, 0);
  wall.addColorStop(0, '#7d7362');
  wall.addColorStop(1, '#565045');
  g.fillStyle = wall;
  g.fillRect(-T*0.46, -T*1.50, T*1.30, T*3.00);
  /* courses of stone, lit on their upper edge */
  for (var r = 0; r < 9; r++) {
    for (var c2 = 0; c2 < 3; c2++) {
      var ox = (r % 2) ? T*0.18 : 0;
      var bx = -T*0.44 + c2*T*0.42 + ox*0.4;
      var by = -T*1.48 + r*T*0.34;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(bx, by, T*0.38, T*0.30);
      g.fillStyle = 'rgba(190,180,160,0.16)';
      g.fillRect(bx, by, T*0.38, T*0.06);
    }
  }
  g.fillStyle = '#241c14';                                   // the doorway
  rr(g, -T*0.30, -T*0.66, T*0.66, T*1.32, 11); g.fill();
  g.strokeStyle = '#8b7f66'; g.lineWidth = 2.5;
  rr(g, -T*0.30, -T*0.66, T*0.66, T*1.32, 11); g.stroke();
  var lamp = g.createRadialGradient(T*0.02, 0, 1, T*0.02, 0, T*0.5);
  lamp.addColorStop(0, '#ffe9a8');
  lamp.addColorStop(0.4, 'rgba(216,176,74,0.65)');
  lamp.addColorStop(1, 'rgba(216,176,74,0)');
  g.fillStyle = lamp;
  g.beginPath(); g.arc(T*0.02, 0, T*0.5, 0, 6.283); g.fill();
  g.fillStyle = '#ffeaa8';
  g.beginPath(); g.arc(T*0.02, 0, 5, 0, 6.283); g.fill();
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
/* the ground painting belongs to one road; changing roads must repaint it */
A.rebakeMap = function () {
  A.statics = A.bakeStatic();
};

A.build = function () {
  A.statics = A.bakeStatic();
  A.clouds = A.bakeClouds();
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
