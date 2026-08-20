/* CONFLUENCE - data.js
   Design constants. This file is the design document.

   THE ONE RULE: an enemy carries ONE element aura. A second, different
   element triggers a REACTION and consumes both. Apply, then trigger.
*/
var CF = window.CF || {};
window.CF = CF;

/* Where this is. Naming the road and the gate costs nothing and stops the
   whole thing reading as a generic fantasy nowhere. */
CF.PLACE = {
  road:  'the Draymoor Road',
  gate:  'the Ninth Toll',
  arch:  'the Breach',
  you:   'wardwright'
};

CF.TILE = 40;
CF.COLS = 26;
CF.ROWS = 16;

/* -- elements ----------------------------------------------------- */
CF.EL = {
  ember: { key:'ember', name:'Ember', col:'#ff6a3c', dim:'#7a2c17' },
  tide:  { key:'tide',  name:'Tide',  col:'#4aa8d8', dim:'#17415a' },
  gale:  { key:'gale',  name:'Gale',  col:'#a8e6cf', dim:'#2f5b4c' },
  stone: { key:'stone', name:'Stone', col:'#d0a05a', dim:'#5a4022' }
};
CF.EL_ORDER = ['ember','tide','gale','stone'];

CF.AURA_TIME = 4.0;      // seconds an aura lingers before fading

/* After a reaction the element has spent itself and the target will not hold
   a new aura for a moment. Without this, sprinkling one of every tower along
   the whole road is strictly best and there is no decision left to make --
   this is what turns "fire many reactions" into "fire the RIGHT reaction". */
CF.REACT_COOLDOWN = 1.5;

/* -- reactions ------------------------------------------------------
   Six pairs, six distinct VERBS. Nothing here is a damage multiplier.
   dmg    : instant damage on the enemy the reaction happened to
   splash : radius in tiles the instant damage also reaches
*/
CF.rk = function (a, b) { return [a, b].sort().join('+'); };

CF.REACT = {};
CF.REACT[CF.rk('ember','tide')] = {
  key:'steam', name:'STEAM', col:'#cfe6ee', pair:['ember','tide'],
  blurb:'A scalding cloud that drives a whole clump back down the road.',
  dmg:12, splash:1.3,
  apply:{ slow:0.35, slowTime:2.5, push:0.7 }
};
CF.REACT[CF.rk('ember','gale')] = {
  key:'firestorm', name:'FIRESTORM', col:'#ffb03a', pair:['ember','gale'],
  blurb:'Fire leaps to nearby foes and burns them.',
  dmg:16, splash:0,
  chain:{ count:4, radius:2.6, burnDps:18, burnTime:3.0 }
};
CF.REACT[CF.rk('ember','stone')] = {
  key:'magma', name:'MAGMA', col:'#e8552a', pair:['ember','stone'],
  blurb:'The ground opens and burns whatever crosses it.',
  dmg:10, splash:0,
  zone:{ radius:1.5, time:5.0, dps:21, kind:'magma' }
};
CF.REACT[CF.rk('gale','tide')] = {
  key:'frost', name:'FROST', col:'#9fe8ff', pair:['tide','gale'],
  blurb:'A hard stop. The only answer to something too fast to kill.',
  dmg:12, splash:0.9,
  apply:{ freeze:1.7, slow:0.25, slowTime:3.0 }
};
CF.REACT[CF.rk('stone','tide')] = {
  key:'mire', name:'MIRE', col:'#8f7a4e', pair:['tide','stone'],
  blurb:'Mud that stays. Everything after it wades through.',
  dmg:8, splash:0,
  zone:{ radius:1.8, time:6.5, slow:0.55, kind:'mire' }
};
CF.REACT[CF.rk('gale','stone')] = {
  key:'grit', name:'GRIT', col:'#ded1a8', pair:['gale','stone'],
  blurb:'Scours armour away. Without it, plate turns everything.',
  dmg:40, splash:0.9,
  apply:{ shred:7.0 }
};

