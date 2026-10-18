'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.dirname(__dirname);
const context = {
  window: {},
  console,
  Math,
  Date,
  JSON,
  parseInt,
  parseFloat,
  isFinite,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8'), context, { filename: 'engine.js' });
const E = context.window.DFEngine;
const D = context.window.DFData;

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.log('FAIL ' + name + '\n     ' + err.message);
  }
}

function inject(combat, id, upgraded) {
  var card = { uid: 'test-' + Math.random().toString(36).slice(2), cid: 'test-' + Math.random().toString(36).slice(2), id: id, upgraded: !!upgraded, rampage: 0 };
  combat.hand.push(card);
  return card;
}

function forceCard(combat, id) {
  var zones = [combat.hand, combat.drawPile, combat.discardPile, combat.exhaustPile];
  for (var z = 0; z < zones.length; z++) {
    for (var i = 0; i < zones[z].length; i++) {
      if (zones[z][i].id === id) {
        var card = zones[z].splice(i, 1)[0];
        combat.hand.push(card);
        return card;
      }
    }
  }
  return null;
}

test('Kartenpool enthaelt mindestens 40 Karten und alle Typen', function () {
  assert(D.CARD_IDS.length >= 40, 'zu wenige Karten: ' + D.CARD_IDS.length);
  var types = {};
  D.CARD_IDS.forEach(function (id) { types[D.CARDS[id].type] = true; });
  ['attack', 'skill', 'power', 'status', 'curse'].forEach(function (t) { assert(types[t], 'Typ fehlt: ' + t); });
  var upgrades = D.CARD_IDS.filter(function (id) { return D.CARDS[id].up && Object.keys(D.CARDS[id].up).length; });
  assert(upgrades.length >= 35, 'zu wenige aufwertbare Karten');
  assert(D.CARDS.strike.up.dmg === 9, 'Schlag+ muss 9 Schaden machen');
  assert(D.RELICS.burning_blood, 'Startrelikt fehlt');
  assert(D.POTION_IDS.length >= 6, 'zu wenige Traenke');
  assert(D.EVENTS.length >= 6, 'zu wenige Events');
});

test('Neuer Lauf: Startdeck, Relikt und prozedurale Map', function () {
  var run = E.newRun(12345);
  assert.strictEqual(run.deck.length, 10);
  assert.strictEqual(run.deck.filter(function (c) { return c.id === 'strike'; }).length, 5);
  assert.strictEqual(run.deck.filter(function (c) { return c.id === 'defend'; }).length, 4);
  assert.strictEqual(run.deck.filter(function (c) { return c.id === 'bash'; }).length, 1);
  assert.strictEqual(run.relics.length, 1);
  assert.strictEqual(run.relics[0], 'burning_blood');
  assert.strictEqual(run.map.rows.length, 15);
  assert.strictEqual(run.map.rows[14].length, 1);
  assert.strictEqual(run.map.rows[14][0].type, 'boss');
  var types = {};
  Object.keys(run.map.nodes).forEach(function (id) { types[run.map.nodes[id].type] = (types[run.map.nodes[id].type] || 0) + 1; });
  ['monster', 'elite', 'event', 'shop', 'rest', 'boss'].forEach(function (t) {
    assert(types[t] > 0, 'Map-Typ fehlt: ' + t);
  });
  assert(types.elite >= 2, 'mindestens zwei Eliten erwartet');
  assert(types.shop >= 2, 'mindestens zwei Shops erwartet');
  assert.strictEqual(run.map.rows[13].length, run.map.rows[13].filter(function (n) { return n.type === 'rest'; }).length);
  var available = E.availableNodes(run);
  assert(available.length > 0, 'keine Startknoten');
  assert(available.every(function (n) { return n.row === 0; }));
});

test('Map-Pfad ist vom Start bis zum Boss verbunden', function () {
  var run = E.newRun(424242);
  var seen = 0;
  var current = null;
  for (var step = 0; step < 15; step++) {
    var avail = E.availableNodes(run);
    assert(avail.length > 0, 'kein erreichbarer Knoten in Schritt ' + step);
    var node = avail[0];
    assert(node.row === step, 'falsche Etage');
    E.enterNode(run, node.id);
    seen++;
    if (node.type === 'boss') break;
  }
  assert.strictEqual(seen, 15, 'Boss nicht erreicht');
});

