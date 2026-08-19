# CONFLUENCE

A fantasy tower defence built on one rule.

> **A foe carries one element at a time. Lay a *different* element on top of it
> and the two react, spending both.**

Apply, then trigger. That single rule is what makes tower *order along the road*
the central puzzle instead of tower stats, and it makes stacking four fire
towers useless without anyone having to write a rule that says so.

Play it: **https://confluence-sooty.vercel.app**

---

## Why the elements are not a damage-type chart

"Golem takes +50% from fire" is a lookup table. A player consults it once and
the game is solved forever. Nothing here is a damage multiplier:

**Four elements, six reactions, six distinct verbs.**

| | Ember | Tide | Gale | Stone |
|---|---|---|---|---|
| **Ember** | — | **Steam** — scalds a clump and drives it back down the road | **Firestorm** — leaps to nearby foes and burns them | **Magma** — opens burning ground |
| **Tide** | | — | **Frost** — a hard stop | **Mire** — mud that stays |
| **Gale** | | | — | **Grit** — scours armour off |

**Weakness and strength are rules, not percentages.** A Cinder Knight does not
"resist water" — it *boils a Tide aura off itself* before you can pair it, so
you plan around it. A Drowned Marcher arrives already carrying Tide, so it hands
you half a reaction and takes the choice of which half away.

**A Warded Acolyte is immune to all direct tower fire.** Only the instant a
reaction triggers touches it, and it sheds a fixed amount whichever reaction it
was — which is what makes "any reaction" a true promise rather than a table of
best answers.

## The other two rules that make it a game

**Plots.** You may only build on marked foundations, and there are far fewer of
them than you can afford. The question stops being "can I buy another tower" and
becomes "which element goes *here*".

**An element is laid by the shot that was *aimed*.** A damage splash wounds a
clump but leaves only its target carrying the element — otherwise two area
towers blanket the road and pair with each other constantly (Mire alone reached
44% of all reactions). Stoneward is the deliberate exception: its shockwave lays
Stone wide, and that is its whole identity.

**Reaction cooldown.** After a reaction, a target will not hold a new aura for
1.5s. Without this, sprinkling one of every tower along the whole road is
strictly best and there is no decision left. With it, firing the *right*
reaction beats firing many.

## Heroes

Towers apply on a fixed line. A hero is the element you can put **anywhere,
right now** — so you park towers to lay auras and steer a hero in to detonate
the pairing you want. Ashlin carries Ember, Vess carries Tide, Kestrel carries
Stone.

**You may field two.** Measured: *any* two heroes saturate — a third adds
literally nothing (19.5 → 19.9 lives, 453 → 452 reactions), because the
per-target reaction cooldown caps how often a foe can be reacted no matter how
many appliers you own. So the cap is not a nerf, it is what turns a dead third
purchase into a real question: **which element are my towers short of?** You can
dismiss a hero for half their fee and swap.

Kestrel used to carry Gale and was measurably worthless — Gale is the element
the towers already saturate (19,136 applications a run against Tide's 9,834), so
a third Gale source had nothing to react with. Moving her to Stone, the one
element no hero carried, took her from +0.0 lives to +4.2.

Also worth recording: a hero's power is **not** its ability to block. Capping
blocking from "every foe in contact range" to two changed the outcome by 0.2
lives. Almost all of a hero's value is the element it lays — which is the role
the design wanted them for.

---

## Is it balanced?

There is a headless harness — the whole rule-set runs in node with no canvas:

```bash
node tools/harness.js
```

`verbs` runs eleven directed checks that each enemy's demanded verb actually
answers it (armour really blunts fire, Grit really restores it, Frost really
holds a Gorehoof still, the Idol really strips auras off its escort). `sweep`
runs 21 seeded games per tower mix.

Measured on the shipped numbers:

| build | clears | dies around |
|---|---|---|
| all four elements | 18/21, avg 15.8 of 20 lives | — |
| gale + stone | 17/21, avg 9.9 lives | wave 16 |
| ember + tide | 0/21 | wave 16 |
| **any single element** | **0/21** | **wave 8–9** |

Single-element is a hard fail; four elements wins under real pressure. Reactions
account for ~60% of all damage dealt, so the combination system carries the game
without eclipsing tower fire.

All six reactions get played, 10–21% each:

| Grit | Mire | Firestorm | Frost | Magma | Steam |
|---|---|---|---|---|---|
| 21% | 20% | 20% | 15% | 13% | 10% |

They did not start that way. Magma, Mire and Grit were 5–8% — all three
contain Stone, and Stoneward had both the shortest range and the slowest fire
rate, giving it a **10× aura-application deficit**. The reactions were not weak;
Stone simply never got laid. `tools/diagnose-reactions.js` found it and
`tools/tune-aurasplash.js` searched the fix.

Two caveats worth stating plainly. The sweep's policy assigns elements to plots
**at random**, so it understates deliberate play — a human who actually pairs
elements should clear more reliably than 18/21. And a scripted policy cannot
judge feel at all: **the numbers are validated, the feel is not.** That needs a
human playtest.

## What the harness could *not* answer

Hero pricing. Taking 150 gold out of a wall's early income costs it **9 lives** —
early gold compounds that steeply — so *when* you buy a hero dominates *what it
costs*, and every scripted purchase policy either buys on the last wave (useless)
or reserves from wave 1 and starves the opening (catastrophic). That is a player
judgment call, so the 300g price is provisional and wants a playtest, not another
bot.

## Difficulty

The three presets are not a multiplier bolted on at the end — they move the same
two knobs (`CF.HP_MUL`, `CF.GOLD_MUL`) that the harness sweeps, so each preset
is a measured point on the curve.

## Accessibility

The entire rule-set is communicated by hue, which is not an acceptable single
channel. **Settings → Element shapes** marks every aura with a shape as well as
a colour (Ember ▲, Tide ▼, Gale ●, Stone ◆). Effect brightness dials back the
bloom on reactions.

## Running it

```bash
python serve.py 5813
```

Then open http://localhost:5813. The dev server sends `no-store` on purpose: a
cached module paired with a fresh config produces edits that appear to do
nothing.

## Layout

| file | what it holds |
|---|---|
| `js/data.js` | every constant. The design document. |
| `js/sim.js` | the rule-set, with no DOM in it, so node can run it |
| `js/settings.js` | persisted options, difficulty, the colour-blind glyphs |
| `js/art.js` | sprites, baked once at boot |
| `js/render.js` | drawing, plus the per-enemy gait |
| `js/game.js` | screens, input, the loop |
| `tools/harness.js` | verb checks and the seeded balance sweep |
| `tools/diagnose-reactions.js` | why a reaction is or is not getting played |
| `tools/diagnose-heroes.js` | isolates a hero's blocking, damage and element channels |
| `tools/tune-aurasplash.js` | searches for the flattest reaction spread |

## Controls

`1`–`4` pick a tower, then click a foundation · click a tower to upgrade or sell
· click a hero then the board to send them · `Q` `W` `E` hero abilities · `Space`
calls the next wave early for gold · `Shift`+click keeps placing · `P` pause ·
`C` codex
