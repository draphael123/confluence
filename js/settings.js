/* CONFLUENCE - settings.js
   Persisted options. The colour-blind aid matters more here than in most
   games: the entire rule-set is communicated by hue, so hue alone is not
   an acceptable single channel. Turning it on adds a SHAPE per element.
*/
(function (CF) {
'use strict';

var KEY = 'confluence.settings.v1';

CF.SETTINGS_DEF = [
  { key:'difficulty', label:'Difficulty', type:'choice',
    options:['measured','standard','unforgiving'], def:'standard',
    note:'Sets enemy vigour, gold and how many may reach the gate.' },
  { key:'speed', label:'Default speed', type:'choice',
    options:['1','2','3'], def:'1',
    note:'The speed each wave starts at.' },
  { key:'glyphs', label:'Element shapes', type:'toggle', def:false,
    note:'Marks every aura with a shape as well as a colour. Recommended if reds and greens are hard to tell apart.' },
  { key:'volume', label:'Sound', type:'choice',
    options:['off','low','normal','high'], def:'normal',
    note:'Each reaction has its own voice, so you can hear which one fired without looking at it.' },
  { key:'dmgnums', label:'Damage numbers', type:'toggle', def:false,
    note:'Prints what each hit actually took off. Useful for seeing how little plate lets through.' },
  { key:'names', label:'Reaction names', type:'toggle', def:true,
    note:'Prints STEAM, FROST and the rest above the foe it happened to.' },
  { key:'flash', label:'Effect brightness', type:'choice',
    options:['full','soft','minimal'], def:'full',
    note:'Dials back the bloom on reactions and impacts.' },
  { key:'autowave', label:'Waves arrive on their own', type:'toggle', def:true,
    note:'Off means nothing comes until you call it.' }
];

CF.settings = {};

CF.loadSettings = function () {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
  CF.SETTINGS_DEF.forEach(function (d) {
    CF.settings[d.key] = (d.key in saved) ? saved[d.key] : d.def;
  });
  return CF.settings;
};

CF.saveSettings = function () {
  try { localStorage.setItem(KEY, JSON.stringify(CF.settings)); } catch (e) {}
};

CF.resetSettings = function () {
  CF.SETTINGS_DEF.forEach(function (d) { CF.settings[d.key] = d.def; });
  CF.saveSettings();
};

/* difficulty is not a damage multiplier bolted on at the end -- it drives the
   same two knobs the balance harness sweeps, so a preset is a real point on
   the curve that was measured, not a guess. */
CF.applyDifficulty = function () {
  var d = CF.DIFFICULTY[CF.settings.difficulty] || CF.DIFFICULTY.standard;
  CF.HP_MUL = d.hp;
  CF.GOLD_MUL = d.gold;
  CF.START_LIVES = d.lives;
  return d;
};

CF.flashScale = function () {
  return CF.settings.flash === 'minimal' ? 0.3
       : CF.settings.flash === 'soft' ? 0.62 : 1;
};

/* one shape per element, drawn on the aura ring when the aid is on */
CF.drawGlyph = function (g, el, x, y, r, col) {
  g.save();
  g.translate(x, y);
  g.fillStyle = col;
  g.strokeStyle = 'rgba(10,8,7,0.85)';
  g.lineWidth = 1.6;
  g.beginPath();
  if (el === 'ember') {                       // upward triangle
    g.moveTo(0, -r); g.lineTo(r*0.92, r*0.72); g.lineTo(-r*0.92, r*0.72);
  } else if (el === 'tide') {                 // downward triangle
    g.moveTo(0, r); g.lineTo(r*0.92, -r*0.72); g.lineTo(-r*0.92, -r*0.72);
  } else if (el === 'gale') {                 // circle
    g.arc(0, 0, r*0.86, 0, 6.283);
  } else {                                    // stone: square on point
    g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
};

})(window.CF);