test('Kampfstart: Hand, Energie, Ziehstapel und Intention', function () {
  var run = E.newRun(1);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  assert.strictEqual(combat.hand.length, 5);
  assert.strictEqual(combat.drawPile.length, 5);
  assert.strictEqual(combat.energy, 3);
  assert.strictEqual(combat.maxEnergy, 3);
  assert.strictEqual(combat.phase, 'player');
  assert.strictEqual(combat.enemies.length, 1);
  assert.strictEqual(combat.enemies[0].intent, 'incantation');
  var info = E.intentInfo(combat, combat.enemies[0]);
  assert.strictEqual(info.name, 'Beschwoerung');
  assert(info.icons.indexOf('buff') !== -1);
});

test('Schlag kostet Energie, verursacht Schaden und landet auf der Ablage', function () {
  var run = E.newRun(2);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var strike = forceCard(combat, 'strike');
  assert(strike, 'kein Schlag gefunden');
  var enemy = combat.enemies[0];
  var hp = enemy.hp;
  var res = E.playCard(run, combat, strike.cid, enemy.uid);
  assert(res.ok, res.reason);
  assert.strictEqual(combat.energy, 2);
  assert.strictEqual(enemy.hp, hp - 6);
  assert(combat.discardPile.indexOf(strike) !== -1);
  assert.strictEqual(combat.hand.indexOf(strike), -1);
});

test('Verwundbar erhoeht Schaden um 50 Prozent', function () {
  var run = E.newRun(3);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var enemy = combat.enemies[0];
  enemy.statuses.vulnerable = 1;
  var strike = forceCard(combat, 'strike');
  var hp = enemy.hp;
  E.playCard(run, combat, strike.cid, enemy.uid);
  assert.strictEqual(enemy.hp, hp - 9);
});

test('Schwach reduziert ausgeteilten Schaden um 25 Prozent', function () {
  var run = E.newRun(4);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  combat.player.statuses.weak = 1;
  var strike = forceCard(combat, 'strike');
  var enemy = combat.enemies[0];
  var hp = enemy.hp;
  E.playCard(run, combat, strike.cid, enemy.uid);
  assert.strictEqual(enemy.hp, hp - 4);
});

test('Ruestung blockt Gegnerangriffe und verfaellt im naechsten Spielerzug', function () {
  var run = E.newRun(5);
  var combat = E.startCombat(run, ['jawworm'], 'normal', 'test');
  var enemy = combat.enemies[0];
  var defend = forceCard(combat, 'defend');
  E.playCard(run, combat, defend.cid, null);
  assert.strictEqual(combat.player.block, 5);
  enemy.intent = 'chomp';
  var hp = combat.player.hp;
  E.endTurn(run, combat);
  assert.strictEqual(combat.player.hp, hp - 6);
  assert.strictEqual(combat.player.block, 0);
});

test('Karten-Upgrade veraendert Werte und Namen', function () {
  var run = E.newRun(6);
  var strike = run.deck.find(function (c) { return c.id === 'strike'; });
  assert.strictEqual(E.cardDesc(strike), 'Verursacht 6 Schaden.');
  assert(E.upgradeCard(run, strike.uid));
  assert.strictEqual(E.cardVals(strike).dmg, 9);
  assert.strictEqual(E.cardName(strike), 'Schlag+');
  assert.strictEqual(E.cardDesc(strike), 'Verursacht 9 Schaden.');
  assert(!E.upgradeCard(run, strike.uid), 'darf nicht doppelt aufgewertet werden');
});

test('Brutalitaet+ ist angeboren und startet in der Hand', function () {
  var run = E.newRun(611);
  var card = E.addCard(run, 'brutality', false);
  assert(E.upgradeCard(run, card.uid));
  var vals = E.cardVals(card);
  assert.strictEqual(vals.innate, true);
  assert(/Angeboren/.test(E.cardDesc(card)));
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  assert(combat.hand.some(function (c) { return c.id === 'brutality' && c.upgraded; }), 'Brutalitaet+ nicht in der Starthand');
  assert.strictEqual(combat.hand.length, 6);
});

