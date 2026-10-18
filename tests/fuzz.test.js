'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.dirname(__dirname);
const context = { window: {}, console, Math, Date, JSON, parseInt, parseFloat, isFinite, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8'), context, { filename: 'engine.js' });
const E = context.window.DFEngine;
const D = context.window.DFData;

let seed = 987654321;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

let testedCards = 0;

const PLAYABLE = D.CARD_IDS.filter(function (id) {
  const def = D.CARDS[id];
  if (def.type === 'status' || def.type === 'curse') return id === 'slimed';
  return true;
});

PLAYABLE.forEach(function (id) {
  const run = E.newRun(1000 + testedCards);
  const combat = E.startCombat(run, ['cultist', 'jawworm'], 'normal', 'fuzz');
  combat.enemies.forEach(function (e) { e.hp = 300; e.maxHp = 300; });
  combat.energy = id === 'whirlwind' ? 4 : 12;
  combat.maxEnergy = 12;
  combat.hand = [];
  const inst = { uid: 'fz' + testedCards, cid: 'fz' + testedCards, id: id, upgraded: testedCards % 2 === 0, rampage: 0 };
  combat.hand.push(inst);
  const target = combat.enemies[0];
  let res;
  try {
    res = E.playCard(run, combat, inst.cid, target.uid);
  } catch (err) {
    throw new Error('Karte ' + id + ' wirft: ' + err.stack);
  }
  assert(res.ok, 'Karte ' + id + ' nicht spielbar: ' + res.reason);
  let guard = 0;
  while (combat.pending && guard++ < 5) {
    const p = combat.pending;
    const zone = p.kind === 'headbutt' ? combat.discardPile : combat.hand;
    if (!zone.length) { combat.pending = null; break; }
    E.resolvePending(run, combat, [zone[0].cid]);
  }
  if (combat.phase === 'player') {
    try { E.endTurn(run, combat); } catch (err) { throw new Error('Zugende nach ' + id + ' wirft: ' + err.stack); }
  }
  testedCards++;
});
console.log('ok   ' + testedCards + ' Karten einzeln gespielt und Zug beendet');

function resolvePending(combat) {
  const p = combat.pending;
  if (!p) return;
  const zone = p.kind === 'headbutt' ? combat.discardPile : combat.hand;
  if (!zone.length) { combat.pending = null; return; }
  E.resolvePending(combat.__run, combat, [zone[0].cid]);
}

function autoCombat(run, node) {
  const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
  const enemies = E.rollEncounter(run, kind, node.row + 1);
  const combat = E.startCombat(run, enemies, kind, node.id);
  combat.__run = run;
  let guard = 0;
  while (combat.phase === 'player' && guard++ < 160) {
    if (combat.pending) { resolvePending(combat); continue; }
    const playable = [];
    for (let i = 0; i < combat.hand.length; i++) {
      if (E.canPlay(run, combat, combat.hand[i]).ok) playable.push(combat.hand[i]);
    }
    if (playable.length && rand() < 0.82) {
      const card = pick(playable);
      const target = combat.enemies.filter(e => !e.dead)[0];
      const res = E.playCard(run, combat, card.cid, target ? target.uid : null);
      if (!res.ok) { E.endTurn(run, combat); }
      continue;
    }
    // Trank gelegentlich benutzen
    if (rand() < 0.04) {
      const filled = run.potions.map((p, i) => p ? i : -1).filter(i => i >= 0);
      if (filled.length) E.usePotion(run, combat, pick(filled));
    }
    E.endTurn(run, combat);
  }
  assert(guard < 160, 'Kampf-Endlosschleife in ' + node.id);
  if (combat.phase === 'won') {
    const reward = E.buildReward(run, combat);
    if (rand() < 0.8) E.takeRewardCard(run, reward, pick(reward.cards));
    if (reward.potion) E.takeRewardPotion(run, reward);
    E.finishReward(run, reward);
  } else {
    assert(combat.phase === 'lost', 'Kampf endet weder gewonnen noch verloren');
  }
  return combat.phase;
}

let runs = 0;
let wins = 0;
for (let r = 0; r < 16; r++) {
  const run = E.newRun(500 + r);
  let steps = 0;
  while (steps++ < 24 && !run.won && run.hp > 0) {
    const avail = E.availableNodes(run);
    if (!avail.length) break;
    const node = pick(avail);
    E.enterNode(run, node.id);
    if (node.type === 'monster' || node.type === 'elite' || node.type === 'boss') {
      const result = autoCombat(run, node);
      if (result === 'lost') break;
      if (node.type === 'boss') break;
    } else if (node.type === 'shop') {
      const shop = E.makeShop(run, node.id);
      if (rand() < 0.5) {
        for (let i = 0; i < shop.cards.length; i++) {
          if (run.gold >= shop.cards[i].price && rand() < 0.4) E.buyShopCard(run, shop, i);
        }
      }
      if (rand() < 0.3 && run.gold >= shop.removeCost && run.deck.length > 5) {
        E.shopRemoveCard(run, shop, pick(run.deck).uid);
      }
      E.completeNode(run, node.id);
    } else if (node.type === 'rest') {
      if (rand() < 0.5) E.restHeal(run);
      else {
        const up = run.deck.filter(c => !c.upgraded && D.CARDS[c.id].up);
        if (up.length) E.smithCard(run, pick(up).uid);
      }
      E.completeNode(run, node.id);
    } else if (node.type === 'event') {
      const ev = pick(D.EVENTS);
      const options = ev.options.map((o, i) => ({ o, i })).filter(x => !x.o.needGold || run.gold >= x.o.needGold);
      if (options.length) E.resolveEvent(run, ev.id, pick(options).i);
      E.completeNode(run, node.id);
    }
    assert(combatInvariants(run), 'Run-Invariante verletzt in Runde ' + r);
  }
  runs++;
  if (run.won) wins++;
}
console.log('ok   ' + runs + ' automatische Runs ohne Engine-Fehler (' + wins + ' Siege)');

function combatInvariants(run) {
  if (run.hp < 0 || run.hp > run.maxHp) return false;
  if (run.gold < 0) return false;
  if (!run.deck.length) return false;
  if (run.deck.length > 200) return false;
  if (run.relics.length !== new Set(run.relics).size) return false;
  return true;
}

// Serialisierung nach jedem automatischen Run
const run = E.newRun(999);
const combat = E.startCombat(run, ['louse', 'louse'], 'normal', 'serialize');
combat.__run = null;
assert.doesNotThrow(() => JSON.stringify({ run, combat }));
console.log('ok   Run- und Kampfzustand bleiben JSON-serialisierbar');
console.log('\nFuzz-Tests erfolgreich.');
