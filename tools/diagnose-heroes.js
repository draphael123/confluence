/* What actually makes a hero strong here?

   A hero does three separate things: it BLOCKS foes, it deals damage, and it
   lays an element anywhere you send it. Only the third is the role the design
   wants them for. This isolates each channel so the fix lands on the right one.
*/
var path = require('path');
var root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js', 'data.js'));
require(path.join(root, 'js', 'sim.js'));
var CF = global.window.CF;

var SEEDS = 21;
var MIX = ['galeharp','stoneward','emberhearth','tidespring'];

var realAdd = CF.addHero;
var realApply = CF.applyElement;
var realHurt = CF.hurt;

function arm(label, opts) {
  opts = opts || {};
  var savedCap = CF.HERO_BLOCK_CAP;
  var savedDmg = {};
  CF.HERO_ORDER.forEach(function (k) { savedDmg[k] = CF.HEROES[k].dmg; });

  if (opts.cap !== undefined) CF.HERO_BLOCK_CAP = opts.cap;
  if (opts.noDamage) CF.HERO_ORDER.forEach(function (k) { CF.HEROES[k].dmg = 0; });
  if (opts.noHeroes) CF.addHero = function () { return null; };
  if (opts.noElement) {
    /* a hero that still blocks and hits, but lays nothing */
    CF.applyElement = function (S, e, el, x, y) {
      if (el && S.heroes.some(function (h) { return h.el === el && h.alive &&
            Math.hypot(h.x - e.x, h.y - e.y) < 200; }) && opts.mark) return null;
      return realApply.apply(CF, arguments);
    };
  }

  var cl = 0, lv = 0, rx = 0;
  for (var s = 1; s <= SEEDS; s++) {
    var S = CF.sim({ seed:s, mix:MIX, heroes:opts.heroes || [] });
    if (S.won) cl++;
    lv += S.lives;
    Object.keys(S.stats.reactions).forEach(function (k) { rx += S.stats.reactions[k]; });
  }

  CF.HERO_BLOCK_CAP = savedCap;
  CF.addHero = realAdd;
  CF.applyElement = realApply;
  CF.hurt = realHurt;
  CF.HERO_ORDER.forEach(function (k) { CF.HEROES[k].dmg = savedDmg[k]; });

  console.log(label.padEnd(30) + (cl + '/' + SEEDS).padStart(7) +
              (lv/SEEDS).toFixed(1).padStart(9) +
              Math.round(rx/SEEDS).toString().padStart(11));
  return { cleared:cl, lives:lv/SEEDS };
}

console.log('arm                             clears  avgLives  react/run');
console.log('-- what one hero is worth, channel by channel --');
arm('no heroes at all', { noHeroes:true });
arm('Ashlin, blocks nothing', { cap:0 });
arm('Ashlin, no damage', { noDamage:true });
arm('Ashlin, blocks 1', { cap:1 });
arm('Ashlin, blocks 2', { cap:2 });
arm('Ashlin, blocks 4', { cap:4 });
arm('Ashlin, blocks everything', { cap:999 });

console.log('\n-- how much the roster adds, at the capped rule --');
arm('Ashlin only', { cap:2 });
arm('Ashlin + Vess', { cap:2, heroes:['vess'] });
arm('Ashlin + Vess + Kestrel', { cap:2, heroes:['vess','kestrel'] });