test('Bash verleiht Verwundbar, Heavy Blade skaliert mit Staerke', function () {
  var run = E.newRun(7);
  var combat = E.startCombat(run, ['jawworm'], 'normal', 'test');
  var enemy = combat.enemies[0];
  var bash = forceCard(combat, 'bash');
  E.playCard(run, combat, bash.cid, enemy.uid);
  assert.strictEqual(enemy.statuses.vulnerable, 2);
  combat.player.statuses.strength = 2;
  combat.energy = 10;
  var heavy = inject(combat, 'heavy_blade');
  var hp = enemy.hp;
  E.playCard(run, combat, heavy.cid, enemy.uid);
  // 14 + 3*2 = 20, danach Verwundbar: 30
  assert.strictEqual(enemy.hp, hp - 30);
});

test('Mehrfachtreffer und Angriffe an alle Gegner', function () {
  var run = E.newRun(8);
  var combat = E.startCombat(run, ['louse', 'louse'], 'normal', 'test');
  combat.enemies[0].hp = combat.enemies[0].maxHp = 50;
  combat.enemies[1].hp = combat.enemies[1].maxHp = 50;
  var twin = inject(combat, 'twin_strike');
  var target = combat.enemies[0];
  var hp0 = target.hp;
  E.playCard(run, combat, twin.cid, target.uid);
  assert.strictEqual(target.hp, hp0 - 10);
  var cleave = inject(combat, 'cleave');
  var hpA = combat.enemies[0].hp;
  var hpB = combat.enemies[1].hp;
  E.playCard(run, combat, cleave.cid, null);
  assert.strictEqual(combat.enemies[0].hp, hpA - 8);
  assert.strictEqual(combat.enemies[1].hp, hpB - 8);
});

test('Energie, Ziehen und Erschoepfen funktionieren', function () {
  var run = E.newRun(9);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var offering = inject(combat, 'offering');
  var hp = combat.player.hp;
  var res = E.playCard(run, combat, offering.cid, null);
  assert(res.ok, res.reason);
  assert.strictEqual(combat.player.hp, hp - 6);
  assert.strictEqual(combat.energy, 5);
  assert(combat.exhaustPile.indexOf(offering) !== -1);
});

test('Kraftkarten aktivieren passende Status-Effekte', function () {
  var run = E.newRun(10);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var inflame = inject(combat, 'inflame');
  E.playCard(run, combat, inflame.cid, null);
  assert.strictEqual(combat.player.statuses.strength, 2);
  var metallicize = inject(combat, 'metallicize');
  E.playCard(run, combat, metallicize.cid, null);
  assert.strictEqual(combat.player.powers.metallicize, 3);
  E.endTurn(run, combat);
  // Ruestung wird vor dem Gegnerzug aufgebaut, danach im neuen Zug entfernt
  assert.strictEqual(combat.player.block, 0);
});

test('Barrikade behaelt Ruestung ueber den Zugwechsel', function () {
  var run = E.newRun(11);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  combat.player.powers.barricade = 1;
  var defend = inject(combat, 'defend');
  E.playCard(run, combat, defend.cid, null);
  assert.strictEqual(combat.player.block, 5);
  E.endTurn(run, combat);
  assert.strictEqual(combat.player.block, 5);
});

test('Gift- und Statuskarten werden korrekt behandelt', function () {
  var run = E.newRun(12);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var wound = inject(combat, 'wound');
  var chk = E.canPlay(run, combat, wound);
  assert.strictEqual(chk.ok, false);
  var slimed = inject(combat, 'slimed');
  assert.strictEqual(E.canPlay(run, combat, slimed).ok, true);
  E.playCard(run, combat, slimed.cid, null);
  assert.strictEqual(combat.energy, 2);
  assert(combat.exhaustPile.indexOf(slimed) !== -1);
});

test('Umstrickt verhindert Angriffe, Normality begrenzt Karten pro Zug', function () {
  var run = E.newRun(13);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  combat.player.statuses.entangle = 2;
  var strike = forceCard(combat, 'strike');
  assert.strictEqual(E.canPlay(run, combat, strike).ok, false);
  combat.player.statuses.entangle = 0;
  inject(combat, 'normality');
  combat.cardsPlayedThisTurn = 3;
  assert.strictEqual(E.canPlay(run, combat, strike).ok, false);
});

test('Potenzen und Relikte werden im Kampf angewendet', function () {
  var run = E.newRun(14);
  run.relics.push('vajra');
  run.relics.push('anchor');
  run.relics.push('bag_preparation');
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  assert.strictEqual(combat.player.statuses.strength, 1);
  assert.strictEqual(combat.player.block, 10);
  assert.strictEqual(combat.hand.length, 7);
});

