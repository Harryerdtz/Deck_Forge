/* DeckForge - reine Spiel-Engine. Keine DOM-Abhaengigkeiten. */
(function () {
  'use strict';

  var D = window.DFData;
  var CARDS = D.CARDS;
  var RELICS = D.RELICS;
  var POTIONS = D.POTIONS;
  var ENEMIES = D.ENEMIES;

  var TYPE_LABEL = { attack: 'Angriff', skill: 'Fertigkeit', power: 'Kraft', status: 'Status', curse: 'Fluch' };
  var RARITY_LABEL = { basic: 'Start', common: 'Gewoehnlich', uncommon: 'Ungewoehnlich', rare: 'Selten', status: 'Status', curse: 'Fluch', boss: 'Boss' };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function rng(run) {
    var x = run.rng >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    if (x === 0) x = 0x9e3779b9;
    run.rng = x;
    return x / 4294967296;
  }

  function ri(run, n) { return Math.floor(rng(run) * n); }
  function pick(run, arr) { return arr[ri(run, arr.length)]; }

  function shuffle(run, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = ri(run, i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function makeCard(run, id, upgraded) {
    var def = CARDS[id];
    if (!def) throw new Error('Unbekannte Karte: ' + id);
    return { uid: 'u' + (run.uid++), id: id, upgraded: !!upgraded };
  }

  function cardDef(inst) { return CARDS[inst.id]; }

  function cardVals(inst) {
    var def = CARDS[inst.id];
    var out = {};
    for (var k in def) if (Object.prototype.hasOwnProperty.call(def, k)) out[k] = def[k];
    if (inst.upgraded && def.up) {
      for (var u in def.up) if (Object.prototype.hasOwnProperty.call(def.up, u)) out[u] = def.up[u];
    }
    return out;
  }

  function cardName(inst) {
    var def = CARDS[inst.id];
    return def.name + (inst.upgraded ? '+' : '');
  }

  function cardTypeLabel(inst) { return TYPE_LABEL[CARDS[inst.id].type] || 'Karte'; }
  function rarityLabel(r) { return RARITY_LABEL[r] || r; }

  function cardDesc(inst) {
    var def = CARDS[inst.id];
    var v = cardVals(inst);
    var s = def.desc;
    s = s.replace(/\{dmg\}/g, v.dmg != null ? v.dmg : 0);
    s = s.replace(/\{block\}/g, v.block != null ? v.block : 0);
    s = s.replace(/\{magic\}/g, v.magic != null ? v.magic : 0);
    s = s.replace(/\{hits\}/g, v.hits != null ? v.hits : 1);
    s = s.replace(/\{strmult\}/g, v.strmult != null ? v.strmult : 1);
    if (v.innate) s += ' |Angeboren.';
    return s;
  }

  function cardCost(inst, combat) {
    var def = CARDS[inst.id];
    var v = cardVals(inst);
    if (v.cost === 'X') return 'X';
    if (combat && combat.player.powers.corruption && def.type === 'skill') return 0;
    return v.cost;
  }

  function costNumber(inst, combat) {
    var c = cardCost(inst, combat);
    if (c === 'X') return 'X';
    if (c == null) return null;
    return c;
  }

  function newRun(seed) {
    seed = (seed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : seed) >>> 0;
    var run = {
      seed: seed,
      rng: seed || 1,
      hp: 80, maxHp: 80,
      gold: 99,
      deck: [],
      relics: ['burning_blood'],
      potions: [null, null, null],
      map: null,
      currentNode: null,
      floor: 0,
      act: 1,
      uid: 1,
      removeCost: 75,
      kills: 0,
      elites: 0,
      combats: 0,
      cardsPlayed: 0,
      won: false,
      started: Date.now()
    };
    createStarterDeck(run);
    generateMap(run);
    return run;
  }

  function createStarterDeck(run) {
    run.deck = [];
    var i;
    for (i = 0; i < 5; i++) run.deck.push(makeCard(run, 'strike', false));
    for (i = 0; i < 4; i++) run.deck.push(makeCard(run, 'defend', false));
    run.deck.push(makeCard(run, 'bash', false));
  }

  /* ---------------- Map ---------------- */

  function nodeId(row, col) { return 'r' + row + 'c' + col; }

  function generateMap(run) {
    var ROWS = 15;
    var COLS = 7;
    var nodes = {};
    var rows = [];
    var r, c, p;
    for (r = 0; r < ROWS; r++) rows.push([]);

    function ensure(row, col) {
      var id = nodeId(row, col);
      if (!nodes[id]) {
        nodes[id] = { id: id, row: row, col: col, type: 'monster', links: [], visited: false };
        rows[row].push(nodes[id]);
      }
      return nodes[id];
    }

    for (p = 0; p < 6; p++) {
      var col = 1 + ri(run, COLS - 2);
      for (r = 0; r < 14; r++) {
        var node = ensure(r, col);
        if (r < 13) {
          var ncol = clamp(col + (ri(run, 3) - 1), 0, COLS - 1);
          var next = ensure(r + 1, ncol);
          if (node.links.indexOf(next.id) === -1) node.links.push(next.id);
          col = ncol;
        }
      }
    }

    // Boss node
    var boss = { id: 'boss', row: 14, col: 3, type: 'boss', links: [], visited: false };
    nodes[boss.id] = boss;
    rows[14].push(boss);
    for (c = 0; c < rows[13].length; c++) {
      if (rows[13][c].links.indexOf('boss') === -1) rows[13][c].links.push('boss');
    }

    // Sort rows by column
    for (r = 0; r < ROWS; r++) rows[r].sort(function (a, b) { return a.col - b.col; });

    // Base types
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < rows[r].length; c++) {
        var n = rows[r][c];
        if (r === 14) n.type = 'boss';
        else if (r === 13) n.type = 'rest';
        else if (r <= 1) n.type = 'monster';
      }
    }

    // Random types for middle rows
    for (r = 2; r <= 12; r++) {
      for (c = 0; c < rows[r].length; c++) {
        var nd = rows[r][c];
        if (nd.type !== 'monster') continue;
        var roll = ri(run, 100);
        if (r >= 5) {
          if (roll < 12) nd.type = 'elite';
          else if (roll < 22) nd.type = 'shop';
          else if (roll < 34) nd.type = 'rest';
          else if (roll < 58) nd.type = 'event';
        } else {
          if (roll < 28) nd.type = 'event';
        }
      }
    }

    // Guarantee shops, elites and events
    function countType(type) {
      var n = 0;
      for (var id in nodes) if (nodes[id].type === type) n++;
      return n;
    }
    function convertTo(type, minRow, maxRow) {
      var candidates = [];
      for (var id in nodes) {
        var n = nodes[id];
        if (n.type === 'monster' && n.row >= minRow && n.row <= maxRow) candidates.push(n);
      }
      if (!candidates.length) return false;
      pick(run, candidates).type = type;
      return true;
    }
    while (countType('elite') < 2 && convertTo('elite', 4, 11)) {}
    while (countType('shop') < 2 && convertTo('shop', 3, 11)) {}
    if (countType('event') < 2) convertTo('event', 2, 10);
    if (countType('rest') < 3) convertTo('rest', 5, 11);

    run.map = { rows: rows, nodes: nodes, bossId: 'boss' };
    run.currentNode = null;
    run.floor = 0;
    return run.map;
  }

  function rollEncounter(run, kind, floor) {
    var table = D.ENCOUNTERS[kind] || D.ENCOUNTERS.normal;
    var options = [];
    for (var i = 0; i < table.length; i++) {
      var enc = table[i];
      if (enc.min != null && floor < enc.min) continue;
      if (enc.max != null && floor > enc.max) continue;
      options.push(enc);
    }
    if (!options.length) options = table.slice();
    var total = 0;
    for (var j = 0; j < options.length; j++) total += options[j].weight || 1;
    var roll = rng(run) * total;
    for (var k = 0; k < options.length; k++) {
      roll -= options[k].weight || 1;
      if (roll <= 0) return options[k].enemies.slice();
    }
    return options[options.length - 1].enemies.slice();
  }

  function availableNodes(run) {
    if (!run.map) return [];
    if (!run.currentNode) return run.map.rows[0].slice();
    var node = run.map.nodes[run.currentNode];
    if (!node) return run.map.rows[0].slice();
    return node.links.map(function (id) { return run.map.nodes[id]; }).filter(Boolean);
  }

  function enterNode(run, id) {
    var node = run.map.nodes[id];
    if (!node) return null;
    run.currentNode = id;
    node.visited = true;
    run.floor = node.row + 1;
    return node;
  }

  function completeNode(run, id) {
    var node = run.map.nodes[id];
    if (node) {
      node.visited = true;
      run.currentNode = id;
      run.floor = node.row + 1;
      if (node.type === 'boss') run.won = true;
    }
  }

  /* ---------------- Combat setup ---------------- */

  function cloneDeck(run) {
    return run.deck.map(function (c) {
      return { uid: c.uid, cid: 'c' + (run.uid++), id: c.id, upgraded: c.upgraded, rampage: 0 };
    });
  }

  function hasRelic(run, id) { return run.relics.indexOf(id) !== -1; }

  function startCombat(run, enemyIds, kind, nodeIdValue) {
    var combat = {
      kind: kind || 'normal',
      nodeId: nodeIdValue || null,
      enemies: [],
      player: {
        hp: run.hp,
        maxHp: run.maxHp,
        block: 0,
        statuses: { strength: 0, dexterity: 0, weak: 0, vulnerable: 0, ritual: 0, entangle: 0 },
        powers: {},
        tempStrength: 0,
        noDraw: false,
        redSkullActive: false
      },
      energy: 3,
      maxEnergy: 3,
      hand: [],
      drawPile: [],
      discardPile: [],
      exhaustPile: [],
      turn: 1,
      phase: 'player',
      log: [],
      pending: null,
      cardsPlayedThisTurn: 0,
      attacksPlayedThisTurn: 0,
      firstTurn: true,
      flowerTick: hasRelic(run, 'happy_flower') ? 1 : 0,
      reward: null
    };

    var i;
    for (i = 0; i < enemyIds.length; i++) {
      var def = ENEMIES[enemyIds[i]];
      if (!def) continue;
      var hp = def.hp[0] + ri(run, def.hp[1] - def.hp[0] + 1);
      combat.enemies.push({
        uid: 'e' + (run.uid++),
        id: def.id,
        name: def.name,
        hp: hp,
        maxHp: hp,
        block: 0,
        statuses: { strength: 0, weak: 0, vulnerable: 0, ritual: 0 },
        turns: 0,
        intent: null,
        dead: false,
        awake: false
      });
    }

    var energyRelics = 0;
    if (hasRelic(run, 'ectoplasm')) energyRelics++;
    if (hasRelic(run, 'sozu')) energyRelics++;
    if (hasRelic(run, 'philosophers_stone')) energyRelics++;
    combat.maxEnergy = 3 + energyRelics;
    combat.energy = combat.maxEnergy + (hasRelic(run, 'lantern') ? 1 : 0);

    if (hasRelic(run, 'vajra')) combat.player.statuses.strength += 1;
    if (hasRelic(run, 'smooth_stone')) combat.player.statuses.dexterity += 1;
    if (hasRelic(run, 'anchor')) combat.player.block += 10;
    if (hasRelic(run, 'bronze_scales')) combat.player.powers.thorns = (combat.player.powers.thorns || 0) + 3;
    if (hasRelic(run, 'red_skull') && combat.player.hp <= combat.player.maxHp / 2) {
      combat.player.statuses.strength += 3;
      combat.player.redSkullActive = true;
    }
    if (hasRelic(run, 'blood_vial')) healCombat(run, combat, 2);

    if (hasRelic(run, 'philosophers_stone')) {
      for (i = 0; i < combat.enemies.length; i++) combat.enemies[i].statuses.strength += 1;
    }

    combat.drawPile = shuffle(run, cloneDeck(run));
    var innates = combat.drawPile.filter(function (c) { return cardVals(c).innate; });
    if (innates.length) {
      combat.drawPile = combat.drawPile.filter(function (c) { return cardVals(c).innate !== true; });
      for (i = 0; i < innates.length && combat.hand.length < 10; i++) combat.hand.push(innates[i]);
    }
    drawCards(run, combat, 5 + (hasRelic(run, 'bag_preparation') ? 2 : 0));

    for (i = 0; i < combat.enemies.length; i++) chooseIntent(run, combat, combat.enemies[i]);

    run.combats++;
    log(combat, 'Kampf beginnt.');
    if (kind === 'elite') log(combat, 'Elite-Gegner! Ein Relikt wartet.');
    if (kind === 'boss') log(combat, 'Der Boss erhebt sich.');
    syncHp(run, combat);
    return combat;
  }

  function syncHp(run, combat) {
    run.hp = clamp(combat.player.hp, 0, combat.player.maxHp);
    run.maxHp = combat.player.maxHp;
  }

  function aliveEnemies(combat) {
    return combat.enemies.filter(function (e) { return !e.dead; });
  }

  function log(combat, text) {
    combat.log.push(text);
    if (combat.log.length > 40) combat.log.shift();
  }

  /* ---------------- Draw / piles ---------------- */

  function drawCards(run, combat, n) {
    if (combat.player.noDraw) return 0;
    var drawn = 0;
    var extra = 0;
    var guard = 0;
    while (n > 0 && guard < 60) {
      guard++;
      if (combat.hand.length >= 10) break;
      if (!combat.drawPile.length) {
        if (!combat.discardPile.length) break;
        combat.drawPile = shuffle(run, combat.discardPile);
        combat.discardPile = [];
      }
      var inst = combat.drawPile.pop();
      if (!inst) break;
      combat.hand.push(inst);
      n--;
      drawn++;
      var def = CARDS[inst.id];
      if (def.onDrawEnergy) {
        combat.energy = Math.max(0, combat.energy + def.onDrawEnergy);
        log(combat, cardName(inst) + ': ' + def.onDrawEnergy + ' Energie.');
      }
      if (def.type === 'status') {
        if (combat.player.powers.fireBreathing) {
          damageAllRaw(run, combat, combat.player.powers.fireBreathing, 'Feueratem');
        }
        if (combat.player.powers.evolve) extra += combat.player.powers.evolve;
      }
      if (extra > 0) {
        n += extra;
        extra = 0;
      }
    }
    return drawn;
  }

  function addCardToCombat(run, combat, id, zone, amount) {
    amount = amount || 1;
    for (var i = 0; i < amount; i++) {
      var c = { uid: 'c' + (run.uid++), cid: 'c' + (run.uid++), id: id, upgraded: false, rampage: 0 };
      if (zone === 'hand') {
        if (combat.hand.length < 10) combat.hand.push(c);
        else combat.discardPile.push(c);
      } else if (zone === 'draw') {
        var idx = combat.drawPile.length ? ri(run, combat.drawPile.length + 1) : 0;
        combat.drawPile.splice(idx, 0, c);
      } else {
        combat.discardPile.push(c);
      }
    }
  }

  function exhaustCard(run, combat, inst) {
    combat.exhaustPile.push(inst);
    if (combat.player.powers.feelNoPain) gainBlock(run, combat, combat.player.powers.feelNoPain, true);
    if (combat.player.powers.darkEmbrace) drawCards(run, combat, combat.player.powers.darkEmbrace);
    if (inst.id === 'sentinel') {
      combat.energy += 2;
      log(combat, 'Waechter: +2 Energie.');
    }
  }

  /* ---------------- Damage ---------------- */

  function calcPlayerHit(combat, enemy, base, opts) {
    opts = opts || {};
    var mult = opts.strMult || 1;
    var dmg = base + (combat.player.statuses.strength || 0) * mult;
    if (combat.player.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (enemy.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    return Math.max(0, dmg);
  }

  function damageEnemy(run, combat, enemy, amount) {
    if (!enemy || enemy.dead) return 0;
    var blocked = Math.min(enemy.block, amount);
    enemy.block -= blocked;
    var hpLoss = amount - blocked;
    if (hpLoss > 0) {
      enemy.hp -= hpLoss;
      if (enemy.id === 'lagavulin') enemy.awake = true;
    }
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.dead = true;
      run.kills++;
      log(combat, enemy.name + ' wurde besiegt.');
    }
    return hpLoss;
  }

  function damageAllRaw(run, combat, amount, source) {
    var total = 0;
    var list = aliveEnemies(combat);
    for (var i = 0; i < list.length; i++) {
      var dealt = damageEnemy(run, combat, list[i], amount);
      total += dealt;
    }
    if (total > 0) log(combat, (source || 'Effekt') + ' verursacht ' + amount + ' Schaden an allen Gegnern.');
    return total;
  }

  function healCombat(run, combat, amount) {
    var before = combat.player.hp;
    combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + amount);
    var healed = combat.player.hp - before;
    if (healed > 0) log(combat, 'Heilung: +' + healed + ' HP.');
    syncHp(run, combat);
    return healed;
  }

  function loseHpPlayer(run, combat, amount, fromCard) {
    if (amount <= 0) return 0;
    var loss = Math.min(amount, combat.player.hp);
    combat.player.hp -= loss;
    log(combat, 'Du verlierst ' + loss + ' HP.');
    if (fromCard && combat.player.powers.rupture) {
      combat.player.statuses.strength += combat.player.powers.rupture;
      log(combat, 'Riss: +' + combat.player.powers.rupture + ' Staerke.');
    }
    syncHp(run, combat);
    return loss;
  }

  function gainBlock(run, combat, amount, silent) {
    if (amount <= 0) return;
    var total = amount + (combat.player.statuses.dexterity || 0);
    combat.player.block += total;
    if (!silent) log(combat, '+' + total + ' Ruestung.');
    if (combat.player.powers.juggernaut) {
      var list = aliveEnemies(combat);
      if (list.length) {
        var target = pick(run, list);
        damageEnemy(run, combat, target, combat.player.powers.juggernaut);
        log(combat, 'Koloss: ' + combat.player.powers.juggernaut + ' Schaden an ' + target.name + '.');
      }
    }
  }

  function applyStatus(statuses, key, n) {
    statuses[key] = (statuses[key] || 0) + n;
    if (['weak', 'vulnerable', 'ritual', 'entangle'].indexOf(key) !== -1) statuses[key] = Math.max(0, statuses[key]);
    return statuses[key];
  }

  function calcEnemyHit(combat, enemy, move) {
    var dmg = move.dmg || 0;
    dmg += enemy.statuses.strength || 0;
    if (enemy.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (combat.player.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    return Math.max(0, dmg);
  }

  function enemyHitPlayer(run, combat, enemy, move) {
    var dmg = calcEnemyHit(combat, enemy, move);
    var blocked = Math.min(combat.player.block, dmg);
    combat.player.block -= blocked;
    var hpLoss = dmg - blocked;
    if (hpLoss > 0) {
      combat.player.hp -= hpLoss;
      log(combat, enemy.name + ' trifft dich fuer ' + hpLoss + ' Schaden.');
    } else {
      log(combat, enemy.name + 's Angriff wird geblockt.');
    }
    syncHp(run, combat);

    var thorns = (combat.player.powers.thorns || 0) + (combat.player.statuses.thorns || 0);
    if (thorns > 0 && !enemy.dead) {
      var dealt = damageEnemy(run, combat, enemy, thorns);
      if (dealt > 0) log(combat, 'Dornen: ' + thorns + ' Schaden an ' + enemy.name + '.');
    }
    return hpLoss;
  }

  /* ---------------- Enemy intents ---------------- */

  function moveFor(enemy) {
    var def = ENEMIES[enemy.id];
    if (!def) return null;
    var move = def.moves[enemy.intent];
    if (!move) {
      // fallback defensive move
      move = { name: 'Abwarten', type: 'defend', block: 4, text: 'Erhaelt 4 Ruestung.' };
    }
    return move;
  }

  function dividerHits(combat) { return clamp(Math.floor(combat.player.hp / 12) + 1, 2, 12); }

  function moveHits(combat, enemy, move) {
    if (move.dynamicHits === 'divider') return dividerHits(combat);
    return move.hits || 1;
  }

  function chooseIntent(run, combat, enemy) {
    var def = ENEMIES[enemy.id];
    var id = def.ai(enemy, combat, function () { return rng(run); });
    enemy.intent = id;
  }

  function intentInfo(combat, enemy) {
    var move = moveFor(enemy);
    var def = ENEMIES[enemy.id];
    var info = {
      name: move.name,
      text: move.text,
      type: move.type,
      icons: [],
      dmg: 0,
      hits: 1,
      block: 0,
      attack: false,
      selfStatuses: move.self || null,
      playerStatuses: move.player || null,
      addCard: move.addCard || null
    };
    var hitTypes = (move.type || '').split('_');
    info.attack = hitTypes.indexOf('attack') !== -1;
    info.defend = hitTypes.indexOf('defend') !== -1;
    info.buff = hitTypes.indexOf('buff') !== -1;
    info.debuff = hitTypes.indexOf('debuff') !== -1;

    if (info.attack) {
      info.dmg = calcEnemyHit(combat, enemy, move);
      info.hits = moveHits(combat, enemy, move);
      info.icons.push('sword');
    }
    if (move.block) {
      info.block = move.block;
      info.icons.push('shield');
    }
    if (move.self && Object.keys(move.self).length) info.icons.push('buff');
    if ((move.player && Object.keys(move.player).length) || move.addCard) info.icons.push('skull');
    if (!info.icons.length) info.icons.push('question');
    info.def = def;
    return info;
  }

  function executeEnemyMove(run, combat, enemy) {
    var move = moveFor(enemy);
    if (!move) { enemy.turns++; return; }
    log(combat, enemy.name + ': ' + move.name + '.');
    if (move.type && move.type.indexOf('attack') !== -1) {
      var hits = moveHits(combat, enemy, move);
      for (var h = 0; h < hits; h++) {
        if (combat.player.hp <= 0 || enemy.dead) break;
        enemyHitPlayer(run, combat, enemy, move);
      }
    }
    if (move.block) {
      enemy.block += move.block;
      log(combat, enemy.name + ' erhaelt ' + move.block + ' Ruestung.');
    }
    if (move.self) {
      for (var key in move.self) {
        applyStatus(enemy.statuses, key, move.self[key]);
        log(combat, enemy.name + ' erhaelt ' + move.self[key] + ' ' + statusName(key) + '.');
      }
    }
    if (move.player) {
      for (var pk in move.player) {
        applyStatus(combat.player.statuses, pk, move.player[pk]);
        log(combat, 'Du erhaeltst ' + Math.abs(move.player[pk]) + ' ' + statusName(pk) + '.');
      }
    }
    if (move.addCard) {
      addCardToCombat(run, combat, move.addCard.id, move.addCard.zone || 'discard', move.addCard.count || 1);
      log(combat, 'Eine ' + CARDS[move.addCard.id].name + ' wird hinzugefuegt.');
    }
  }

  function statusName(key) {
    var s = D.STATUS[key];
    return s ? s.name : key;
  }

  /* ---------------- Play cards ---------------- */

  function canPlay(run, combat, inst) {
    if (!inst) return { ok: false, reason: 'Karte nicht gefunden.' };
    if (combat.phase !== 'player') return { ok: false, reason: 'Du bist nicht am Zug.' };
    if (combat.pending) return { ok: false, reason: 'Waehle zuerst eine Karte.' };
    var def = CARDS[inst.id];
    if (!def) return { ok: false, reason: 'Unbekannte Karte.' };
    if (def.unplayable || def.type === 'curse' || def.type === 'status' && def.cost == null) {
      if (inst.id !== 'slimed') return { ok: false, reason: 'Diese Karte ist nicht spielbar.' };
    }
    if (combat.cardsPlayedThisTurn >= 3) {
      var hasNormality = combat.hand.some(function (c) { return c.id === 'normality'; });
      if (hasNormality) return { ok: false, reason: 'Normalitaet: Maximal 3 Karten pro Zug.' };
    }
    if (def.type === 'attack' && combat.player.statuses.entangle > 0) {
      return { ok: false, reason: 'Du bist umstrickt und kannst nicht angreifen.' };
    }
    if (def.condition && !def.condition(combat)) {
      return { ok: false, reason: 'Bedingung der Karte nicht erfuellt.' };
    }
    var cost = cardCost(inst, combat);
    if (cost !== 'X' && combat.energy < cost) return { ok: false, reason: 'Nicht genug Energie.' };
    if (def.target === 'enemy' && !aliveEnemies(combat).length) return { ok: false, reason: 'Kein Ziel.' };
    return { ok: true };
  }

  function makeActions(run, combat, inst, x) {
    var a = {
      combat: combat,
      player: combat.player,
      enemies: combat.enemies,
      inst: inst,
      x: x,
      log: function (t) { log(combat, t); },
      attack: function (target, amount, opts) {
        opts = opts || {};
        var hits = opts.hits || 1;
        var dealt = 0;
        var killed = false;
        var t = target;
        if (!t || t.dead) t = aliveEnemies(combat)[0];
        if (!t) return { dealt: 0, killed: false };
        for (var i = 0; i < hits; i++) {
          if (!t || t.dead) break;
          var dmg = calcPlayerHit(combat, t, amount, opts);
          var hpLoss = damageEnemy(run, combat, t, dmg);
          dealt += hpLoss;
          if (hpLoss > 0) log(combat, cardName(inst) + ' verursacht ' + hpLoss + ' Schaden an ' + t.name + '.');
          else log(combat, t.name + ' blockt den Angriff.');
          if (t.dead) { killed = true; break; }
        }
        return { dealt: dealt, killed: killed };
      },
      attackAll: function (amount, opts) {
        opts = opts || {};
        var list = aliveEnemies(combat);
        var total = 0;
        var anyKilled = false;
        for (var i = 0; i < list.length; i++) {
          if (list[i].dead) continue;
          var dmg = calcPlayerHit(combat, list[i], amount, opts);
          var hpLoss = damageEnemy(run, combat, list[i], dmg);
          total += hpLoss;
          if (list[i].dead) anyKilled = true;
          if (hpLoss > 0) log(combat, cardName(inst) + ' verursacht ' + hpLoss + ' Schaden an ' + list[i].name + '.');
        }
        return total;
      },
      attackRandom: function (amount, hits, opts) {
        opts = opts || {};
        var total = 0;
        for (var i = 0; i < hits; i++) {
          var list = aliveEnemies(combat);
          if (!list.length) break;
          var t = pick(run, list);
          var dmg = calcPlayerHit(combat, t, amount, opts);
          var hpLoss = damageEnemy(run, combat, t, dmg);
          total += hpLoss;
          log(combat, cardName(inst) + ' trifft ' + t.name + ' fuer ' + hpLoss + ' Schaden.');
        }
        return total;
      },
      block: function (n) { gainBlock(run, combat, n); },
      apply: function (key, n) {
        applyStatus(combat.player.statuses, key, n);
        log(combat, 'Du erhaeltst ' + Math.abs(n) + ' ' + statusName(key) + '.');
      },
      applyTo: function (target, key, n) {
        if (!target || target.dead) return;
        applyStatus(target.statuses, key, n);
        log(combat, target.name + ' erhaelt ' + Math.abs(n) + ' ' + statusName(key) + '.');
      },
      applyAll: function (key, n) {
        var list = aliveEnemies(combat);
        for (var i = 0; i < list.length; i++) {
          applyStatus(list[i].statuses, key, n);
          log(combat, list[i].name + ' erhaelt ' + Math.abs(n) + ' ' + statusName(key) + '.');
        }
      },
      draw: function (n) { drawCards(run, combat, n); },
      energy: function (n) { combat.energy += n; log(combat, (n >= 0 ? '+' : '') + n + ' Energie.'); },
      heal: function (n) { healCombat(run, combat, n); },
      loseHp: function (n) { loseHpPlayer(run, combat, n, true); },
      addCard: function (id, zone, n) { addCardToCombat(run, combat, id, zone || 'discard', n || 1); },
      exhaustHand: function (filter) {
        var count = 0;
        for (var i = combat.hand.length - 1; i >= 0; i--) {
          var c = combat.hand[i];
          if (!filter || filter(c)) {
            combat.hand.splice(i, 1);
            exhaustCard(run, combat, c);
            count++;
          }
        }
        return count;
      },
      exhaustRandomHand: function (n) {
        var count = 0;
        for (var k = 0; k < n; k++) {
          if (!combat.hand.length) break;
          var idx = ri(run, combat.hand.length);
          var c = combat.hand.splice(idx, 1)[0];
          exhaustCard(run, combat, c);
          count++;
        }
        return count;
      },
      upgradeRandomHand: function (n) {
        var options = combat.hand.filter(function (c) { return !c.upgraded && CARDS[c.id].up; });
        for (var i = 0; i < n && options.length; i++) {
          var idx = ri(run, options.length);
          var c = options.splice(idx, 1)[0];
          c.upgraded = true;
          log(combat, cardName(c) + ' wurde aufgewertet.');
        }
      },
      upgradeAllHand: function () {
        for (var i = 0; i < combat.hand.length; i++) {
          var c = combat.hand[i];
          if (!c.upgraded && CARDS[c.id].up) { c.upgraded = true; log(combat, cardName(c) + ' wurde aufgewertet.'); }
        }
      },
      pending: function (kind, data) { combat.pending = { kind: kind, data: data || {} }; },
      countStrikes: function () {
        var total = 0;
        var zones = [combat.hand, combat.drawPile, combat.discardPile, combat.exhaustPile];
        for (var z = 0; z < zones.length; z++) {
          for (var i = 0; i < zones[z].length; i++) if (zones[z][i].id === 'strike') total++;
        }
        return total;
      },
      intentIsAttack: function (enemy) {
        var m = moveFor(enemy);
        return !!(m && m.type && m.type.indexOf('attack') !== -1);
      },
      tempStrength: function (n) {
        combat.player.statuses.strength += n;
        combat.player.tempStrength += n;
        log(combat, '+' + n + ' Staerke bis Zugende.');
      },
      doubleStrength: function () {
        combat.player.statuses.strength *= 2;
        log(combat, 'Staerke verdoppelt: ' + combat.player.statuses.strength + '.');
      },
      doubleBlock: function () {
        combat.player.block *= 2;
        log(combat, 'Ruestung verdoppelt: ' + combat.player.block + '.');
      },
      gainMaxHp: function (n) {
        run.maxHp += n;
        combat.player.maxHp += n;
        combat.player.hp += n;
        log(combat, '+' + n + ' max. HP.');
        syncHp(run, combat);
      },
      power: function (key, n) {
        combat.player.powers[key] = (combat.player.powers[key] || 0) + n;
        log(combat, statusName(key) + ' aktiviert.');
      }
    };
    return a;
  }

  function playCard(run, combat, cid, targetUid) {
    if (!combat || combat.phase !== 'player') return { ok: false, reason: 'Nicht am Zug.' };
    if (combat.pending) return { ok: false, reason: 'Waehle zuerst eine Karte.' };
    var idx = -1;
    for (var i = 0; i < combat.hand.length; i++) if (combat.hand[i].cid === cid || combat.hand[i].uid === cid) { idx = i; break; }
    if (idx === -1) return { ok: false, reason: 'Karte nicht in der Hand.' };
    var inst = combat.hand[idx];
    var check = canPlay(run, combat, inst);
    if (!check.ok) return check;
    var def = CARDS[inst.id];
    var vals = cardVals(inst);
    var cost = cardCost(inst, combat);
    var x = cost === 'X' ? combat.energy : 0;
    var spent = cost === 'X' ? combat.energy : cost;
    combat.hand.splice(idx, 1);
    combat.energy -= spent;
    combat.cardsPlayedThisTurn++;
    run.cardsPlayed++;

    var target = null;
    if (def.target === 'enemy') {
      var list = aliveEnemies(combat);
      if (targetUid) target = combat.enemies.find(function (e) { return e.uid === targetUid && !e.dead; });
      if (!target) target = list[0];
      if (!target) {
        combat.hand.push(inst);
        combat.energy += spent;
        combat.cardsPlayedThisTurn--;
        return { ok: false, reason: 'Kein Ziel.' };
      }
    }

    // Pain curse
    var pain = combat.hand.filter(function (c) { return c.id === 'pain'; }).length;
    if (pain > 0) loseHpPlayer(run, combat, pain, false);

    // Enrage: enemies gain strength when a skill is played
    if (def.type === 'skill') {
      for (var e = 0; e < combat.enemies.length; e++) {
        var enemy = combat.enemies[e];
        if (enemy.dead) continue;
        var edef = ENEMIES[enemy.id];
        if (edef && edef.enrage) {
          enemy.statuses.strength += edef.enrage;
          log(combat, enemy.name + ' wird wuetend: +' + edef.enrage + ' Staerke.');
        }
      }
    }

    if (def.type === 'attack') {
      combat.attacksPlayedThisTurn++;
      if (combat.player.powers.rage) gainBlock(run, combat, combat.player.powers.rage);
    }

    var actions = makeActions(run, combat, inst, x);
    var doubleTap = def.type === 'attack' && combat.player.powers.doubleTap > 0;
    if (doubleTap) {
      combat.player.powers.doubleTap--;
      log(combat, 'Doppelter Hieb: Der Angriff wirkt zweimal.');
      def.play(actions, vals, target);
      if (combat.phase !== 'won') def.play(actions, vals, target);
    } else {
      def.play(actions, vals, target);
    }

    if (def.type === 'power') {
      combat.exhaustPile.push(inst);
    } else if (vals.exhaust || (combat.player.powers.corruption && def.type === 'skill')) {
      exhaustCard(run, combat, inst);
    } else {
      combat.discardPile.push(inst);
    }

    log(combat, cardName(inst) + ' gespielt.');
    syncHp(run, combat);
    checkCombat(combat);
    return { ok: true, pending: combat.pending };
  }

  function resolvePending(run, combat, cids) {
    if (!combat || !combat.pending) return false;
    var pending = combat.pending;
    var card = null;
    var i;
    for (i = 0; i < combat.hand.length; i++) {
      if (cids.indexOf(combat.hand[i].cid) !== -1 || cids.indexOf(combat.hand[i].uid) !== -1) { card = combat.hand[i]; break; }
    }
    var zone = 'hand';
    if (!card) {
      for (i = 0; i < combat.discardPile.length; i++) {
        if (cids.indexOf(combat.discardPile[i].cid) !== -1 || cids.indexOf(combat.discardPile[i].uid) !== -1) { card = combat.discardPile[i]; zone = 'discard'; break; }
      }
    }
    if (!card) { combat.pending = null; return false; }
    var arr = zone === 'hand' ? combat.hand : combat.discardPile;
    var idx = arr.indexOf(card);
    arr.splice(idx, 1);
    if (pending.kind === 'headbutt') {
      combat.drawPile.push(card);
      log(combat, cardName(card) + ' liegt nun oben auf dem Ziehstapel.');
    } else if (pending.kind === 'true_grit') {
      exhaustCard(run, combat, card);
      log(combat, cardName(card) + ' wurde erschoepft.');
    } else if (pending.kind === 'burning_pact') {
      exhaustCard(run, combat, card);
      drawCards(run, combat, pending.data.draw || 2);
    } else if (pending.kind === 'warcry') {
      combat.drawPile.push(card);
      log(combat, cardName(card) + ' liegt nun oben auf dem Ziehstapel.');
    }
    combat.pending = null;
    syncHp(run, combat);
    checkCombat(combat);
    return true;
  }

  /* ---------------- Turn flow ---------------- */

  function endTurn(run, combat) {
    if (!combat || combat.phase !== 'player') return { ok: false, reason: 'Nicht am Zug.' };
    if (combat.pending) return { ok: false, reason: 'Waehle zuerst eine Karte.' };

    if (combat.player.powers.metallicize) gainBlock(run, combat, combat.player.powers.metallicize, true);
    if (combat.player.powers.combust) {
      loseHpPlayer(run, combat, 1, false);
      damageAllRaw(run, combat, combat.player.powers.combust, 'Verbrennung');
    }
    if (hasRelic(run, 'orichalcum') && combat.player.block === 0) gainBlock(run, combat, 6, true);

    // End of turn hand effects
    var handCount = combat.hand.length;
    for (var i = combat.hand.length - 1; i >= 0; i--) {
      var c = combat.hand[i];
      var def = CARDS[c.id];
      if (def.endTurnDamage) loseHpPlayer(run, combat, def.endTurnDamage, false);
      if (def.endTurnRegret) loseHpPlayer(run, combat, handCount, false);
      if (def.endTurnWeak) applyStatus(combat.player.statuses, 'weak', def.endTurnWeak);
      if (def.ethereal) {
        combat.hand.splice(i, 1);
        exhaustCard(run, combat, c);
      } else {
        combat.hand.splice(i, 1);
        combat.discardPile.push(c);
      }
    }

    if (combat.player.tempStrength) {
      combat.player.statuses.strength -= combat.player.tempStrength;
      combat.player.tempStrength = 0;
    }
    if (combat.player.statuses.weak > 0) combat.player.statuses.weak--;
    if (combat.player.statuses.vulnerable > 0) combat.player.statuses.vulnerable--;
    if (combat.player.statuses.entangle > 0) combat.player.statuses.entangle--;
    combat.player.powers.rage = 0;

    checkCombat(combat);
    if (combat.phase !== 'player') { syncHp(run, combat); return { ok: true }; }

    combat.phase = 'enemy';
    for (var e = 0; e < combat.enemies.length; e++) {
      var enemy = combat.enemies[e];
      if (enemy.dead) continue;
      enemy.block = 0;
      executeEnemyMove(run, combat, enemy);
      checkCombat(combat);
      if (combat.phase === 'lost') break;
      if (!enemy.dead) {
        if (enemy.statuses.ritual > 0) {
          enemy.statuses.strength += enemy.statuses.ritual;
          log(combat, enemy.name + ' erhaelt durch Ritual +' + enemy.statuses.ritual + ' Staerke.');
        }
        if (enemy.statuses.weak > 0) enemy.statuses.weak--;
        if (enemy.statuses.vulnerable > 0) enemy.statuses.vulnerable--;
      }
      enemy.turns++;
      if (!enemy.dead) chooseIntent(run, combat, enemy);
      if (combat.phase === 'won') break;
    }

    checkCombat(combat);
    if (combat.phase === 'won' || combat.phase === 'lost') { syncHp(run, combat); return { ok: true }; }

    startPlayerTurn(run, combat);
    syncHp(run, combat);
    return { ok: true };
  }

  function startPlayerTurn(run, combat) {
    combat.phase = 'player';
    combat.turn++;
    combat.firstTurn = false;
    combat.cardsPlayedThisTurn = 0;
    combat.attacksPlayedThisTurn = 0;
    combat.player.noDraw = false;

    var barricade = !!combat.player.powers.barricade;
    if (!barricade) combat.player.block = 0;

    var energy = combat.maxEnergy;
    if (combat.player.powers.berserk) energy += combat.player.powers.berserk;
    if (hasRelic(run, 'happy_flower')) {
      combat.flowerTick++;
      if (combat.flowerTick % 3 === 0) energy++;
    }
    combat.energy = energy;

    if (combat.player.powers.demonForm) {
      combat.player.statuses.strength += combat.player.powers.demonForm;
      log(combat, 'Daemonenform: +' + combat.player.powers.demonForm + ' Staerke.');
    }
    if (hasRelic(run, 'red_skull')) {
      var low = combat.player.hp <= combat.player.maxHp / 2;
      if (low && !combat.player.redSkullActive) {
        combat.player.statuses.strength += 3;
        combat.player.redSkullActive = true;
        log(combat, 'Roter Schaedel: +3 Staerke.');
      } else if (!low && combat.player.redSkullActive) {
        combat.player.statuses.strength -= 3;
        combat.player.redSkullActive = false;
      }
    }
    if (combat.player.powers.brutality) {
      loseHpPlayer(run, combat, 1, false);
      drawCards(run, combat, 1);
    }
    drawCards(run, combat, 5);
    log(combat, 'Zug ' + combat.turn + ' beginnt.');
    checkCombat(combat);
  }

  function checkCombat(combat) {
    if (combat.phase === 'won' || combat.phase === 'lost') return combat.phase;
    if (combat.player.hp <= 0) {
      combat.player.hp = 0;
      combat.phase = 'lost';
      log(combat, 'Du bist gefallen.');
      return 'lost';
    }
    if (aliveEnemies(combat).length === 0) {
      combat.phase = 'won';
      log(combat, 'Alle Gegner sind besiegt.');
      return 'won';
    }
    return null;
  }

  /* ---------------- Potions ---------------- */

  function usePotion(run, combat, slot) {
    if (!combat || combat.phase !== 'player') return { ok: false, reason: 'Nur im Kampf nutzbar.' };
    if (combat.pending) return { ok: false, reason: 'Waehle zuerst eine Karte.' };
    var id = run.potions[slot];
    if (!id) return { ok: false, reason: 'Kein Trank in diesem Slot.' };
    var list = aliveEnemies(combat);
    var target = list[0];
    var p = POTIONS[id];
    if (id === 'fire') {
      if (!target) return { ok: false, reason: 'Kein Ziel.' };
      var dmg = 20 + (target.statuses.vulnerable > 0 ? 10 : 0);
      damageEnemy(run, combat, target, dmg);
      log(combat, 'Feuertrank: ' + dmg + ' Schaden an ' + target.name + '.');
    } else if (id === 'explosive') {
      damageAllRaw(run, combat, 10, 'Explosionstrank');
    } else if (id === 'block') {
      combat.player.block += 12;
      log(combat, '+12 Ruestung.');
    } else if (id === 'strength') {
      combat.player.statuses.strength += 2;
      log(combat, '+2 Staerke.');
    } else if (id === 'swift') {
      drawCards(run, combat, 3);
    } else if (id === 'energy') {
      combat.energy += 2;
      log(combat, '+2 Energie.');
    } else if (id === 'blood') {
      healCombat(run, combat, Math.ceil(combat.player.maxHp * 0.2));
    } else if (id === 'fear') {
      if (!target) return { ok: false, reason: 'Kein Ziel.' };
      applyStatus(target.statuses, 'vulnerable', 3);
      log(combat, target.name + ' erhaelt 3 Verwundbar.');
    } else if (id === 'weak') {
      if (!target) return { ok: false, reason: 'Kein Ziel.' };
      applyStatus(target.statuses, 'weak', 3);
      log(combat, target.name + ' erhaelt 3 Schwach.');
    }
    run.potions[slot] = null;
    syncHp(run, combat);
    checkCombat(combat);
    return { ok: true, message: p.name + ' getrunken.' };
  }

  /* ---------------- Rewards ---------------- */

  function randomCardId(run, rarity) {
    var pool = D.CARD_IDS.filter(function (id) {
      var d = CARDS[id];
      if (d.rarity === 'basic' || d.rarity === 'status' || d.rarity === 'curse') return false;
      if (rarity) return d.rarity === rarity;
      return true;
    });
    if (!pool.length) {
      pool = D.CARD_IDS.filter(function (id) {
        var d = CARDS[id];
        return d.rarity !== 'basic' && d.rarity !== 'status' && d.rarity !== 'curse';
      });
    }
    return pick(run, pool);
  }

  function randomRewardCards(run, count) {
    var out = [];
    var used = {};
    var guard = 0;
    while (out.length < count && guard < 100) {
      guard++;
      var roll = ri(run, 100);
      var rarity = roll < 7 ? 'rare' : roll < 40 ? 'uncommon' : 'common';
      var id = randomCardId(run, rarity);
      if (used[id]) continue;
      used[id] = true;
      out.push(makeCard(run, id, false));
    }
    return out;
  }

  function randomRelic(run, includeBoss) {
    var pool = D.RELIC_IDS.filter(function (id) {
      if (run.relics.indexOf(id) !== -1) return false;
      var r = RELICS[id];
      if (!includeBoss && r.rarity === 'boss') return false;
      return true;
    });
    if (!pool.length) return null;
    return pick(run, pool);
  }

  function addRelic(run, id) {
    if (id && run.relics.indexOf(id) === -1) run.relics.push(id);
    return id;
  }

  function randomPotion(run) {
    return pick(run, D.POTION_IDS);
  }

  function addPotion(run, id) {
    if (!id) return false;
    if (hasRelic(run, 'sozu')) return false;
    for (var i = 0; i < run.potions.length; i++) {
      if (!run.potions[i]) { run.potions[i] = id; return true; }
    }
    return false;
  }

  function buildReward(run, combat) {
    var kind = combat.kind;
    var gold = kind === 'boss' ? 95 + ri(run, 11) : kind === 'elite' ? 25 + ri(run, 11) : 10 + ri(run, 11);
    if (hasRelic(run, 'ectoplasm')) gold = 0;
    if (hasRelic(run, 'burning_blood')) {
      run.hp = Math.min(run.maxHp, run.hp + 6);
    }
    var reward = {
      kind: kind,
      nodeId: combat.nodeId,
      gold: gold,
      goldTaken: false,
      cards: randomRewardCards(run, 3),
      cardTaken: false,
      potion: null,
      potionTaken: false,
      relic: null,
      relicTaken: true,
      bossRelics: [],
      bossTaken: false,
      elite: kind === 'elite',
      boss: kind === 'boss'
    };
    if (kind === 'elite') {
      var rid = randomRelic(run, false);
      if (rid) { addRelic(run, rid); reward.relic = rid; }
      run.elites++;
    }
    if (!hasRelic(run, 'sozu')) {
      var chance = kind === 'boss' ? 100 : kind === 'elite' ? 60 : 40;
      if (ri(run, 100) < chance) reward.potion = randomPotion(run);
    }
    if (kind === 'boss') {
      var pool = D.RELIC_IDS.filter(function (id) {
        return RELICS[id].rarity === 'boss' && run.relics.indexOf(id) === -1;
      });
      shuffle(run, pool);
      reward.bossRelics = pool.slice(0, 3);
      if (!reward.bossRelics.length) {
        var fallback = randomRelic(run, false);
        if (fallback) reward.bossRelics = [fallback];
      }
    }
    return reward;
  }

  function takeRewardCard(run, reward, index) {
    if (reward.cardTaken) return false;
    var c = reward.cards[index];
    if (!c) return false;
    addCard(run, c.id, c.upgraded);
    reward.cardTaken = true;
    return true;
  }

  function takeRewardPotion(run, reward) {
    if (!reward.potion || reward.potionTaken) return false;
    if (!addPotion(run, reward.potion)) return false;
    reward.potionTaken = true;
    return true;
  }

  function takeBossRelic(run, reward, id) {
    if (reward.bossTaken) return false;
    if (reward.bossRelics.indexOf(id) === -1) return false;
    addRelic(run, id);
    reward.bossTaken = true;
    return true;
  }

  function finishReward(run, reward) {
    if (!reward.goldTaken) {
      if (!hasRelic(run, 'ectoplasm')) run.gold += reward.gold;
      reward.goldTaken = true;
    }
    if (reward.potion && !reward.potionTaken) {
      if (addPotion(run, reward.potion)) reward.potionTaken = true;
    }
    if (reward.nodeId) completeNode(run, reward.nodeId);
    return run.won;
  }

  /* ---------------- Deck helpers ---------------- */

  function addCard(run, id, upgraded) {
    var c = makeCard(run, id, upgraded);
    run.deck.push(c);
    return c;
  }

  function removeCard(run, uid) {
    var idx = -1;
    for (var i = 0; i < run.deck.length; i++) if (run.deck[i].uid === uid) { idx = i; break; }
    if (idx === -1) return false;
    run.deck.splice(idx, 1);
    return true;
  }

  function upgradeCard(run, uid) {
    var c = run.deck.find(function (x) { return x.uid === uid; });
    if (!c) return false;
    var def = CARDS[c.id];
    if (c.upgraded || !def.up) return false;
    c.upgraded = true;
    return true;
  }

  function randomUpgrade(run, n) {
    var options = run.deck.filter(function (c) { return !c.upgraded && CARDS[c.id].up; });
    var count = 0;
    for (var i = 0; i < n && options.length; i++) {
      var idx = ri(run, options.length);
      var c = options.splice(idx, 1)[0];
      c.upgraded = true;
      count++;
    }
    return count;
  }

  function randomCurse(run) {
    var curses = D.CARD_IDS.filter(function (id) { return CARDS[id].type === 'curse'; });
    var id = pick(run, curses);
    return addCard(run, id, false);
  }

  function randomRemove(run) {
    if (!run.deck.length) return null;
    var idx = ri(run, run.deck.length);
    var c = run.deck.splice(idx, 1)[0];
    return c;
  }

  /* ---------------- Shop ---------------- */

  function makeShop(run, nodeIdValue) {
    var cards = [];
    var used = {};
    var guard = 0;
    while (cards.length < 5 && guard < 80) {
      guard++;
      var roll = ri(run, 100);
      var rarity = roll < 8 ? 'rare' : roll < 42 ? 'uncommon' : 'common';
      var id = randomCardId(run, rarity);
      if (used[id]) continue;
      used[id] = true;
      var base = rarity === 'rare' ? 145 : rarity === 'uncommon' ? 76 : 48;
      var price = Math.round((base * (0.9 + rng(run) * 0.2)) / 5) * 5;
      cards.push({ card: makeCard(run, id, false), price: price, sold: false });
    }
    var relics = [];
    guard = 0;
    while (relics.length < 3 && guard < 50) {
      guard++;
      var rid = randomRelic(run, false);
      if (!rid) break;
      if (relics.some(function (x) { return x.id === rid; })) continue;
      relics.push({ id: rid, price: 135 + ri(run, 50), sold: false });
    }
    var potions = [];
    for (var p = 0; p < 3; p++) {
      potions.push({ id: randomPotion(run), price: 45 + ri(run, 30), sold: false });
    }
    return {
      nodeId: nodeIdValue,
      cards: cards,
      relics: relics,
      potions: potions,
      removeCost: run.removeCost,
      removeSold: false,
      upgradeCost: 90,
      upgradeSold: false
    };
  }

  function buyShopCard(run, shop, index) {
    var item = shop.cards[index];
    if (!item || item.sold) return { ok: false, reason: 'Bereits verkauft.' };
    if (run.gold < item.price) return { ok: false, reason: 'Nicht genug Gold.' };
    run.gold -= item.price;
    addCard(run, item.card.id, false);
    item.sold = true;
    return { ok: true, message: 'Karte gekauft.' };
  }

  function buyShopRelic(run, shop, index) {
    var item = shop.relics[index];
    if (!item || item.sold) return { ok: false, reason: 'Bereits verkauft.' };
    if (run.gold < item.price) return { ok: false, reason: 'Nicht genug Gold.' };
    if (run.relics.indexOf(item.id) !== -1) return { ok: false, reason: 'Relikt bereits besessen.' };
    run.gold -= item.price;
    addRelic(run, item.id);
    item.sold = true;
    return { ok: true, message: 'Relikt gekauft.' };
  }

  function buyShopPotion(run, shop, index) {
    var item = shop.potions[index];
    if (!item || item.sold) return { ok: false, reason: 'Bereits verkauft.' };
    if (run.gold < item.price) return { ok: false, reason: 'Nicht genug Gold.' };
    if (hasRelic(run, 'sozu')) return { ok: false, reason: 'Sozu verhindert Traenke.' };
    if (!addPotion(run, item.id)) return { ok: false, reason: 'Keine freien Trank-Slots.' };
    run.gold -= item.price;
    item.sold = true;
    return { ok: true, message: 'Trank gekauft.' };
  }

  function shopRemoveCard(run, shop, uid) {
    if (shop.removeSold) return { ok: false, reason: 'Bereits genutzt.' };
    if (run.gold < shop.removeCost) return { ok: false, reason: 'Nicht genug Gold.' };
    if (!removeCard(run, uid)) return { ok: false, reason: 'Karte nicht gefunden.' };
    run.gold -= shop.removeCost;
    shop.removeSold = true;
    run.removeCost += 25;
    return { ok: true, message: 'Karte entfernt.' };
  }

  function shopUpgradeCard(run, shop, uid) {
    if (shop.upgradeCost == null) shop.upgradeCost = 90;
    if (shop.upgradeSold) return { ok: false, reason: 'Bereits genutzt.' };
    if (run.gold < shop.upgradeCost) return { ok: false, reason: 'Nicht genug Gold.' };
    var c = run.deck.find(function (x) { return x.uid === uid; });
    if (!c) return { ok: false, reason: 'Karte nicht gefunden.' };
    if (c.upgraded) return { ok: false, reason: 'Karte ist bereits aufgewertet.' };
    if (!CARDS[c.id].up) return { ok: false, reason: 'Karte ist nicht aufwertbar.' };
    upgradeCard(run, uid);
    run.gold -= shop.upgradeCost;
    shop.upgradeSold = true;
    return { ok: true, message: cardName(c) + ' aufgewertet.' };
  }

  /* ---------------- Rest / events ---------------- */

  function restHeal(run) {
    var amount = Math.floor(run.maxHp * 0.3) + (hasRelic(run, 'regal_pillow') ? 15 : 0);
    var before = run.hp;
    run.hp = Math.min(run.maxHp, run.hp + amount);
    return run.hp - before;
  }

  function smithCard(run, uid) {
    return upgradeCard(run, uid);
  }

  function resolveEvent(run, eventId, choiceIndex) {
    var event = null;
    for (var i = 0; i < D.EVENTS.length; i++) if (D.EVENTS[i].id === eventId) { event = D.EVENTS[i]; break; }
    if (!event) return { ok: false, reason: 'Event nicht gefunden.' };
    var opt = event.options[choiceIndex];
    if (!opt) return { ok: false, reason: 'Ungueltige Wahl.' };
    if (opt.needGold && run.gold < opt.needGold) return { ok: false, reason: 'Nicht genug Gold.' };
    var h = {
      gold: function (n) {
        if (n > 0 && hasRelic(run, 'ectoplasm')) return;
        run.gold = Math.max(0, run.gold + n);
      },
      healPct: function (pct) {
        run.hp = Math.min(run.maxHp, run.hp + Math.ceil(run.maxHp * pct / 100));
      },
      damage: function (n) {
        run.hp = Math.max(1, run.hp - n);
      },
      relic: function () { return addRelic(run, randomRelic(run, false)); },
      curse: function () { return randomCurse(run); },
      potion: function () { return addPotion(run, randomPotion(run)); },
      card: function (rarity) { return addCard(run, randomCardId(run, rarity), false); },
      removeCard: function () { return randomRemove(run); },
      upgradeRandom: function (n) { return randomUpgrade(run, n); },
      maxHp: function (n) { run.maxHp += n; run.hp += n; },
      rng: function () { return rng(run); }
    };
    var text = opt.run(h);
    return { ok: true, text: text, event: event, option: opt };
  }

  /* ---------------- UI helpers ---------------- */

  function statusInfo(key) {
    return D.STATUS[key] || { name: key, art: 'question', desc: '' };
  }

  function intentTooltip(combat, enemy) {
    var info = intentInfo(combat, enemy);
    var out = info.name + ': ' + info.text;
    if (info.attack) out += ' [' + info.dmg + (info.hits > 1 ? 'x' + info.hits : '') + ']';
    if (info.block) out += ' [Block ' + info.block + ']';
    return out;
  }

  function cardPool(rarity) {
    return D.CARD_IDS.filter(function (id) {
      var d = CARDS[id];
      if (d.rarity === 'basic' || d.rarity === 'status' || d.rarity === 'curse') return false;
      return !rarity || d.rarity === rarity;
    });
  }

  window.DFEngine = {
    newRun: newRun,
    generateMap: generateMap,
    rollEncounter: rollEncounter,
    availableNodes: availableNodes,
    enterNode: enterNode,
    completeNode: completeNode,
    startCombat: startCombat,
    playCard: playCard,
    resolvePending: resolvePending,
    endTurn: endTurn,
    usePotion: usePotion,
    buildReward: buildReward,
    takeRewardCard: takeRewardCard,
    takeRewardPotion: takeRewardPotion,
    takeBossRelic: takeBossRelic,
    finishReward: finishReward,
    makeShop: makeShop,
    buyShopCard: buyShopCard,
    buyShopRelic: buyShopRelic,
    buyShopPotion: buyShopPotion,
    shopRemoveCard: shopRemoveCard,
    shopUpgradeCard: shopUpgradeCard,
    restHeal: restHeal,
    smithCard: smithCard,
    resolveEvent: resolveEvent,
    addCard: addCard,
    addRelic: addRelic,
    addPotion: addPotion,
    removeCard: removeCard,
    upgradeCard: upgradeCard,
    randomCardId: randomCardId,
    randomPotion: randomPotion,
    randomRelic: randomRelic,
    cardVals: cardVals,
    cardName: cardName,
    cardDesc: cardDesc,
    cardTypeLabel: cardTypeLabel,
    cardCost: cardCost,
    costNumber: costNumber,
    canPlay: canPlay,
    intentInfo: intentInfo,
    intentTooltip: intentTooltip,
    statusInfo: statusInfo,
    moveFor: moveFor,
    hasRelic: hasRelic,
    rarityLabel: rarityLabel,
    cardPool: cardPool,
    aliveEnemies: aliveEnemies,
    statusName: statusName
  };
})();
