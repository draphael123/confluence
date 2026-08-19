/* Why do three of the six reactions barely fire?

   Counts, per element: shots fired, auras actually laid, and how often each
   element was one half of a reaction. If an element lands few auras it cannot
   be half of anything, and every reaction it belongs to dies with it.
*/
var path = require('path');
var root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js', 'data.js'));
require(path.join(root, 'js', 'sim.js'));
var CF = global.window.CF;
var T = CF.TILE;

var SEEDS = 15;
var MIX = ['galeharp','stoneward','emberhearth','tidespring'];

var laid = {}, halves = {}, shots = {}, refused = {};
CF.EL_ORDER.forEach(function (e) { laid[e] = halves[e] = shots[e] = refused[e] = 0; });
var fired = {};
Object.keys(CF.REACT).forEach(function (k) { fired[CF.REACT[k].key] = 0; });

/* wrap the one rule so we can see what it actually does, shot by shot */
var realApply = CF.applyElement;
CF.applyElement = function (S, e, el, x, y) {
  shots[el]++;
  var hadAura = e.aura;
  var blocked = e.reactCd > 0 || e.immuneT > 0 || e.def.burnsOff === el;
  var out = realApply.call(CF, S, e, el, x, y);
  if (blocked) { refused[el]++; return out; }
  if (out) { halves[el]++; halves[hadAura]++; fired[out.key]++; }
  else if (e.aura === el) laid[el]++;
  return out;
};

var towersBuilt = {}, towerShots = {};
CF.TOWER_ORDER.forEach(function (k) { towersBuilt[k] = towerShots[k] = 0; });

for (var s = 1; s <= SEEDS; s++) {
  var S = CF.sim({ seed:s, mix:MIX });
  S.towers.forEach(function (t) { towersBuilt[t.key]++; towerShots[t.key] += t.shots; });
}

function pct(n, d) { return d ? (100*n/d).toFixed(0) + '%' : '-'; }

console.log('== per element, totalled over ' + SEEDS + ' full runs ==');
console.log('element  applications  auras laid  refused  was-half-of-a-reaction');
CF.EL_ORDER.forEach(function (e) {
  console.log('  ' + e.padEnd(7) +
    String(shots[e]).padStart(11) +
    String(laid[e]).padStart(12) +
    (String(refused[e]) + ' (' + pct(refused[e], shots[e]) + ')').padStart(14) +
    String(halves[e]).padStart(22));
});

console.log('\n== towers ==');
console.log('tower          built/run   shots/run   shots per tower');
CF.TOWER_ORDER.forEach(function (k) {
  var b = towersBuilt[k]/SEEDS, sh = towerShots[k]/SEEDS;
  console.log('  ' + k.padEnd(13) + b.toFixed(1).padStart(8) +
              sh.toFixed(0).padStart(12) + (b ? (sh/b).toFixed(0) : '-').padStart(17));
});

console.log('\n== reactions ==');
var tot = 0;
Object.keys(fired).forEach(function (k) { tot += fired[k]; });
Object.keys(fired).sort(function (a, b) { return fired[b]-fired[a]; }).forEach(function (k) {
  var r = null;
  Object.keys(CF.REACT).forEach(function (rk) { if (CF.REACT[rk].key === k) r = CF.REACT[rk]; });
  console.log('  ' + k.padEnd(11) + String(fired[k]).padStart(6) +
              pct(fired[k], tot).padStart(7) + '   ' + r.pair.join(' + '));
});

console.log('\n== tower reach ==');
CF.TOWER_ORDER.forEach(function (k) {
  var d = CF.TOWERS[k], t0 = d.tiers[0];
  console.log('  ' + k.padEnd(13) + 'range ' + t0.range.toFixed(1) +
              '  rof ' + t0.rof.toFixed(2) +
              '  -> ' + (1/t0.rof).toFixed(2) + ' applications/sec');
});