test('Trank wird verbraucht und verursacht Schaden', function () {
  var run = E.newRun(15);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  run.potions[0] = 'fire';
  var enemy = combat.enemies[0];
  var hp = enemy.hp;
  var res = E.usePotion(run, combat, 0);
  assert(res.ok, res.reason);
  assert.strictEqual(enemy.hp, hp - 20);
  assert.strictEqual(run.potions[0], null);
});

test('Kartenbelohnung und Gold nach gewonnenem Kampf', function () {
  var run = E.newRun(16);
  var node = run.map.rows[0][0];
  var combat = E.startCombat(run, ['cultist'], 'normal', node.id);
  var enemy = combat.enemies[0];
  enemy.hp = 1;
  var strike = forceCard(combat, 'strike');
  E.playCard(run, combat, strike.cid, enemy.uid);
  assert.strictEqual(combat.phase, 'won');
  var reward = E.buildReward(run, combat);
  assert.strictEqual(reward.cards.length, 3);
  assert(reward.gold >= 10 && reward.gold <= 20);
  var goldBefore = run.gold;
  var deckBefore = run.deck.length;
  assert(E.takeRewardCard(run, reward, 0));
  assert.strictEqual(run.deck.length, deckBefore + 1);
  assert.strictEqual(run.gold, goldBefore, 'Gold wird erst beim Abschluss gutgeschrieben');
  E.finishReward(run, reward);
  assert.strictEqual(run.gold, goldBefore + reward.gold);
  assert.strictEqual(run.currentNode, node.id);
});

test('Elite garantiert Relikt, Boss bietet drei Boss-Relikte', function () {
  var eliteRun = E.newRun(17);
  var eliteNode = null;
  Object.keys(eliteRun.map.nodes).forEach(function (id) {
    var n = eliteRun.map.nodes[id];
    if (!eliteNode && n.type === 'elite') eliteNode = n;
  });
  var ec = E.startCombat(eliteRun, ['nob'], 'elite', eliteNode.id);
  ec.enemies[0].hp = 1;
  var s = forceCard(ec, 'strike');
  E.playCard(eliteRun, ec, s.cid, ec.enemies[0].uid);
  var er = E.buildReward(eliteRun, ec);
  assert(er.relic, 'Elite muss ein Relikt geben');
  assert(eliteRun.relics.indexOf(er.relic) !== -1);
  E.finishReward(eliteRun, er);

  var bossRun = E.newRun(18);
  var bc = E.startCombat(bossRun, ['hexaghost'], 'boss', 'boss');
  bc.enemies[0].hp = 1;
  var bs = forceCard(bc, 'strike');
  E.playCard(bossRun, bc, bs.cid, bc.enemies[0].uid);
  assert.strictEqual(bc.phase, 'won');
  var br = E.buildReward(bossRun, bc);
  assert.strictEqual(br.bossRelics.length, 3);
  assert(E.takeBossRelic(bossRun, br, br.bossRelics[0]));
  E.finishReward(bossRun, br);
  assert.strictEqual(bossRun.won, true);
});

test('Shop kauft Karten, Relikte und entfernt Karten', function () {
  var run = E.newRun(19);
  run.gold = 1000;
  var shop = E.makeShop(run, 'shop-node');
  assert.strictEqual(shop.cards.length, 5);
  var deckBefore = run.deck.length;
  var goldBefore = run.gold;
  var buy = E.buyShopCard(run, shop, 0);
  assert(buy.ok, buy.reason);
  assert.strictEqual(run.deck.length, deckBefore + 1);
  assert(run.gold < goldBefore);
  assert(shop.cards[0].sold);
  if (shop.relics.length) {
    var rb = E.buyShopRelic(run, shop, 0);
    assert(rb.ok, rb.reason);
  }
  var upCard = run.deck.find(function (c) { return !c.upgraded && D.CARDS[c.id].up; });
  var upGold = run.gold;
  var up = E.shopUpgradeCard(run, shop, upCard.uid);
  assert(up.ok, up.reason);
  assert.strictEqual(upCard.upgraded, true);
  assert.strictEqual(run.gold, upGold - shop.upgradeCost);
  assert.strictEqual(shop.upgradeSold, true);
  var firstUid = run.deck[0].uid;
  var removeCost = shop.removeCost;
  var rem = E.shopRemoveCard(run, shop, firstUid);
  assert(rem.ok, rem.reason);
  assert.strictEqual(run.removeCost, removeCost + 25);
  assert.strictEqual(shop.removeSold, true);
});

