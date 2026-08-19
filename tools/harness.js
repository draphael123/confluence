/* CONFLUENCE - headless harness.
   Loads the browser files in node so balance can be checked without a canvas.
   Usage:  node tools/harness.js            (full report)
           node tools/harness.js geom       (map geometry only)
*/
var path = require('path');
var root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'js', 'data.js'));
require(path.join(root, 'js', 'sim.js'));
var CF = global.window.CF;
module.exports = CF;

if (require.main !== module) return;

var mode = process.argv[2] || 'all';
var T = CF.TILE;

function geom() {
  var p = CF.path(), m = CF.map(), S = CF.newGame(1);
  var free = 0, near = 0;
  for (var r = 0; r < CF.ROWS; r++) for (var c = 0; c < CF.COLS; c++) {
    if (!CF.canBuild(S, c, r)) continue;
    free++;
    if (CF.roadDist((c+0.5)*T, (r+0.5)*T) <= 2.6*T) near++;
  }
  console.log('road length            ', Math.round(p.total/T), 'tiles');
  console.log('road tiles             ', Object.keys(m.road).length);
  console.log('scenery blocks         ', Object.keys(m.blocked).length);
  console.log('buildable plots        ', free);
  console.log('plots in reach of road ', near);
  var slowest = CF.ENEMIES.golem.speed, fastest = CF.ENEMIES.gorehoof.speed;
  console.log('crossing time          ', (p.total/T/fastest).toFixed(1) + 's fastest, ' +
                                          (p.total/T/slowest).toFixed(1) + 's slowest');
}

/* Does each enemy's demanded verb actually answer it?
   Directed unit tests, not a bot -- a greedy bot cannot read positional play. */
function verbs() {
  var out = [];
  function fresh(key) {
    var S = CF.newGame(7);
    var e = CF.spawnEnemy(S, key);
    return { S:S, e:e };
  }
  function pump(S, n) { for (var i = 0; i < n; i++) CF.step(S, 1/30); }

  // 1. a Warded Acolyte must be immune to direct fire and open to reactions
  var a = fresh('acolyte');
  CF.hurt(a.S, a.e, 500);
  out.push(['acolyte ignores 500 direct damage', a.e.hp === a.e.maxHp]);
  CF.applyElement(a.S, a.e, 'gale');
  CF.applyElement(a.S, a.e, 'stone');            // GRIT
  out.push(['acolyte takes reaction damage', a.e.hp < a.e.maxHp]);

  // 2. a Cairn Golem's armour must actually blunt fire, and GRIT must fix it
  var g1 = fresh('golem');
  var beforeArm = CF.hurt(g1.S, g1.e, 20);
  var g2 = fresh('golem');
  CF.applyElement(g2.S, g2.e, 'gale');
  CF.applyElement(g2.S, g2.e, 'stone');
  var afterArm = CF.hurt(g2.S, g2.e, 20);
  var expect = Math.max(1, 20 - CF.ENEMIES.golem.armor);
  out.push(['golem armour blunts a 20 hit to ' + beforeArm + ' (armor ' + CF.ENEMIES.golem.armor + ')', beforeArm === expect]);
  out.push(['GRIT restores it to ' + afterArm, afterArm === 20]);

  // 3. a Cinder Knight must refuse a Tide aura
  var c = fresh('cinder');
  CF.applyElement(c.S, c.e, 'tide');
  out.push(['cinder knight sheds Tide', c.e.aura === null]);
  CF.applyElement(c.S, c.e, 'gale');
  out.push(['cinder knight accepts Gale', c.e.aura === 'gale']);

  // 4. a Drowned Marcher must arrive already carrying Tide
  var d = fresh('drowned');
  pump(d.S, 4);
  out.push(['drowned marcher self-applies Tide', d.e.aura === 'tide']);

  // 5. FROST must genuinely stop a Gorehoof
  var h = fresh('gorehoof');
  pump(h.S, 30);
  var moved = h.e.d;
  CF.applyElement(h.S, h.e, 'tide');
  CF.applyElement(h.S, h.e, 'gale');             // FROST
  var atFreeze = h.e.d;
  pump(h.S, 30);
  out.push(['frost holds a gorehoof still for a second', Math.abs(h.e.d - atFreeze) < 1 && moved > 0]);

  // 6. FIRESTORM must reach a pack, not just one sprite
  var S6 = CF.newGame(9), pack = [];
  for (var i = 0; i < 6; i++) { var s = CF.spawnEnemy(S6, 'sprite'); s.d = i*14; var pp = CF.posAt(s.d); s.x = pp.x; s.y = pp.y; pack.push(s); }
  CF.applyElement(S6, pack[2], 'ember');
  CF.applyElement(S6, pack[2], 'gale');
  var burning = pack.filter(function (s) { return s.burns.length > 0; }).length;
  out.push(['firestorm sets ' + burning + ' of 6 sprites alight', burning >= 4]);

  // 7. same element twice must NOT react
  var S7 = CF.newGame(3), e7 = CF.spawnEnemy(S7, 'husk');
  CF.applyElement(S7, e7, 'ember');
  var r7 = CF.applyElement(S7, e7, 'ember');
  out.push(['doubling an element does not react', r7 === null && e7.aura === 'ember']);

  // 8. the Idol must strip auras off its escort
  var S8 = CF.newGame(4), idol = CF.spawnEnemy(S8, 'idol');
  var esc = CF.spawnEnemy(S8, 'husk'); esc.x = idol.x; esc.y = idol.y;
  CF.applyElement(S8, esc, 'ember');
  idol.shatterT = 0.01;
  pump(S8, 2);
  out.push(['the idol shatters auras around it', esc.aura === null && idol.immuneT > 0]);

  var pass = 0;
  out.forEach(function (o) { if (o[1]) pass++; console.log((o[1] ? '  ok   ' : '  FAIL ') + o[0]); });
  console.log('  ' + pass + '/' + out.length + ' verb checks pass');
  return pass === out.length;
}