/* the order the codex draws them in */
CF.REACT_TABLE = [
  ['ember','tide'], ['ember','gale'], ['ember','stone'],
  ['tide','gale'],  ['tide','stone'], ['gale','stone']
];

/* -- towers ---------------------------------------------------------
   Every tower is an APPLIER first and a damage dealer second.
   range in tiles, rof in seconds between shots.
*/
CF.TOWERS = {
  emberhearth: {
    key:'emberhearth', el:'ember', name:'Emberhearth', cost:70,
    blurb:'Steady coals. Unremarkable alone, and half of three reactions.',
    tiers:[
      { dmg:9,  rof:0.55, range:3.2 },
      { dmg:16, rof:0.50, range:3.5, cost:90 },
      { dmg:27, rof:0.44, range:3.8, cost:170 }
    ]
  },
  tidespring: {
    key:'tidespring', el:'tide', name:'Tidespring', cost:85,
    blurb:'Heavy water. The splash wounds a whole clump, but only what it ' +
          'aims at is left carrying Tide.',
    tiers:[
      { dmg:14, rof:0.95, range:3.0, splash:0.9 },
      { dmg:24, rof:0.88, range:3.2, splash:1.1, cost:105 },
      { dmg:40, rof:0.80, range:3.4, splash:1.3, cost:200 }
    ]
  },
  galeharp: {
    key:'galeharp', el:'gale', name:'Galeharp', cost:75,
    blurb:'Fastest hands on the wall. Poor damage, and your best applier.',
    tiers:[
      { dmg:7,  rof:0.40, range:4.2 },
      { dmg:10, rof:0.34, range:4.5, cost:95 },
      { dmg:16, rof:0.28, range:4.9, cost:180 }
    ]
  },
  stoneward: {
    key:'stoneward', el:'stone', name:'Stoneward', cost:100,
    blurb:'Slow and enormous, and the ONLY tower that lays its element wide: ' +
          'the shockwave leaves everything near the impact carrying Stone.',
    tiers:[
      { dmg:34, rof:1.20, range:2.8, auraSplash:1.30 },
      { dmg:58, rof:1.14, range:3.0, auraSplash:1.42, cost:130 },
      { dmg:96, rof:1.05, range:3.2, auraSplash:1.60, cost:240 }
    ]
  }
};
CF.TOWER_ORDER = ['emberhearth','tidespring','galeharp','stoneward'];
CF.SELL_RATE = 0.65;

/* -- heroes ---------------------------------------------------------
   The mobile half of every combination. Towers apply on a fixed line;
   the hero is the element you can put anywhere, right now.
*/
CF.HEROES = {
  ashlin: {
    key:'ashlin', name:'Ashlin', title:'the Ember-sworn', el:'ember',
    cost:0, free:true,
    blurb:'Melee. Walks into the clump and sets it going.',
    hp:280, regen:6, speed:3.1, dmg:22, rof:0.7, range:1.0,
    ability:{ name:'Cinderfall', cd:14, radius:2.2, dmg:40,
              blurb:'Lays Ember on everything in a wide ring.' }
  },
  vess: {
    key:'vess', name:'Vess', title:'of the Tide', el:'tide',
    cost:300,
    blurb:'Ranged. Stays back and finishes what the wall started.',
    hp:190, regen:5, speed:3.3, dmg:16, rof:0.55, range:3.4,
    ability:{ name:'Undertow', cd:16, radius:2.6, dmg:30, slow:0.5, slowTime:3,
              blurb:'A surge that lays Tide over a wide area and drags it back.' }
  },
  kestrel: {
    key:'kestrel', name:'Kestrel', title:'the Duststep', el:'stone',
    cost:300,
    blurb:'Fast, and the only one who carries Stone on foot. Gets grit into ' +
          'the lane your Stonewards cannot reach.',
    hp:170, regen:7, speed:4.6, dmg:11, rof:0.34, range:1.2,
    ability:{ name:'Scour', cd:12, radius:1.9, dmg:26,
              blurb:'A whirl of grit, and half of three reactions.' }
  }
};
CF.HERO_ORDER = ['ashlin','vess','kestrel'];
/* You may field two. Measured: ANY two heroes saturate -- a third adds nothing
   at all, because the per-target reaction cooldown caps how often a foe can be
   reacted no matter how many appliers you own. A cap turns a dead third
   purchase into a real choice: which element are my towers short of? */
