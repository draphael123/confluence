/* Search Stoneward's aura-splash radius, and whether Tidespring's damage
   splash should lay auras at all.

   The thing being optimised is the SPREAD of the six reactions: two area
   appliers will always pair with each other preferentially, so the goal is
   the flattest distribution, not the biggest number.
*/
var path = require('path');
var root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js', 'data.js'));
require(path.join(root, 'js', 'sim.js'));
var CF = global.window.CF;

var SEEDS = 11;
var MIX = ['galeharp','stoneward','emberhearth','tidespring'];
var KEYS = ['steam','firestorm','magma','frost','mire','grit'];

function run(auraSplash, tideAura) {
  CF.TOWERS.stoneward.tiers[0].auraSplash = auraSplash;
  CF.TOWERS.stoneward.tiers[1].auraSplash = auraSplash * 1.09;
  CF.TOWERS.stoneward.tiers[2].auraSplash = auraSplash * 1.23;
  CF.SPLASH_LAYS_AURA = tideAura;

  var tot = {}, cleared = 0, lives = 0, sum = 0;
  KEYS.forEach(function (k) { tot[k] = 0; });
  for (var s = 1; s <= SEEDS; s++) {
    var S = CF.sim({ seed:s, mix:MIX });
    if (S.won) cleared++;
    lives += S.lives;
    KEYS.forEach(function (k) { tot[k] += S.stats.reactions[k]; sum += S.stats.reactions[k]; });
  }
  var shares = KEYS.map(function (k) { return sum ? 100*tot[k]/sum : 0; });
  return {
    auraSplash:auraSplash, tideAura:tideAura,
    shares:shares,
    max:Math.max.apply(null, shares),
    min:Math.min.apply(null, shares),
    cleared:cleared, lives:(lives/SEEDS)
  };
}

console.log('splash tideAura  ' + KEYS.map(function (k) { return k.slice(0,5).padStart(6); }).join('') +
            '     max    min  clear  lives');
var best = null;
[0, 1.0, 1.3, 1.6, 1.9, 2.2].forEach(function (a) {
  [true, false].forEach(function (ta) {
    var r = run(a, ta);
    console.log(
      a.toFixed(1).padStart(6) + String(ta).padStart(9) + '  ' +
      r.shares.map(function (v) { return v.toFixed(0).padStart(6); }).join('') +
      r.max.toFixed(0).padStart(8) + r.min.toFixed(0).padStart(7) +
      (r.cleared + '/' + SEEDS).padStart(7) + r.lives.toFixed(1).padStart(7));
    /* flattest distribution that still clears most of the time */
    var score = r.max - r.min;
    if (r.cleared >= SEEDS*0.6 && (!best || score < best.score)) { best = r; best.score = score; }
  });
});
console.log('\nflattest that still holds the road: auraSplash ' + best.auraSplash +
            ', tide splash lays aura = ' + best.tideAura +
            '  (max ' + best.max.toFixed(0) + '%, min ' + best.min.toFixed(0) + '%)');