/* Gross-breakage sweep. A scripted policy always understates positional
   play, so read these as "is it obviously broken", never as "is it fun". */
function sweep() {
  var mixes = {
    'all four'      : ['galeharp','stoneward','emberhearth','tidespring'],
    'gale+stone'    : ['galeharp','stoneward'],
    'ember+tide'    : ['emberhearth','tidespring'],
    'ember only'    : ['emberhearth'],
    'stone only'    : ['stoneward'],
    'gale only'     : ['galeharp']
  };
  console.log('mix              runs  cleared  avg wave  avg lives  react/run');
  Object.keys(mixes).forEach(function (name) {
    var runs = 21, cleared = 0, waveSum = 0, lifeSum = 0, reactSum = 0;
    for (var s = 1; s <= runs; s++) {
      var S = CF.sim({ seed:s, mix:mixes[name] });
      if (S.won) cleared++;
      waveSum += S.wave; lifeSum += S.lives;
      Object.keys(S.stats.reactions).forEach(function (k) { reactSum += S.stats.reactions[k]; });
    }
    console.log(
      name.padEnd(16) + String(runs).padStart(4) +
      String(cleared).padStart(9) +
      (waveSum/runs).toFixed(1).padStart(10) +
      (lifeSum/runs).toFixed(1).padStart(11) +
      Math.round(reactSum/runs).toString().padStart(11));
  });
}

function reactionSpread() {
  var S = CF.sim({ seed:5, mix:['galeharp','stoneward','emberhearth','tidespring'] });
  console.log('reactions fired in one full run (all four towers):');
  Object.keys(S.stats.reactions).forEach(function (k) {
    console.log('  ' + k.padEnd(11) + S.stats.reactions[k]);
  });
  console.log('  direct damage ' + Math.round(S.stats.dmgDirect) +
              ' | reaction damage ' + Math.round(S.stats.dmgReact) +
              ' (' + Math.round(100*S.stats.dmgReact/(S.stats.dmgDirect+S.stats.dmgReact)) + '% of all damage)');
}

if (mode === 'geom') geom();
else if (mode === 'verbs') verbs();
else if (mode === 'sweep') sweep();
else {
  console.log('== geometry =='); geom();
  console.log('\n== verb checks =='); verbs();
  console.log('\n== balance sweep =='); sweep();
  console.log('\n== reaction spread =='); reactionSpread();
}