CF.HERO_SLOTS = 2;
CF.HERO_REFUND = 0.5;
CF.HERO_RESPAWN = 12;
/* how many foes one hero can physically hold up at once. 0 = walks through */
CF.HERO_BLOCK_CAP = 2;

/* -- enemies --------------------------------------------------------
   Each one exists to demand a VERB nothing else demands.
   armor : flat damage reduction, removed by GRIT
*/
CF.ENEMIES = {
  husk: {
    key:'husk', name:'Husk', hp:70, speed:1.65, armor:0, bounty:5, leak:1, dps:14,
    r:15, col:'#8c8477',
    note:"Whatever it used to be, it walked this road before. They still keep to the ruts.",
    demand:'None. This is what a plain wall is for.'
  },
  sprite: {
    key:'sprite', name:'Sprite', hp:26, speed:2.7, armor:0, bounty:2, leak:1, dps:7,
    r:10, col:'#b7d99b',
    note:"They travel the way weather does. Counting them is a poor use of the time you have.",
    demand:'FIRESTORM. They come in numbers; kill them in numbers.'
  },
  golem: {
    key:'golem', name:'Cairn Golem', hp:460, speed:1.05, armor:22, bounty:15, leak:2, dps:34,
    r:21, col:'#7d7360',
    note:"Field-stone, stacked and bound. The plate is scavenged — you can still see the rivet holes of whoever wore it first.",
    demand:'GRIT. Plate turns everything until Gale and Stone scour it off.'
  },
  acolyte: {
    key:'acolyte', name:'Warded Acolyte', hp:200, speed:1.5, armor:0, bounty:18, leak:2, dps:16,
    r:17, col:'#9a7fc4', wardImmune:true, wardBreak:52,
    note:"The ward is not armour. Steel goes through it and so does fire. Only the moment two elements meet will trouble it.",
    demand:'ANY reaction. Tower fire alone will never touch it.'
  },
  cinder: {
    key:'cinder', name:'Cinder Knight', hp:260, speed:1.45, armor:6, bounty:17, leak:2, dps:28,
    r:18, col:'#c4553a', burnsOff:'tide',
    note:"It runs hot enough to boil a Tide ward off itself before you can pair it. Water is not an answer here. Nearly anything else is.",
    demand:'Anything but Tide. It boils the water off before you can pair it.'
  },
  drowned: {
    key:'drowned', name:'Drowned Marcher', hp:210, speed:1.35, armor:4, bounty:14, leak:2, dps:22,
    r:18, col:'#4e7f92', selfAura:{ el:'tide', every:2.2 },
    note:"It comes up the road wet and stays wet. You are handed half a reaction and no say in which half.",
    demand:'Choose its partner. It arrives already carrying Tide.'
  },
  gorehoof: {
    key:'gorehoof', name:'Gorehoof', hp:130, speed:3.5, armor:0, bounty:13, leak:3, dps:38,
    r:19, col:'#c9673f',
    note:"Nothing on this wall kills it in the distance it gives you. Stop it, or write off the toll.",
    demand:'FROST. You will not out-damage it. Stop it.'
  },
  idol: {
    key:'idol', name:'The Sundered Idol', hp:5200, speed:0.85, armor:20, bounty:400, leak:20, dps:85,
    r:32, col:'#6f6486', boss:true,
    shatter:{ every:8.5, radius:3.4, immune:2.0 },
    note:"It was worshipped once and still remembers the shape of that. Every few breaths it sheds everything laid on it and stands untouchable while it does.",
    demand:'Everything at once. It sheds auras on a timer; keep re-laying them.'
  }
};