test('Lagerfeuer heilt und Schmieden wertet auf', function () {
  var run = E.newRun(20);
  run.hp = 10;
  var healed = E.restHeal(run);
  assert.strictEqual(healed, 24);
  assert.strictEqual(run.hp, 34);
  var card = run.deck.find(function (c) { return !c.upgraded; });
  assert(E.smithCard(run, card.uid));
  assert(card.upgraded);
});

test('Events veraendern Gold, Deck und HP', function () {
  var run = E.newRun(21);
  var gold = run.gold;
  var result = E.resolveEvent(run, 'golden_idol', 0);
  assert(result.ok, result.reason);
  assert.strictEqual(run.gold, gold + 100);
  assert(run.deck.some(function (c) { return D.CARDS[c.id].type === 'curse'; }));
  var run2 = E.newRun(22);
  run2.hp = 40;
  var r2 = E.resolveEvent(run2, 'spring', 0);
  assert(r2.ok);
  assert.strictEqual(run2.hp, 64);
});

test('Intentionen berechnen Staerke, Schwach und Verwundbar', function () {
  var run = E.newRun(23);
  var combat = E.startCombat(run, ['nob'], 'normal', 'test');
  var enemy = combat.enemies[0];
  enemy.turns = 1;
  enemy.intent = 'rush';
  enemy.statuses.strength = 3;
  var info = E.intentInfo(combat, enemy);
  assert.strictEqual(info.dmg, 17);
  enemy.statuses.weak = 1;
  info = E.intentInfo(combat, enemy);
  assert.strictEqual(info.dmg, 12);
  combat.player.statuses.vulnerable = 1;
  info = E.intentInfo(combat, enemy);
  assert.strictEqual(info.dmg, 18);
});

test('Gegnerzuege, Ritual und neuer Spielerzug', function () {
  var run = E.newRun(24);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  var enemy = combat.enemies[0];
  E.endTurn(run, combat);
  assert.strictEqual(enemy.statuses.ritual, 3);
  assert.strictEqual(enemy.statuses.strength, 3);
  assert.strictEqual(enemy.intent, 'dark_strike');
  assert.strictEqual(combat.turn, 2);
  assert.strictEqual(combat.energy, 3);
  assert.strictEqual(combat.hand.length, 5);
  var hp = combat.player.hp;
  E.endTurn(run, combat);
  assert.strictEqual(combat.player.hp, hp - 9);
});

test('Hexageist: Aktivieren, Teiler und Verbrennungen', function () {
  var run = E.newRun(25);
  var combat = E.startCombat(run, ['hexaghost'], 'boss', 'boss');
  var boss = combat.enemies[0];
  assert.strictEqual(boss.intent, 'activate');
  E.endTurn(run, combat);
  assert.strictEqual(boss.intent, 'divider');
  var info = E.intentInfo(combat, boss);
  assert.strictEqual(info.hits, Math.max(2, Math.min(12, Math.floor(combat.player.hp / 12) + 1)));
});

test('Kampf-Zustand ist JSON-serialisierbar', function () {
  var run = E.newRun(26);
  var combat = E.startCombat(run, ['slime', 'louse'], 'normal', 'test');
  var data = JSON.parse(JSON.stringify({ run: run, combat: combat }));
  assert.strictEqual(data.combat.hand.length, combat.hand.length);
  assert.strictEqual(data.run.deck.length, 10);
});

test('Unspielbares ohne Ziel wird abgelehnt', function () {
  var run = E.newRun(27);
  var combat = E.startCombat(run, ['cultist'], 'normal', 'test');
  combat.energy = 0;
  var strike = forceCard(combat, 'strike');
  var res = E.playCard(run, combat, strike.cid, combat.enemies[0].uid);
  assert.strictEqual(res.ok, false);
  assert(/Energie/.test(res.reason));
});

console.log('\n' + passed + ' Tests bestanden, ' + failures.length + ' fehlgeschlagen.');
if (failures.length) {
  failures.forEach(function (f) {
    console.log('\n--- ' + f.name + ' ---');
    console.log(f.err.stack);
  });
  process.exit(1);
}
