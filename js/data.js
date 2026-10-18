/* DeckForge - Kartendaten, Relikte, Traenke, Gegner und Events. */
(function () {
  'use strict';

  var CARDS = {
    /* ---------- Startdeck ---------- */
    strike: {
      id: 'strike', name: 'Schlag', type: 'attack', rarity: 'basic', cost: 1, target: 'enemy', art: 'sword',
      dmg: 6, desc: 'Verursacht {dmg} Schaden.',
      up: { dmg: 9 },
      play: function (a, v, t) { a.attack(t, v.dmg); }
    },
    defend: {
      id: 'defend', name: 'Verteidigung', type: 'skill', rarity: 'basic', cost: 1, target: 'self', art: 'shield',
      block: 5, desc: 'Erhaelt {block} Ruestung.',
      up: { block: 8 },
      play: function (a, v) { a.block(v.block); }
    },
    bash: {
      id: 'bash', name: 'Schmetterhieb', type: 'attack', rarity: 'basic', cost: 2, target: 'enemy', art: 'fist',
      dmg: 8, magic: 2, desc: 'Verursacht {dmg} Schaden. |Verleiht {magic} Verwundbar.',
      up: { dmg: 10, magic: 3 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.applyTo(t, 'vulnerable', v.magic); }
    },

    /* ---------- Angriffe ---------- */
    anger: {
      id: 'anger', name: 'Zorn', type: 'attack', rarity: 'common', cost: 0, target: 'enemy', art: 'flame',
      dmg: 6, desc: 'Verursacht {dmg} Schaden. |Legt eine Kopie auf den Ablagestapel.',
      up: { dmg: 8 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.addCard('anger', 'discard'); }
    },
    body_slam: {
      id: 'body_slam', name: 'Koerperstoss', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'fist',
      desc: 'Verursacht Schaden in Hoehe deiner Ruestung.',
      up: { cost: 0 },
      play: function (a, v, t) { a.attack(t, a.player.block); }
    },
    clash: {
      id: 'clash', name: 'Zusammenprall', type: 'attack', rarity: 'common', cost: 0, target: 'enemy', art: 'sword',
      dmg: 14, desc: 'Nur spielbar, wenn alle Karten in der Hand Angriffe sind. |Verursacht {dmg} Schaden.',
      up: { dmg: 18 },
      condition: function (combat) {
        return combat.hand.every(function (c) { return CARDS[c.id].type === 'attack'; });
      },
      play: function (a, v, t) { a.attack(t, v.dmg); }
    },
    cleave: {
      id: 'cleave', name: 'Spalten', type: 'attack', rarity: 'common', cost: 1, target: 'all', art: 'sword',
      dmg: 8, desc: 'Verursacht {dmg} Schaden an allen Gegnern.',
      up: { dmg: 11 },
      play: function (a, v) { a.attackAll(v.dmg); }
    },
    clothesline: {
      id: 'clothesline', name: 'Wringgriff', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', art: 'fist',
      dmg: 12, magic: 2, desc: 'Verursacht {dmg} Schaden. |Verleiht {magic} Schwach.',
      up: { dmg: 14, magic: 3 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.applyTo(t, 'weak', v.magic); }
    },
    headbutt: {
      id: 'headbutt', name: 'Kopfnuss', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'fist',
      dmg: 9, desc: 'Verursacht {dmg} Schaden. |Lege eine Karte aus dem Ablagestapel auf den Ziehstapel.',
      up: { dmg: 12 },
      play: function (a, v, t) {
        a.attack(t, v.dmg);
        if (a.combat.discardPile.length) a.pending('headbutt');
      }
    },
    heavy_blade: {
      id: 'heavy_blade', name: 'Schwere Klinge', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', art: 'sword',
      dmg: 14, strmult: 3, desc: 'Verursacht {dmg} Schaden. |Staerke zaehlt {strmult}-fach.',
      up: { strmult: 5 },
      play: function (a, v, t) { a.attack(t, v.dmg, { strMult: v.strmult }); }
    },
    iron_wave: {
      id: 'iron_wave', name: 'Eisenwelle', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'shield',
      dmg: 5, block: 5, desc: 'Verursacht {dmg} Schaden. |Erhaelt {block} Ruestung.',
      up: { dmg: 7, block: 7 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.block(v.block); }
    },
    perfected_strike: {
      id: 'perfected_strike', name: 'Perfekter Hieb', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', art: 'sword',
      dmg: 6, magic: 2, desc: 'Verursacht {dmg} Schaden plus {magic} pro Schlag im Deck.',
      up: { magic: 3 },
      play: function (a, v, t) { a.attack(t, v.dmg + a.countStrikes() * v.magic); }
    },
    pommel_strike: {
      id: 'pommel_strike', name: 'Knaufstoss', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'sword',
      dmg: 9, magic: 1, desc: 'Verursacht {dmg} Schaden. |Ziehe {magic} Karte.',
      up: { dmg: 10, magic: 2 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.draw(v.magic); }
    },
    sword_boomerang: {
      id: 'sword_boomerang', name: 'Schwertbumerang', type: 'attack', rarity: 'common', cost: 1, target: 'none', art: 'sword',
      dmg: 3, hits: 3, desc: 'Verursacht {dmg} Schaden an zufaelligen Gegnern, {hits} Mal.',
      up: { hits: 4 },
      play: function (a, v) { a.attackRandom(v.dmg, v.hits); }
    },
    thunderclap: {
      id: 'thunderclap', name: 'Donnerklatschen', type: 'attack', rarity: 'common', cost: 1, target: 'all', art: 'bolt',
      dmg: 4, magic: 1, desc: 'Verursacht {dmg} Schaden an allen Gegnern. |Verleiht allen {magic} Verwundbar.',
      up: { dmg: 7 },
      play: function (a, v) { a.attackAll(v.dmg); a.applyAll('vulnerable', v.magic); }
    },
    twin_strike: {
      id: 'twin_strike', name: 'Doppelhieb', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'sword',
      dmg: 5, hits: 2, desc: 'Verursacht {dmg} Schaden, {hits} Mal.',
      up: { dmg: 7 },
      play: function (a, v, t) { a.attack(t, v.dmg, { hits: v.hits }); }
    },
    wild_strike: {
      id: 'wild_strike', name: 'Wilder Hieb', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', art: 'claw',
      dmg: 12, desc: 'Verursacht {dmg} Schaden. |Lege eine Wunde auf den Ablagestapel.',
      up: { dmg: 17 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.addCard('wound', 'discard'); }
    },
    reckless_charge: {
      id: 'reckless_charge', name: 'Stuermischer Angriff', type: 'attack', rarity: 'common', cost: 0, target: 'enemy', art: 'flame',
      dmg: 7, desc: 'Verursacht {dmg} Schaden. |Lege eine Benommenheit auf den Ziehstapel.',
      up: { dmg: 10 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.addCard('dazed', 'draw'); }
    },
    rampage: {
      id: 'rampage', name: 'Raserei', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'flame',
      dmg: 8, magic: 5, desc: 'Verursacht {dmg} Schaden. |Erhoeht den Schaden dieser Karte in diesem Kampf um {magic}.',
      up: { magic: 8 },
      play: function (a, v, t) {
        var bonus = a.inst.rampage || 0;
        a.attack(t, v.dmg + bonus);
        a.inst.rampage = bonus + v.magic;
      }
    },
    uppercut: {
      id: 'uppercut', name: 'Aufwaertshaken', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy', art: 'fist',
      dmg: 13, magic: 1, desc: 'Verursacht {dmg} Schaden. |Verleiht {magic} Schwach und {magic} Verwundbar.',
      up: { magic: 2 },
      play: function (a, v, t) { a.attack(t, v.dmg); a.applyTo(t, 'weak', v.magic); a.applyTo(t, 'vulnerable', v.magic); }
    },
    whirlwind: {
      id: 'whirlwind', name: 'Wirbelwind', type: 'attack', rarity: 'uncommon', cost: 'X', target: 'all', art: 'aura',
      dmg: 5, desc: 'Verursacht {dmg} Schaden an allen Gegnern fuer jedes Energiesegment.',
      up: { dmg: 8 },
      play: function (a, v) { for (var i = 0; i < a.x; i++) a.attackAll(v.dmg); }
    },
    dropkick: {
      id: 'dropkick', name: 'Tritt', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'fist',
      dmg: 5, desc: 'Verursacht {dmg} Schaden. |Wenn der Gegner verwundbar ist: +1 Energie und ziehe 1 Karte.',
      up: { dmg: 8 },
      play: function (a, v, t) {
        var vuln = t && t.statuses.vulnerable > 0;
        a.attack(t, v.dmg);
        if (vuln) { a.energy(1); a.draw(1); }
      }
    },
    hemokinesis: {
      id: 'hemokinesis', name: 'Blutkinese', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'heart',
      dmg: 15, magic: 2, desc: 'Verliere {magic} HP. |Verursacht {dmg} Schaden.',
      up: { dmg: 20 },
      play: function (a, v, t) { a.loseHp(v.magic); a.attack(t, v.dmg); }
    },
    bludgeon: {
      id: 'bludgeon', name: 'Keule', type: 'attack', rarity: 'rare', cost: 3, target: 'enemy', art: 'fist',
      dmg: 32, desc: 'Verursacht {dmg} Schaden.',
      up: { dmg: 42 },
      play: function (a, v, t) { a.attack(t, v.dmg); }
    },
    feed: {
      id: 'feed', name: 'Fressen', type: 'attack', rarity: 'rare', cost: 1, target: 'enemy', art: 'skull',
      dmg: 10, magic: 3, exhaust: true, desc: 'Verursacht {dmg} Schaden. |Wenn dies toetet: +{magic} max. HP. |Erschoepft.',
      up: { dmg: 12, magic: 4 },
      play: function (a, v, t) {
        var r = a.attack(t, v.dmg);
        if (r && r.killed) a.gainMaxHp(v.magic);
      }
    },
    reaper: {
      id: 'reaper', name: 'Schnitter', type: 'attack', rarity: 'rare', cost: 2, target: 'all', art: 'skull',
      dmg: 4, exhaust: true, desc: 'Verursacht {dmg} Schaden an allen Gegnern. |Heilt um den zugefuegten Schaden. |Erschoepft.',
      up: { dmg: 5 },
      play: function (a, v) { var total = a.attackAll(v.dmg); if (total > 0) a.heal(total); }
    },
    fiend_fire: {
      id: 'fiend_fire', name: 'Teufelsfeuer', type: 'attack', rarity: 'rare', cost: 2, target: 'none', art: 'flame',
      dmg: 7, exhaust: true, desc: 'Erschoepft deine Hand. |Verursacht {dmg} Schaden pro erschoepfter Karte an zufaelligen Gegnern. |Erschoepft.',
      up: { dmg: 10 },
      play: function (a, v) {
        var n = a.exhaustHand();
        for (var i = 0; i < n; i++) a.attackRandom(v.dmg, 1);
      }
    },
    immolate: {
      id: 'immolate', name: 'Einaeschern', type: 'attack', rarity: 'rare', cost: 2, target: 'all', art: 'flame',
      dmg: 21, desc: 'Verursacht {dmg} Schaden an allen Gegnern. |Lege eine Verbrennung auf den Ablagestapel.',
      up: { dmg: 28 },
      play: function (a, v) { a.attackAll(v.dmg); a.addCard('burn', 'discard'); }
    },

    /* ---------- Fertigkeiten ---------- */
    armaments: {
      id: 'armaments', name: 'Waffenaufwertung', type: 'skill', rarity: 'common', cost: 1, target: 'self', art: 'shield',
      block: 5, desc: 'Erhaelt {block} Ruestung. |Werte eine zufaellige Karte in der Hand auf.',
      up: { block: 8, upgradeAll: true },
      play: function (a, v) {
        a.block(v.block);
        if (v.upgradeAll) a.upgradeAllHand(); else a.upgradeRandomHand(1);
      }
    },
    flex: {
      id: 'flex', name: 'Flexen', type: 'skill', rarity: 'common', cost: 0, target: 'self', art: 'fist',
      magic: 2, desc: 'Erhaelt {magic} Staerke bis zum Ende des Zuges.',
      up: { magic: 4 },
      play: function (a, v) { a.tempStrength(v.magic); }
    },
    ghostly_armor: {
      id: 'ghostly_armor', name: 'Geisterruestung', type: 'skill', rarity: 'common', cost: 1, target: 'self', art: 'shield',
      block: 10, ethereal: true, desc: 'Erhaelt {block} Ruestung. |Aetherisch.',
      up: { block: 13 },
      play: function (a, v) { a.block(v.block); }
    },
    shrug_it_off: {
      id: 'shrug_it_off', name: 'Abschuetteln', type: 'skill', rarity: 'common', cost: 1, target: 'self', art: 'shield',
      block: 8, magic: 1, desc: 'Erhaelt {block} Ruestung. |Ziehe {magic} Karte.',
      up: { block: 11 },
      play: function (a, v) { a.block(v.block); a.draw(v.magic); }
    },
    true_grit: {
      id: 'true_grit', name: 'Wahre Haerte', type: 'skill', rarity: 'common', cost: 1, target: 'self', art: 'shield',
      block: 7, desc: 'Erhaelt {block} Ruestung. |Erschoepfe eine zufaellige Karte in der Hand.',
      up: { block: 9, choose: true },
      play: function (a, v) {
        a.block(v.block);
        if (v.choose) {
          if (a.combat.hand.length) a.pending('true_grit');
        } else {
          a.exhaustRandomHand(1);
        }
      }
    },
    burning_pact: {
      id: 'burning_pact', name: 'Brennender Pakt', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', art: 'flame',
      magic: 2, desc: 'Erschoepfe 1 Karte in der Hand. |Ziehe {magic} Karten.',
      up: { magic: 3 },
      play: function (a, v) {
        if (a.combat.hand.length) a.pending('burning_pact');
        else a.draw(v.magic);
      }
    },
    bloodletting: {
      id: 'bloodletting', name: 'Aderlass', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', art: 'heart',
      magic: 2, desc: 'Verliere 3 HP. |Erhalte {magic} Energie.',
      up: { magic: 3 },
      play: function (a, v) { a.loseHp(3); a.energy(v.magic); }
    },
    battle_trance: {
      id: 'battle_trance', name: 'Kampftrance', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', art: 'eye',
      magic: 3, desc: 'Ziehe {magic} Karten. |Du kannst diesen Zug keine weiteren Karten ziehen.',
      up: { magic: 4 },
      play: function (a, v) { a.draw(v.magic); a.player.noDraw = true; }
    },
    warcry: {
      id: 'warcry', name: 'Kriegsschrei', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', art: 'skull',
      magic: 1, exhaust: true, desc: 'Ziehe {magic} Karte. |Lege eine Karte aus der Hand auf den Ziehstapel. |Erschoepft.',
      up: { magic: 2 },
      play: function (a, v) {
        a.draw(v.magic);
        if (a.combat.hand.length) a.pending('warcry');
      }
    },
    power_through: {
      id: 'power_through', name: 'Durchbruch', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', art: 'shield',
      block: 15, desc: 'Erhaelt {block} Ruestung. |Lege 2 Wunden auf die Hand.',
      up: { block: 20 },
      play: function (a, v) { a.block(v.block); a.addCard('wound', 'hand', 2); }
    },
    second_wind: {
      id: 'second_wind', name: 'Zweiter Wind', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', art: 'aura',
      magic: 5, desc: 'Erschoepfe alle Nicht-Angriffe in der Hand. |Erhalte {magic} Ruestung pro Karte.',
      up: { magic: 7 },
      play: function (a, v) {
        var n = a.exhaustHand(function (c) { return CARDS[c.id].type !== 'attack'; });
        if (n) a.block(n * v.magic);
      }
    },
    entrench: {
      id: 'entrench', name: 'Verschanzen', type: 'skill', rarity: 'uncommon', cost: 2, target: 'self', art: 'shield',
      desc: 'Verdopple deine Ruestung.',
      up: { cost: 1 },
      play: function (a) { a.doubleBlock(); }
    },
    disarm: {
      id: 'disarm', name: 'Entwaffnen', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'claw',
      magic: 2, exhaust: true, desc: 'Der Gegner verliert {magic} Staerke. |Erschoepft.',
      up: { magic: 3 },
      play: function (a, v, t) { a.applyTo(t, 'strength', -v.magic); }
    },
    intimidate: {
      id: 'intimidate', name: 'Einschuechtern', type: 'skill', rarity: 'uncommon', cost: 0, target: 'all', art: 'skull',
      magic: 1, exhaust: true, desc: 'Verleiht allen Gegnern {magic} Schwach. |Erschoepft.',
      up: { magic: 2 },
      play: function (a, v) { a.applyAll('weak', v.magic); }
    },
    shockwave: {
      id: 'shockwave', name: 'Schockwelle', type: 'skill', rarity: 'uncommon', cost: 2, target: 'all', art: 'bolt',
      magic: 3, exhaust: true, desc: 'Verleiht allen Gegnern {magic} Schwach und {magic} Verwundbar. |Erschoepft.',
      up: { magic: 5 },
      play: function (a, v) { a.applyAll('weak', v.magic); a.applyAll('vulnerable', v.magic); }
    },
    spot_weakness: {
      id: 'spot_weakness', name: 'Schwaeche entdecken', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'eye',
      magic: 3, desc: 'Wenn der Gegner angreifen will: +{magic} Staerke.',
      up: { magic: 4 },
      play: function (a, v, t) { if (a.intentIsAttack(t)) a.apply('strength', v.magic); }
    },
    rage: {
      id: 'rage', name: 'Wut', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', art: 'flame',
      magic: 3, desc: 'Jedes Mal, wenn du diesen Zug einen Angriff spielst: +{magic} Ruestung.',
      up: { magic: 5 },
      play: function (a, v) { a.power('rage', v.magic); }
    },
    inflame: {
      id: 'inflame', name: 'Entfachen', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'flame',
      magic: 2, desc: 'Erhalte {magic} Staerke.',
      up: { magic: 3 },
      play: function (a, v) { a.apply('strength', v.magic); }
    },
    metallicize: {
      id: 'metallicize', name: 'Metallisieren', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'shield',
      magic: 3, desc: 'Erhalte am Ende deines Zuges {magic} Ruestung.',
      up: { magic: 4 },
      play: function (a, v) { a.power('metallicize', v.magic); }
    },
    flame_barrier: {
      id: 'flame_barrier', name: 'Flammenbarriere', type: 'power', rarity: 'uncommon', cost: 2, target: 'self', art: 'flame',
      magic: 4, desc: 'Erhalte {magic} Dornen.',
      up: { magic: 6 },
      play: function (a, v) { a.power('thorns', v.magic); a.power('flameBarrier', v.magic); }
    },
    combust: {
      id: 'combust', name: 'Verbrennung', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'flame',
      magic: 5, desc: 'Am Ende deines Zuges: Verliere 1 HP und verursache {magic} Schaden an allen Gegnern.',
      up: { magic: 7 },
      play: function (a, v) { a.power('combust', v.magic); }
    },
    evolve: {
      id: 'evolve', name: 'Evolution', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'eye',
      magic: 1, desc: 'Wenn du eine Statuskarte ziehst: Ziehe {magic} Karte.',
      up: { magic: 2 },
      play: function (a, v) { a.power('evolve', v.magic); }
    },
    feel_no_pain: {
      id: 'feel_no_pain', name: 'Schmerzlosigkeit', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'shield',
      magic: 3, desc: 'Wenn eine Karte erschoepft wird: +{magic} Ruestung.',
      up: { magic: 4 },
      play: function (a, v) { a.power('feelNoPain', v.magic); }
    },
    fire_breathing: {
      id: 'fire_breathing', name: 'Feueratem', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'flame',
      magic: 6, desc: 'Wenn du eine Statuskarte ziehst: {magic} Schaden an allen Gegnern.',
      up: { magic: 10 },
      play: function (a, v) { a.power('fireBreathing', v.magic); }
    },
    juggernaut: {
      id: 'juggernaut', name: 'Koloss', type: 'power', rarity: 'rare', cost: 2, target: 'self', art: 'fist',
      magic: 5, desc: 'Wenn du Ruestung erhaeltst: {magic} Schaden an einem zufaelligen Gegner.',
      up: { magic: 7 },
      play: function (a, v) { a.power('juggernaut', v.magic); }
    },
    dark_embrace: {
      id: 'dark_embrace', name: 'Dunkle Umarmung', type: 'power', rarity: 'uncommon', cost: 2, target: 'self', art: 'aura',
      magic: 1, desc: 'Wenn eine Karte erschoepft wird: Ziehe {magic} Karte.',
      up: { cost: 1 },
      play: function (a, v) { a.power('darkEmbrace', v.magic); }
    },
    rupture: {
      id: 'rupture', name: 'Riss', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', art: 'heart',
      magic: 1, desc: 'Wenn du durch eine Karte HP verlierst: +{magic} Staerke.',
      up: { magic: 2 },
      play: function (a, v) { a.power('rupture', v.magic); }
    },
    barricade: {
      id: 'barricade', name: 'Barrikade', type: 'power', rarity: 'rare', cost: 3, target: 'self', art: 'shield',
      desc: 'Ruestung wird zu Beginn deines Zuges nicht entfernt.',
      up: { cost: 2 },
      play: function (a) { a.power('barricade', 1); }
    },
    berserk: {
      id: 'berserk', name: 'Berserker', type: 'power', rarity: 'rare', cost: 0, target: 'self', art: 'flame',
      magic: 2, desc: 'Erhalte {magic} Verwundbar. |+1 Energie pro Zug.',
      up: { magic: 1 },
      play: function (a, v) { a.apply('vulnerable', v.magic); a.power('berserk', 1); }
    },
    brutality: {
      id: 'brutality', name: 'Brutalitaet', type: 'power', rarity: 'rare', cost: 0, target: 'self', art: 'heart',
      desc: 'Zu Beginn deines Zuges: Verliere 1 HP und ziehe 1 Karte.',
      up: { innate: true },
      play: function (a) { a.power('brutality', 1); }
    },
    demon_form: {
      id: 'demon_form', name: 'Daemonenform', type: 'power', rarity: 'rare', cost: 3, target: 'self', art: 'flame',
      magic: 2, desc: 'Zu Beginn deines Zuges: +{magic} Staerke.',
      up: { magic: 3 },
      play: function (a, v) { a.power('demonForm', v.magic); }
    },
    corruption: {
      id: 'corruption', name: 'Verderbnis', type: 'power', rarity: 'rare', cost: 3, target: 'self', art: 'aura',
      desc: 'Fertigkeiten kosten 0 Energie und werden erschoepft.',
      up: { cost: 2 },
      play: function (a) { a.power('corruption', 1); }
    },

    /* ---------- Weitere Fertigkeiten ---------- */
    limit_break: {
      id: 'limit_break', name: 'Grenzueberschreitung', type: 'skill', rarity: 'rare', cost: 1, target: 'self', art: 'fist',
      exhaust: true, desc: 'Verdopple deine Staerke. |Erschoepft.',
      up: { exhaust: false },
      play: function (a) { a.doubleStrength(); }
    },
    offering: {
      id: 'offering', name: 'Opfergabe', type: 'skill', rarity: 'rare', cost: 0, target: 'self', art: 'heart',
      magic: 6, exhaust: true, desc: 'Verliere {magic} HP. |+2 Energie, ziehe 3 Karten. |Erschoepft.',
      up: { magic: 5 },
      play: function (a, v) { a.loseHp(v.magic); a.energy(2); a.draw(3); }
    },
    impervious: {
      id: 'impervious', name: 'Undurchdringlich', type: 'skill', rarity: 'rare', cost: 2, target: 'self', art: 'shield',
      block: 30, exhaust: true, desc: 'Erhaelt {block} Ruestung. |Erschoepft.',
      up: { block: 40 },
      play: function (a, v) { a.block(v.block); }
    },
    double_tap: {
      id: 'double_tap', name: 'Doppelter Hieb', type: 'skill', rarity: 'rare', cost: 1, target: 'self', art: 'sword',
      desc: 'Der naechste Angriff wird zweimal gespielt.',
      up: { cost: 0 },
      play: function (a) { a.power('doubleTap', 1); }
    },
    sentinel: {
      id: 'sentinel', name: 'Waechter', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', art: 'shield',
      block: 5, magic: 2, desc: 'Erhaelt {block} Ruestung. |Wenn erschoepft: +{magic} Energie.',
      up: { block: 8 },
      play: function (a, v) { a.block(v.block); }
    },

    /* ---------- Statuskarten ---------- */
    wound: {
      id: 'wound', name: 'Wunde', type: 'status', rarity: 'status', cost: null, target: 'none', art: 'skull',
      unplayable: true, desc: 'Nicht spielbar.', up: null, play: function () {}
    },
    dazed: {
      id: 'dazed', name: 'Benommenheit', type: 'status', rarity: 'status', cost: null, target: 'none', art: 'aura',
      unplayable: true, ethereal: true, desc: 'Nicht spielbar. |Aetherisch.', up: null, play: function () {}
    },
    burn: {
      id: 'burn', name: 'Verbrennung', type: 'status', rarity: 'status', cost: null, target: 'none', art: 'flame',
      unplayable: true, endTurnDamage: 2, desc: 'Nicht spielbar. |Am Zugende: 2 Schaden.', up: null, play: function () {}
    },
    slimed: {
      id: 'slimed', name: 'Schleim', type: 'status', rarity: 'status', cost: 1, target: 'self', art: 'slime',
      exhaust: true, desc: 'Kostet 1 Energie. |Erschoepft.', up: null, play: function () {}
    },
    void: {
      id: 'void', name: 'Leere', type: 'status', rarity: 'status', cost: null, target: 'none', art: 'eye',
      unplayable: true, onDrawEnergy: -1, desc: 'Nicht spielbar. |Beim Ziehen: -1 Energie.', up: null, play: function () {}
    },

    /* ---------- Flueche ---------- */
    regret: {
      id: 'regret', name: 'Reue', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'eye',
      unplayable: true, endTurnRegret: true, desc: 'Nicht spielbar. |Am Zugende: Verliere 1 HP pro Handkarte.', up: null, play: function () {}
    },
    doubt: {
      id: 'doubt', name: 'Zweifel', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'eye',
      unplayable: true, endTurnWeak: 1, desc: 'Nicht spielbar. |Am Zugende: Erhalte 1 Schwach.', up: null, play: function () {}
    },
    decay: {
      id: 'decay', name: 'Verfall', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'skull',
      unplayable: true, endTurnDamage: 2, desc: 'Nicht spielbar. |Am Zugende: 2 Schaden.', up: null, play: function () {}
    },
    pain: {
      id: 'pain', name: 'Schmerz', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'thorns',
      unplayable: true, onPlayLoseHp: 1, desc: 'Nicht spielbar. |Beim Ausspielen einer Karte: Verliere 1 HP.', up: null, play: function () {}
    },
    shame: {
      id: 'shame', name: 'Schande', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'eye',
      unplayable: true, endTurnWeak: 1, desc: 'Nicht spielbar. |Am Zugende: Erhalte 1 Schwach.', up: null, play: function () {}
    },
    clumsy: {
      id: 'clumsy', name: 'Tollpatsch', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'aura',
      unplayable: true, ethereal: true, desc: 'Nicht spielbar. |Aetherisch.', up: null, play: function () {}
    },
    normality: {
      id: 'normality', name: 'Normalitaet', type: 'curse', rarity: 'curse', cost: null, target: 'none', art: 'chain',
      unplayable: true, limit: 3, desc: 'Nicht spielbar. |Du kannst pro Zug maximal 3 Karten spielen.', up: null, play: function () {}
    }
  };

  var STATUS = {
    strength: { name: 'Staerke', short: 'ST', art: 'fist', desc: 'Erhoeht den Schaden jedes Treffers um X.' },
    dexterity: { name: 'Geschick', short: 'GE', art: 'bolt', desc: 'Erhoeht Ruestung durch Karten um X.' },
    weak: { name: 'Schwach', short: 'SW', art: 'debuff', desc: 'Verursacht 25% weniger Schaden.' },
    vulnerable: { name: 'Verwundbar', short: 'VW', art: 'skull', desc: 'Erleidet 50% mehr Schaden.' },
    ritual: { name: 'Ritual', short: 'RI', art: 'aura', desc: 'Erhaelt am Zugende X Staerke.' },
    metallicize: { name: 'Metallisieren', short: 'ME', art: 'shield', desc: 'Erhaelt am Zugende X Ruestung.' },
    thorns: { name: 'Dornen', short: 'DO', art: 'thorns', desc: 'Fuegt Angreifern X Schaden zu.' },
    flameBarrier: { name: 'Flammenbarriere', short: 'FB', art: 'flame', desc: 'Fuegt Angreifern X Schaden zu.' },
    barricade: { name: 'Barrikade', short: 'BA', art: 'shield', desc: 'Ruestung verfaellt nicht.' },
    demonForm: { name: 'Daemonenform', short: 'DF', art: 'flame', desc: 'Am Zugbeginn +X Staerke.' },
    combust: { name: 'Verbrennung', short: 'VB', art: 'flame', desc: 'Am Zugende: 1 HP verlieren, X Schaden an alle.' },
    juggernaut: { name: 'Koloss', short: 'KO', art: 'fist', desc: 'Beim Ruestungsgewinn: X Schaden.' },
    rage: { name: 'Wut', short: 'WU', art: 'flame', desc: 'Angriffe geben diesen Zug X Ruestung.' },
    doubleTap: { name: 'Doppelter Hieb', short: 'DT', art: 'sword', desc: 'Der naechste Angriff wirkt zweimal.' },
    entangle: { name: 'Umstrickt', short: 'UM', art: 'chain', desc: 'Du kannst keine Angriffe spielen.' },
    enrage: { name: 'Wutausbruch', short: 'WA', art: 'buff', desc: 'Erhaelt Staerke, wenn du eine Fertigkeit spielst.' },
    brutality: { name: 'Brutalitaet', short: 'BR', art: 'heart', desc: 'Zugbeginn: 1 HP verlieren, 1 Karte ziehen.' },
    rupture: { name: 'Riss', short: 'RS', art: 'heart', desc: 'Bei HP-Verlust durch Karten: +X Staerke.' },
    corruption: { name: 'Verderbnis', short: 'VE', art: 'aura', desc: 'Fertigkeiten kosten 0 und erschoepfen.' },
    evolve: { name: 'Evolution', short: 'EV', art: 'eye', desc: 'Statuskarten ziehen Karten.' },
    fireBreathing: { name: 'Feueratem', short: 'FA', art: 'flame', desc: 'Statuskarten verursachen Schaden.' },
    feelNoPain: { name: 'Schmerzlosigkeit', short: 'SN', art: 'shield', desc: 'Erschoepfen gibt Ruestung.' },
    darkEmbrace: { name: 'Dunkle Umarmung', short: 'DU', art: 'aura', desc: 'Erschoepfen zieht Karten.' },
    redSkull: { name: 'Roter Schaedel', short: 'RS', art: 'skull', desc: '+3 Staerke unter 50% HP.' },
    noDraw: { name: 'Kein Nachziehen', short: 'NZ', art: 'debuff', desc: 'Keine weiteren Karten in diesem Zug.' }
  };

  var RELICS = {
    burning_blood: { id: 'burning_blood', name: 'Brennendes Blut', rarity: 'starter', art: 'heart', desc: 'Heilt 6 HP nach jedem gewonnenen Kampf.' },
    vajra: { id: 'vajra', name: 'Vajra', rarity: 'common', art: 'fist', desc: 'Zu Beginn jedes Kampfes: +1 Staerke.' },
    anchor: { id: 'anchor', name: 'Anker', rarity: 'common', art: 'shield', desc: 'Zu Beginn jedes Kampfes: 10 Ruestung.' },
    bag_preparation: { id: 'bag_preparation', name: 'Reisetasche', rarity: 'common', art: 'bag', desc: 'Ziehe in der ersten Runde 2 zusaetzliche Karten.' },
    blood_vial: { id: 'blood_vial', name: 'Blutflaeschchen', rarity: 'common', art: 'potion', desc: 'Heilt zu Beginn jedes Kampfes 2 HP.' },
    lantern: { id: 'lantern', name: 'Laterne', rarity: 'common', art: 'flame', desc: 'In der ersten Runde: +1 Energie.' },
    bronze_scales: { id: 'bronze_scales', name: 'Bronzeschuppen', rarity: 'uncommon', art: 'thorns', desc: 'Erhalte zu Beginn jedes Kampfes 3 Dornen.' },
    smooth_stone: { id: 'smooth_stone', name: 'Glatter Stein', rarity: 'uncommon', art: 'relic', desc: 'Zu Beginn jedes Kampfes: +1 Geschick.' },
    happy_flower: { id: 'happy_flower', name: 'Gluecksblume', rarity: 'uncommon', art: 'aura', desc: 'Alle 3 Zuege: +1 Energie.' },
    orichalcum: { id: 'orichalcum', name: 'Orichalcum', rarity: 'uncommon', art: 'shield', desc: 'Wenn du den Zug ohne Ruestung beendest: +6 Ruestung.' },
    red_skull: { id: 'red_skull', name: 'Roter Schaedel', rarity: 'uncommon', art: 'skull', desc: 'Unter 50% HP: +3 Staerke.' },
    regal_pillow: { id: 'regal_pillow', name: 'Koenigliches Kissen', rarity: 'common', art: 'crown', desc: 'Rasten heilt 15 zusaetzliche HP.' },
    ectoplasm: { id: 'ectoplasm', name: 'Ektoplasma', rarity: 'boss', art: 'aura', desc: 'Boss-Relikt: +1 Energie. Kein Gold mehr.' },
    sozu: { id: 'sozu', name: 'Sozu', rarity: 'boss', art: 'potion', desc: 'Boss-Relikt: +1 Energie. Keine Traenke mehr.' },
    philosophers_stone: { id: 'philosophers_stone', name: 'Stein der Weisen', rarity: 'boss', art: 'relic', desc: 'Boss-Relikt: +1 Energie. Gegner starten mit +1 Staerke.' }
  };

  var POTIONS = {
    fire: { id: 'fire', name: 'Feuertrank', art: 'flame', desc: 'Fuegt einem Gegner 20 Schaden zu.' },
    block: { id: 'block', name: 'Blocktrank', art: 'shield', desc: 'Erhalte 12 Ruestung.' },
    strength: { id: 'strength', name: 'Staerketrank', art: 'fist', desc: 'Erhalte 2 Staerke.' },
    swift: { id: 'swift', name: 'Flinkheitstrank', art: 'bolt', desc: 'Ziehe 3 Karten.' },
    energy: { id: 'energy', name: 'Energietrank', art: 'energy', desc: 'Erhalte 2 Energie.' },
    blood: { id: 'blood', name: 'Bluttrank', art: 'heart', desc: 'Heile 20% deiner max. HP.' },
    fear: { id: 'fear', name: 'Angsttrank', art: 'skull', desc: 'Verleihe einem Gegner 3 Verwundbar.' },
    weak: { id: 'weak', name: 'Schwaechetrank', art: 'debuff', desc: 'Verleihe einem Gegner 3 Schwach.' },
    explosive: { id: 'explosive', name: 'Explosionstrank', art: 'flame', desc: 'Fuegt allen Gegnern 10 Schaden zu.' }
  };

  var ENEMIES = {
    cultist: {
      id: 'cultist', name: 'Kultist', hp: [48, 54], art: 'cultist', kind: 'normal',
      moves: {
        incantation: { name: 'Beschwoerung', type: 'buff', self: { ritual: 3 }, text: 'Erhaelt 3 Ritual.' },
        dark_strike: { name: 'Dunkler Schlag', type: 'attack', dmg: 6, text: 'Verursacht 6 Schaden.' }
      },
      ai: function (e, c, rng) { return e.turns === 0 ? 'incantation' : 'dark_strike'; }
    },
    jawworm: {
      id: 'jawworm', name: 'Kieferwurm', hp: [42, 46], art: 'jawworm', kind: 'normal',
      moves: {
        chomp: { name: 'Zubeissen', type: 'attack', dmg: 11, text: 'Verursacht 11 Schaden.' },
        thrash: { name: 'Wildern', type: 'attack_defend', dmg: 7, block: 5, text: 'Verursacht 7 Schaden. Erhaelt 5 Ruestung.' },
        bellow: { name: 'Bruellen', type: 'defend_buff', block: 6, self: { strength: 3 }, text: 'Erhaelt 6 Ruestung und 3 Staerke.' }
      },
      ai: function (e, c, rng) {
        if (e.turns === 0) return 'chomp';
        if (e.turns % 4 === 0) return 'bellow';
        return rng() < 0.55 ? 'chomp' : 'thrash';
      }
    },
    louse: {
      id: 'louse', name: 'Laus', hp: [11, 15], art: 'louse', kind: 'normal',
      moves: {
        bite: { name: 'Biss', type: 'attack', dmg: 6, text: 'Verursacht 6 Schaden.' },
        grow: { name: 'Wachsen', type: 'buff', self: { strength: 3 }, text: 'Erhaelt 3 Staerke.' }
      },
      ai: function (e, c, rng) { return rng() < 0.25 ? 'grow' : 'bite'; }
    },
    slime: {
      id: 'slime', name: 'Saeureschleim', hp: [28, 32], art: 'slime', kind: 'normal',
      moves: {
        spit: { name: 'Saeurespucke', type: 'attack_debuff', dmg: 7, addCard: { id: 'slimed', zone: 'discard' }, text: 'Verursacht 7 Schaden. Legt Schleim ab.' },
        tackle: { name: 'Anrempeln', type: 'attack', dmg: 10, text: 'Verursacht 10 Schaden.' },
        lick: { name: 'Ablecken', type: 'debuff', player: { weak: 1 }, text: 'Verleiht 1 Schwach.' }
      },
      ai: function (e, c, rng) {
        var seq = ['spit', 'tackle', 'lick', 'tackle'];
        return seq[e.turns % seq.length];
      }
    },
    fungi: {
      id: 'fungi', name: 'Pilzbestie', hp: [22, 28], art: 'fungi', kind: 'normal',
      moves: {
        bite: { name: 'Biss', type: 'attack', dmg: 6, text: 'Verursacht 6 Schaden.' },
        grow: { name: 'Sporen', type: 'buff', self: { strength: 3 }, text: 'Erhaelt 3 Staerke.' }
      },
      ai: function (e, c, rng) { return rng() < 0.4 ? 'grow' : 'bite'; }
    },
    slaver: {
      id: 'slaver', name: 'Sklaventreiber', hp: [46, 50], art: 'slaver', kind: 'normal',
      moves: {
        stab: { name: 'Stich', type: 'attack', dmg: 12, text: 'Verursacht 12 Schaden.' },
        rake: { name: 'Harken', type: 'attack_debuff', dmg: 7, player: { weak: 1 }, text: 'Verursacht 7 Schaden. Verleiht 1 Schwach.' },
        entangle: { name: 'Umstricken', type: 'debuff', player: { entangle: 2 }, text: 'Du kannst 2 Zuege lang nicht angreifen.' }
      },
      ai: function (e, c, rng) {
        var seq = ['stab', 'rake', 'entangle', 'stab'];
        return seq[e.turns % seq.length];
      }
    },
    nob: {
      id: 'nob', name: 'Gremlin-Rohling', hp: [82, 86], art: 'nob', kind: 'elite', enrage: 2,
      moves: {
        bellow: { name: 'Kriegsgebrüll', type: 'buff', self: { strength: 2 }, block: 6, text: 'Erhaelt 2 Staerke und 6 Ruestung.' },
        rush: { name: 'Ansturm', type: 'attack', dmg: 14, text: 'Verursacht 14 Schaden.' },
        skull_bash: { name: 'Schaedelstoss', type: 'attack_debuff', dmg: 6, player: { vulnerable: 2 }, text: 'Verursacht 6 Schaden. Verleiht 2 Verwundbar.' }
      },
      ai: function (e, c, rng) {
        if (e.turns === 0) return 'bellow';
        return e.turns % 3 === 0 ? 'skull_bash' : 'rush';
      }
    },
    lagavulin: {
      id: 'lagavulin', name: 'Lagavulin', hp: [109, 111], art: 'lagavulin', kind: 'elite',
      moves: {
        sleep: { name: 'Schlafen', type: 'defend', block: 8, text: 'Schlaeft. Erhaelt 8 Ruestung.' },
        attack: { name: 'Aufwachen', type: 'attack', dmg: 18, text: 'Verursacht 18 Schaden.' },
        siphon: { name: 'Seelenraub', type: 'debuff', player: { strength: -1, dexterity: -1 }, text: 'Du verlierst 1 Staerke und 1 Geschick.' }
      },
      ai: function (e, c, rng) {
        if (!e.awake && e.turns < 3) return 'sleep';
        if (e.turns < 3) return 'attack';
        var seq = ['attack', 'siphon', 'attack'];
        return seq[(e.turns - 3) % seq.length] || 'attack';
      }
    },
    hexaghost: {
      id: 'hexaghost', name: 'Hexageist', hp: [250, 250], art: 'hexaghost', kind: 'boss',
      moves: {
        activate: { name: 'Aktivieren', type: 'buff', self: { strength: 2 }, text: 'Erhaelt 2 Staerke.' },
        divider: { name: 'Teiler', type: 'attack', dmg: 6, dynamicHits: 'divider', text: 'Verursacht 6 Schaden pro 12 HP.' },
        sear: { name: 'Versengen', type: 'attack_debuff', dmg: 6, addCard: { id: 'burn', zone: 'discard' }, text: 'Verursacht 6 Schaden. Legt Verbrennung ab.' },
        tackle: { name: 'Ansturm', type: 'attack', dmg: 5, hits: 2, text: 'Verursacht 5 Schaden, 2 Mal.' },
        inferno: { name: 'Inferno', type: 'attack_debuff', dmg: 2, hits: 6, addCard: { id: 'burn', zone: 'discard', count: 3 }, text: 'Verursacht 2 Schaden, 6 Mal. Legt 3 Verbrennungen ab.' }
      },
      ai: function (e, c, rng) {
        if (e.turns === 0) return 'activate';
        if (e.turns === 1) return 'divider';
        var seq = ['sear', 'tackle', 'sear', 'inferno'];
        return seq[(e.turns - 2) % seq.length];
      }
    }
  };

  var ENCOUNTERS = {
    normal: [
      { enemies: ['cultist'], min: 0, max: 99, weight: 3 },
      { enemies: ['jawworm'], min: 0, max: 99, weight: 3 },
      { enemies: ['louse', 'louse'], min: 0, max: 99, weight: 2 },
      { enemies: ['slime'], min: 2, max: 99, weight: 2 },
      { enemies: ['slime', 'louse'], min: 3, max: 99, weight: 2 },
      { enemies: ['fungi', 'fungi'], min: 2, max: 99, weight: 2 },
      { enemies: ['slaver'], min: 4, max: 99, weight: 2 }
    ],
    elite: [
      { enemies: ['nob'] },
      { enemies: ['lagavulin'] }
    ],
    boss: [
      { enemies: ['hexaghost'] }
    ]
  };

  var REWARD_CARD_RARITY = { common: 60, uncommon: 33, rare: 7 };

  var EVENTS = [
    {
      id: 'golden_idol', title: 'Der goldene Goetze', art: 'relic',
      body: 'Eine Figur aus purem Gold steht auf einem Altar. Ihre Augen scheinen dich zu beobachten.',
      options: [
        { label: 'Den Goetzen nehmen', run: function (h) { h.gold(100); h.curse(); return 'Du steckst 100 Gold ein. Ein Fluch klammert sich an dein Deck.'; } },
        { label: 'Weitergehen', run: function () { return 'Du laesst den Goetzen stehen. Die Luft wird leichter.'; } }
      ]
    },
    {
      id: 'blood_fountain', title: 'Blutbrunnen', art: 'heart',
      body: 'Dunkles Wasser pulsiert im Takt deines Herzschlags. Es riecht nach Eisen und Regen.',
      options: [
        { label: 'Daraus trinken', run: function (h) { h.healPct(25); return 'Du fuehlst dich erfrischt. 25% deiner max. HP wurden geheilt.'; } },
        { label: 'Wasser abfuellen', run: function (h) { h.healPct(8); h.potion(); return 'Du heilst 8% HP und findest einen Trank im Wasser.'; } }
      ]
    },
    {
      id: 'library', title: 'Die stille Bibliothek', art: 'eye',
      body: 'Regale voller Karten ragen bis zur Decke. Ein Buch liegt aufgeschlagen auf einem Pult.',
      options: [
        { label: 'Im Buch lesen', run: function (h) { h.damage(5); h.card('uncommon'); return 'Wissen schmerzt. Du verlierst 5 HP und erhaeltst eine ungewoehnliche Karte.'; } },
        { label: 'Buecher verkaufen', run: function (h) { h.gold(60); return 'Du verlaesst die Bibliothek mit 60 Gold.'; } }
      ]
    },
    {
      id: 'merchant', title: 'Der fliegende Haendler', art: 'bag',
      body: 'Ein Karren schwebt knapp ueber dem Boden. Der Haendler laechelt und oeffnet eine Kiste.',
      options: [
        { label: 'Relikt kaufen (75 Gold)', needGold: 75, run: function (h) { h.gold(-75); h.relic(); return 'Du zahlst 75 Gold und erhaeltst ein Relikt.'; } },
        { label: 'Weitergehen', run: function () { return 'Der Haendler zuckt mit den Schultern.'; } }
      ]
    },
    {
      id: 'forge', title: 'Erloschene Schmiede', art: 'campfire',
      body: 'Kohle glimmt in der Esse. Ein Hammer liegt bereit, als haette jemand auf dich gewartet.',
      options: [
        { label: 'Ins Feuer greifen', run: function (h) { h.damage(10); h.upgradeRandom(2); return 'Du verbrennst dir die Hand, aber zwei Karten wurden aufgewertet.'; } },
        { label: 'Weitergehen', run: function () { return 'Du laesst die Schmiede hinter dir.'; } }
      ]
    },
    {
      id: 'claw', title: 'Die Klaue', art: 'claw',
      body: 'Eine riesige Klaue ragt aus dem Boden. In ihrem Griff klemmt ein Beutel Gold.',
      options: [
        { label: 'Zupacken', run: function (h) { h.removeCard(); h.gold(80); return 'Die Klaue reisst eine Karte aus deinem Deck. Du erhaelst 80 Gold.'; } },
        { label: 'Vorsichtig vorbeigehen', run: function (h) { h.damage(6); return 'Die Klaue kratzt dich. Du verlierst 6 HP.'; } }
      ]
    },
    {
      id: 'beggar', title: 'Der Bettler', art: 'coin',
      body: 'Ein zerlumpter Mann streckt die Hand aus. Neben ihm stehen zwei verschlossene Flaeschchen.',
      options: [
        { label: '40 Gold geben', needGold: 40, run: function (h) { h.gold(-40); h.potion(); h.potion(); return 'Der Bettler gibt dir zwei Traenke. Du verlierst 40 Gold.'; } },
        { label: 'Ablehnen', run: function () { return 'Der Bettler nickt still und zieht weiter.'; } }
      ]
    },
    {
      id: 'cursed_chest', title: 'Verfluchte Truhe', art: 'bag',
      body: 'Eine Truhe mit schwarzen Eisenbeschlaegen. Aus dem Schloss sickert kalter Rauch.',
      options: [
        { label: 'Truhe oeffnen', run: function (h) { h.relic(); h.curse(); return 'Ein Relikt liegt im Inneren. Ein Fluch folgt dir hinaus.'; } },
        { label: 'Stehen lassen', run: function (h) { h.gold(25); return 'Du findest 25 Gold neben der Truhe und gehst weiter.'; } }
      ]
    },
    {
      id: 'spring', title: 'Quelle der Kraft', art: 'aura',
      body: 'Klares Wasser sprudelt aus einem steinernen Loewenkopf. Waerme steigt daraus auf.',
      options: [
        { label: 'Baden', run: function (h) { h.healPct(30); return 'Die Quelle heilt 30% deiner max. HP.'; } },
        { label: 'Kraft opfern', run: function (h) { h.maxHp(3); h.damage(6); return 'Du verlierst 6 HP, aber deine max. HP steigen um 3.'; } }
      ]
    },
    {
      id: 'wandering_smith', title: 'Wandernder Schmied', art: 'fist',
      body: 'Ein Schmied ohne Amboss sitzt am Wegrand. Er bietet dir seine Dienste an.',
      options: [
        { label: 'Bezahlen (60 Gold)', needGold: 60, run: function (h) { h.gold(-60); h.upgradeRandom(1); return 'Du zahlst 60 Gold. Eine Karte wurde aufgewertet.'; } },
        { label: 'Um Hilfe bitten', run: function (h) { h.damage(8); h.upgradeRandom(1); return 'Du verlierst 8 HP. Eine Karte wurde aufgewertet.'; } }
      ]
    }
  ];

  window.DFData = {
    CARDS: CARDS,
    CARD_IDS: Object.keys(CARDS),
    STATUS: STATUS,
    RELICS: RELICS,
    RELIC_IDS: Object.keys(RELICS),
    POTIONS: POTIONS,
    POTION_IDS: Object.keys(POTIONS),
    ENEMIES: ENEMIES,
    ENCOUNTERS: ENCOUNTERS,
    REWARD_CARD_RARITY: REWARD_CARD_RARITY,
    EVENTS: EVENTS
  };
})();