/* -- waves ----------------------------------------------------------
   g = groups: [enemyKey, count, spacing(s), delay(s) before the group starts]
*/
CF.WAVES = [
  { n:1,  bonus:48,  g:[['husk',6,0.9,0]] },
  { n:2,  bonus:48,  g:[['husk',10,0.7,0]] },
  { n:3,  bonus:56,  g:[['sprite',10,0.35,0],['husk',5,0.9,5]] },
  { n:4,  bonus:60,  g:[['husk',8,0.7,0],['acolyte',2,2.0,6]] },
  { n:5,  bonus:68,  g:[['golem',2,3.0,0],['husk',10,0.6,3]] },
  { n:6,  bonus:72,  g:[['sprite',16,0.28,0],['acolyte',3,2.0,7]] },
  { n:7,  bonus:76,  g:[['gorehoof',3,3.5,0],['husk',10,0.6,2]] },
  { n:8,  bonus:84, g:[['cinder',4,2.2,0],['sprite',12,0.3,5]] },
  { n:9,  bonus:88, g:[['golem',3,2.6,0],['acolyte',4,1.8,4]] },
  { n:10, bonus:96, g:[['drowned',5,1.8,0],['gorehoof',3,3.0,6]] },
  { n:11, bonus:104, g:[['cinder',5,1.8,0],['golem',3,3.0,4],['sprite',14,0.3,9]] },
  { n:12, bonus:112, g:[['acolyte',6,1.4,0],['drowned',5,1.6,5]] },
  { n:13, bonus:120, g:[['gorehoof',6,1.8,0],['cinder',5,1.6,3]] },
  { n:14, bonus:132, g:[['golem',6,2.0,0],['acolyte',8,1.2,4],['sprite',22,0.22,10]] },
  { n:15, bonus:144, g:[['drowned',10,1.1,0],['cinder',8,1.3,5],['gorehoof',7,1.5,10]] },
  { n:16, bonus:160, g:[['golem',8,1.7,0],['acolyte',10,1.1,3],['gorehoof',8,1.4,9]] },
  { n:17, bonus:184, g:[['cinder',10,1.1,0],['drowned',10,1.0,4],['sprite',30,0.2,9],['golem',6,2.0,13]] },
  { n:18, bonus:480, boss:true,
          g:[['idol',1,1,0],['husk',18,0.7,4],['acolyte',8,1.3,12],['golem',6,2.0,20],['gorehoof',6,1.6,34]] }
];

/* An element is laid by the shot that was AIMED; a splash only damages.
   With splash laying auras too, two area appliers blanket the road and pair
   with each other constantly -- MIRE alone was 44% of all reactions and three
   others were near-dead. Turning this off flattened the six to 12-21% each. */
CF.SPLASH_LAYS_AURA = false;

CF.GOLD_MUL = 1.0;   // global bounty scale, for tuning
CF.HP_MUL   = 1.0;   // global enemy hp scale, for tuning

/* difficulty presets drive the two tuning knobs above */
CF.DIFFICULTY = {
  measured:   { name:'Measured',    hp:0.82, gold:1.20, lives:25,
                blurb:'More gold, softer foes. For learning the six reactions.' },
  standard:   { name:'Standard',    hp:1.00, gold:1.00, lives:20,
                blurb:'The road as it was balanced.' },
  unforgiving:{ name:'Unforgiving', hp:1.28, gold:0.88, lives:12,
                blurb:'Every plot has to be the right element.' }
};

CF.START_GOLD = 190;
CF.START_LIVES = 20;
CF.WAVE_GAP = 8.0;   // quiet between waves; call it early for the bonus

/* the road. tile coordinates; enemies walk this polyline. */
CF.PATH = [
  [-1.5, 2], [6, 2], [6, 7], [2, 7], [2, 12], [10, 12],
  [10, 4], [15, 4], [15, 13], [20, 13], [20, 7], [25.5, 7]
];
CF.PATH_HALF = 0.95;   // tiles either side of the centreline that count as road
CF.PLOT_SPACING = 3.6; // tiles of road between one pair of buildable plots and the next
