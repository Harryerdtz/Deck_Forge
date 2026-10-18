/* DeckForge - UI-Schicht. */
(function () {
  'use strict';

  var E = window.DFEngine;
  var D = window.DFData;
  var SAVE_KEY = 'deckforge.run.v1';

  var App = {
    screen: 'title',
    run: null,
    combat: null,
    reward: null,
    shop: null,
    event: null,
    rest: null,
    modal: null,
    selectedCid: null
  };

  var els = {};
  var drag = null;
  var toastTimer = null;
  var tipTimer = null;
  var deferredPrompt = null;
  var busy = false;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sprite(name, scale, cls) {
    return '<span class="sprite ' + (cls || '') + '" data-sprite="' + name + '" data-scale="' + (scale || 3) + '"></span>';
  }

  function mountSprites(root) {
    $all('[data-sprite]', root || document).forEach(function (el) {
      if (el.dataset.mounted === '1') return;
      var name = el.dataset.sprite;
      var scale = parseInt(el.dataset.scale || '2', 10) || 2;
      if (!window.Sprites.has(name)) { el.dataset.mounted = '1'; return; }
      el.appendChild(window.Sprites.el(name, scale));
      el.dataset.mounted = '1';
    });
  }

  function descHTML(text) {
    return esc(text)
      .replace(/\|/g, '<br>')
      .replace(/(\d+)/g, '<b>$1</b>');
  }

  function toast(text, ms) {
    if (!text) return;
    els.toast.textContent = text;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.add('hidden'); }, ms || 2200);
  }

  function showTip(el, x, y) {
    var raw = el.getAttribute('data-tip');
    if (!raw) return;
    var parts = raw.split('::');
    var title = parts.length > 1 ? parts[0] : '';
    var text = parts.length > 1 ? parts.slice(1).join('::') : raw;
    els.tooltip.innerHTML = (title ? '<b>' + esc(title) + '</b>' : '') + esc(text).replace(/\|/g, '<br>');
    els.tooltip.classList.remove('hidden');
    var pad = 10;
    var tw = els.tooltip.offsetWidth;
    var th = els.tooltip.offsetHeight;
    var px = (x == null ? 12 : x + 14);
    var py = (y == null ? 12 : y + 14);
    if (px + tw > window.innerWidth - pad) px = window.innerWidth - tw - pad;
    if (py + th > window.innerHeight - pad) py = Math.max(pad, (y == null ? 12 : y) - th - 10);
    els.tooltip.style.left = Math.max(pad, px) + 'px';
    els.tooltip.style.top = Math.max(pad, py) + 'px';
  }

  function showTipAtEl(el) {
    var r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.bottom);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 2600);
  }

  function hideTip() {
    els.tooltip.classList.add('hidden');
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function save() {
    try {
      if (!App.run || App.screen === 'gameover' || App.screen === 'victory') {
        localStorage.removeItem(SAVE_KEY);
        return;
      }
      var savedScreen = App.screen === 'title' ? 'map' : App.screen;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        screen: savedScreen,
        run: App.run,
        combat: App.combat,
        reward: App.reward,
        shop: App.shop,
        event: App.event,
        rest: App.rest
      }));
    } catch (e) { /* Speicher voll oder privater Modus */ }
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.run) return null;
      return data;
    } catch (e) { return null; }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  /* ---------------- Top bar ---------------- */

  function renderTopbar() {
    if (!App.run) { els.topbar.classList.add('hidden'); return; }
    els.topbar.classList.remove('hidden');
    var run = App.run;
    var hpPct = Math.max(0, Math.min(100, run.hp / run.maxHp * 100));
    var relics = run.relics.map(function (id) {
      var r = D.RELICS[id];
      if (!r) return '';
      return '<button class="relic ' + (r.rarity === 'boss' ? 'boss' : '') + '" data-tip="' + esc(r.name + '::' + r.desc) + '" aria-label="' + esc(r.name) + '">' +
        sprite(r.art, 1) + '</button>';
    }).join('');
    var potions = '';
    for (var i = 0; i < 3; i++) {
      var pid = run.potions[i];
      if (pid && D.POTIONS[pid]) {
        var p = D.POTIONS[pid];
        potions += '<button class="potion-slot filled" data-potion="' + i + '" data-tip="' + esc(p.name + '::' + p.desc) + '">' + sprite(p.art, 1) + '</button>';
      } else {
        potions += '<button class="potion-slot empty" data-potion="' + i + '" data-tip="Leerer Trank-Slot::Im Kampf kannst du hier einen Trank einsetzen."></button>';
      }
    }
    els.topbar.innerHTML =
      '<div class="metric hp">' + sprite('heart', 2) +
        '<div><div class="value">' + run.hp + '/' + run.maxHp + '</div><div class="hp-track"><i style="width:' + hpPct + '%"></i></div></div>' +
      '</div>' +
      '<div class="metric gold">' + sprite('coin', 2) + '<span class="value">' + run.gold + '</span></div>' +
      '<div class="metric floor"><span>AKT ' + run.act + '</span><b>ETAGE ' + run.floor + '/15</b></div>' +
      '<div class="relic-strip">' + relics + '</div>' +
      '<div class="potion-strip">' + potions + '</div>' +
      '<div class="top-actions">' +
        '<button class="px-button small" data-act="deck">Deck</button>' +
        '<button class="px-button small" data-act="menu">Menue</button>' +
      '</div>';
    mountSprites(els.topbar);
  }

  /* ---------------- Title ---------------- */

  function renderTitle() {
    els.topbar.classList.add('hidden');
    var canContinue = hasSave();
    els.screen.innerHTML =
      '<section class="title-screen">' +
        '<div class="logo">' + sprite('sword', 6) + '<h1>DECK<span>FORGE</span></h1></div>' +
        '<p class="title-sub">Ein dunkles Deck-Roguelike</p>' +
        '<div class="title-hero">' + sprite('ironclad', 6) + '</div>' +
        '<div class="title-actions">' +
          '<button class="px-button gold wide" data-act="new-run">Neuer Lauf</button>' +
          (canContinue ? '<button class="px-button wide" data-act="continue">Fortsetzen</button>' : '') +
          (deferredPrompt ? '<button class="px-button wide" data-act="install">Installieren</button>' : '') +
        '</div>' +
        '<p class="title-hint">Der Eiserne. 80 HP. Ein Startdeck aus 10 Karten. Ein Turm voller Feinde.<br>' +
        'Spiele Karten per Tippen oder ziehe sie nach oben. Maximal 10 Karten in der Hand, 3 Energie pro Zug.</p>' +
      '</section>';
    mountSprites(els.screen);
  }

  /* ---------------- Map ---------------- */

  function nodeIcon(type) {
    if (type === 'elite') return 'skull';
    if (type === 'event') return 'question';
    if (type === 'shop') return 'bag';
    if (type === 'rest') return 'campfire';
    if (type === 'boss') return 'crown';
    return 'sword';
  }

  function mapPos(node) {
    return { x: (node.col + 1) * (700 / 8), y: 80 + (14 - node.row) * 105 };
  }

  function renderMap() {
    var run = App.run;
    var available = E.availableNodes(run);
    var availIds = {};
    available.forEach(function (n) { availIds[n.id] = true; });
    var currentId = run.currentNode;
    var nodes = [];
    for (var id in run.map.nodes) nodes.push(run.map.nodes[id]);
    nodes.sort(function (a, b) { return b.row - a.row || a.col - b.col; });

    var edges = '';
    nodes.forEach(function (n) {
      var a = mapPos(n);
      n.links.forEach(function (tid) {
        var t = run.map.nodes[tid];
        if (!t) return;
        var b = mapPos(t);
        var cls = 'map-edge';
        if (currentId && n.id === currentId) cls += ' current';
        else if ((currentId && n.id === currentId) || (!currentId && n.row === 0)) cls += ' active';
        if (!currentId && n.row === 0) cls += ' active';
        edges += '<line class="' + cls + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"></line>';
      });
    });

    var html = '';
    nodes.forEach(function (n) {
      var p = mapPos(n);
      var cls = 'map-node type-' + n.type;
      if (availIds[n.id]) cls += ' available';
      if (n.id === currentId) cls += ' current';
      if (n.visited && n.id !== currentId) cls += ' visited';
      var floorLabel = n.type === 'boss' ? 'BOSS' : n.row + 1;
      html += '<button class="' + cls + '" style="left:' + (p.x / 700 * 100) + '%;top:' + p.y + 'px" data-node="' + n.id + '" ' + (availIds[n.id] ? '' : 'disabled') + ' aria-label="Knoten ' + floorLabel + '">' +
        sprite(nodeIcon(n.type), n.type === 'boss' ? 3 : 2) +
        '<span class="node-floor">' + floorLabel + '</span>' +
      '</button>';
    });

    els.screen.innerHTML =
      '<section class="map-screen">' +
        '<div class="map-head">' +
          '<div class="act">AKT ' + run.act + '<b>DIE RUINEN</b></div>' +
          '<div class="hint">HP ' + run.hp + '/' + run.maxHp + ' | Gold ' + run.gold + '<br>' +
            (available.length ? 'Waehle deinen naechsten Knoten' : 'Kein Weg mehr offen') + '</div>' +
        '</div>' +
        '<div class="map-scroll" id="map-scroll"><div class="map-inner">' +
          '<svg viewBox="0 0 700 1660" preserveAspectRatio="none">' + edges + '</svg>' +
          html +
        '</div></div>' +
        '<div class="map-legend">' +
          '<span class="lg">' + sprite('sword', 1) + 'Monster</span>' +
          '<span class="lg">' + sprite('skull', 1) + 'Elite</span>' +
          '<span class="lg">' + sprite('question', 1) + 'Event</span>' +
          '<span class="lg">' + sprite('bag', 1) + 'Shop</span>' +
          '<span class="lg">' + sprite('campfire', 1) + 'Lagerfeuer</span>' +
          '<span class="lg">' + sprite('crown', 1) + 'Boss</span>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
    setTimeout(scrollMap, 50);
  }

  function scrollMap() {
    if (App.screen !== 'map') return;
    var target = $('.map-node.available', els.screen) || $('.map-node.current', els.screen);
    if (target) {
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { target.scrollIntoView(); }
    }
  }

  /* ---------------- Cards ---------------- */

  function cardHTML(inst, opts) {
    opts = opts || {};
    var def = D.CARDS[inst.id];
    if (!def) return '';
    var vals = E.cardVals(inst);
    var cost = opts.cost !== undefined ? opts.cost : E.costNumber(inst, App.combat);
    if (cost === null) cost = '-';
    var playable = opts.playable !== false;
    var desc = descHTML(E.cardDesc(inst));
    var extra = opts.extra || '';
    var attrs = opts.attrs || '';
    var staticCls = opts.static ? 'static' : '';
    var classes = 'card type-' + def.type + ' ' + staticCls + ' ' + (inst.upgraded ? 'upgraded ' : '') + (playable ? '' : 'unplayable ') + extra;
    return '<div class="' + classes + '" ' + attrs + '>' +
      '<span class="card-cost">' + cost + '</span>' +
      '<span class="card-name">' + esc(E.cardName(inst)) + '</span>' +
      '<span class="card-art">' + sprite(def.art, 3) + '</span>' +
      '<span class="card-type">' + esc(E.cardTypeLabel(inst)) + '</span>' +
      '<span class="card-desc">' + desc + '</span>' +
      (inst.upgraded ? '<span class="card-upg-mark">+</span>' : '') +
    '</div>';
  }

  function miniCardHTML(inst, opts) {
    opts = opts || {};
    var def = D.CARDS[inst.id];
    var cost = E.costNumber(inst, App.combat);
    if (cost === null) cost = '-';
    var tag = opts.clickable ? 'button' : 'div';
    var attrs = opts.attrs || '';
    var cls = 'mini-card type-' + def.type + ' ' + (inst.upgraded ? 'upgraded ' : '') + (opts.disabled ? 'disabled ' : '') + (opts.chosen ? 'chosen ' : '') + (opts.clickable ? 'clickable' : '');
    return '<' + tag + ' class="' + cls + '" ' + attrs + '>' +
      '<span class="mc-top"><span class="mc-name">' + esc(E.cardName(inst)) + '</span><span class="mc-cost">' + cost + '</span></span>' +
      '<span class="mc-type">' + esc(E.cardTypeLabel(inst)) + (opts.zone ? ' | ' + esc(opts.zone) : '') + '</span>' +
      '<span class="mc-desc">' + descHTML(E.cardDesc(inst)) + '</span>' +
      (opts.note ? '<span class="mc-zone">' + esc(opts.note) + '</span>' : '') +
      (opts.chosen ? '<span class="mc-check">GEWAEHLT</span>' : '') +
    '</' + tag + '>';
  }

  function layoutHand() {
    if (App.screen !== 'combat') return;
    var handEl = $('#hand');
    if (!handEl) return;
    var cards = $all('.card', handEl);
    if (!cards.length) return;
    var wrap = handEl.parentElement;
    var w = wrap.clientWidth;
    var cw = cards[0].offsetWidth || 100;
    var n = cards.length;
    var spread = n > 1 ? Math.min(cw * 0.8, (w - cw - 8) / (n - 1)) : 0;
    if (!isFinite(spread) || spread < 8) spread = n > 1 ? Math.max(4, (w - cw) / (n - 1)) : 0;
    var center = (n - 1) / 2;
    cards.forEach(function (el, i) {
      var off = i - center;
      var tx = off * spread;
      var ty = Math.abs(off) * Math.abs(off) * 0.9 + (n > 1 ? 4 : 0);
      var rot = off * 2.6;
      el.style.setProperty('--tx', tx.toFixed(1) + 'px');
      el.style.setProperty('--ty', ty.toFixed(1) + 'px');
      el.style.setProperty('--rot', rot.toFixed(2) + 'deg');
      el.style.setProperty('--z', String(i + 1));
    });
  }

  function statusBadges(statuses, powers, block, opts) {
    opts = opts || {};
    var out = '';
    if (block) {
      out += '<span class="badge block" data-tip="Ruestung::Absorbiert ' + block + ' Schaden. Verfaellt zu Beginn des eigenen Zuges.">' +
        sprite('shield', 1) + '<span>' + block + '</span></span>';
    }
    var order = opts.enemy ? ['strength', 'vulnerable', 'weak', 'ritual'] : ['strength', 'dexterity', 'vulnerable', 'weak', 'entangle', 'ritual'];
    order.forEach(function (key) {
      var n = statuses[key] || 0;
      if (!n) return;
      var info = E.statusInfo(key);
      var cls = (key === 'weak' || key === 'vulnerable' || key === 'entangle') ? 'debuff' : 'buff';
      out += '<span class="badge ' + cls + '" data-tip="' + esc(info.name + ' ' + n + '::' + info.desc) + '">' +
        sprite(info.art, 1) + '<span>' + n + '</span></span>';
    });
    if (powers) {
      var plist = ['demonForm', 'metallicize', 'flameBarrier', 'thorns', 'juggernaut', 'combust', 'barricade', 'berserk', 'brutality', 'rupture', 'rage', 'doubleTap', 'evolve', 'fireBreathing', 'feelNoPain', 'darkEmbrace', 'corruption'];
      var numberless = { barricade: 1, corruption: 1, berserk: 1, brutality: 1, doubleTap: 1 };
      plist.forEach(function (key) {
        var n = powers[key] || 0;
        if (!n) return;
        var info = E.statusInfo(key);
        out += '<span class="badge power" data-tip="' + esc(info.name + '::' + info.desc) + '">' +
          sprite(info.art, 1) + (numberless[key] ? '' : '<span>' + n + '</span>') + '</span>';
      });
    }
    return out;
  }

  function intentHTML(enemy) {
    var combat = App.combat;
    var info = E.intentInfo(combat, enemy);
    var cls = info.attack ? 'attack' : info.block ? 'defend' : info.buff ? 'buff' : info.debuff ? 'debuff' : '';
    var icons = info.icons.map(function (name) { return sprite(name, 1); }).join('');
    var num = '';
    if (info.attack) num = info.dmg + (info.hits > 1 ? 'x' + info.hits : '');
    else if (info.block) num = '+' + info.block;
    var tip = E.intentTooltip(combat, enemy);
    return '<div class="intent ' + cls + '" data-tip="' + esc('Absicht::' + tip) + '">' +
      '<span class="intent-icons">' + icons + '</span>' +
      (num ? '<span class="num">' + num + '</span>' : '') +
    '</div>';
  }

  /* ---------------- Combat ---------------- */

  function renderCombat() {
    var combat = App.combat;
    if (!combat) { App.screen = 'map'; render(); return; }
    var player = combat.player;
    var selected = App.selectedCid ? findHandCard(App.selectedCid) : null;
    var targeting = selected && D.CARDS[selected.id].target === 'enemy';
    var hpPct = Math.max(0, Math.min(100, player.hp / player.maxHp * 100));

    var enemiesHTML = '';
    combat.enemies.forEach(function (enemy) {
      if (enemy.dead) return;
      var ehp = Math.max(0, Math.min(100, enemy.hp / enemy.maxHp * 100));
      enemiesHTML += '<div class="enemy ' + (targeting ? 'targetable' : '') + '" data-enemy="' + enemy.uid + '">' +
        intentHTML(enemy) +
        '<div class="enemy-sprite">' + sprite(D.ENEMIES[enemy.id].art, 6) + '</div>' +
        '<div class="combatant-plate enemy-plate">' +
          '<div class="plate-name"><b>' + esc(enemy.name) + '</b><span class="hpnum">' + enemy.hp + '/' + enemy.maxHp + '</span></div>' +
          '<div class="hpbar enemy"><i style="width:' + ehp + '%"></i></div>' +
          '<div class="statuses">' + statusBadges(enemy.statuses, null, enemy.block, { enemy: true }) + '</div>' +
        '</div>' +
      '</div>';
    });

    var selectedDef = selected ? D.CARDS[selected.id] : null;
    var hintHTML = selected ? '<div class="combat-hint">' +
      (selectedDef.target === 'enemy' ? 'Ziel waehlen: Gegner antippen' : 'Erneut tippen zum Ausspielen') + '</div>' : '';

    var handHTML = combat.hand.map(function (inst) {
      var chk = E.canPlay(App.run, combat, inst);
      return cardHTML(inst, {
        playable: chk.ok,
        attrs: 'data-cid="' + (inst.cid || inst.uid) + '" tabindex="-1"',
        extra: App.selectedCid === (inst.cid || inst.uid) ? 'selected' : ''
      });
    }).join('');

    var logHTML = combat.log.slice(-3).map(function (line) { return '<div>' + esc(line) + '</div>'; }).join('');
    var endDisabled = combat.phase !== 'player' || combat.pending || busy;

    els.screen.innerHTML =
      '<section class="combat-screen ' + (selected ? 'aiming' : '') + '">' +
        hintHTML +
        '<div class="battlefield">' +
          '<div class="player-side">' +
            '<div class="player-sprite">' + sprite('ironclad', 5) + '</div>' +
            '<div class="combatant-plate">' +
              '<div class="plate-name"><b>Der Eiserne</b><span class="hpnum">' + player.hp + '/' + player.maxHp + '</span></div>' +
              '<div class="hpbar"><i style="width:' + hpPct + '%"></i></div>' +
              '<div class="statuses">' + statusBadges(player.statuses, player.powers, player.block) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="enemy-side">' + enemiesHTML + '</div>' +
          '<div class="combat-log">' + logHTML + '</div>' +
        '</div>' +
        '<div class="combat-bottom">' +
          '<div class="rail left">' +
            '<button class="pile" data-act="view-draw" data-tip="Ziehstapel::Klicke, um die verbleibenden Karten anzusehen.">' +
              '<span class="pile-icon"></span><span class="pile-count">' + combat.drawPile.length + '</span><span class="pile-label">Ziehstapel</span>' +
            '</button>' +
            '<div class="energy-orb ' + (combat.energy === 0 ? 'low' : '') + '" data-tip="Energie::Karten kosten Energie. Zu Beginn deines Zuges wird sie aufgefuellt.">' +
              sprite('energy', 3) +
              '<span class="energy-num">' + combat.energy + '/' + combat.maxEnergy + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="hand-wrap"><div class="hand" id="hand">' + handHTML + '</div></div>' +
          '<div class="rail right">' +
            '<button class="pile" data-act="view-discard" data-tip="Ablagestapel::Klicke, um die abgelegten Karten anzusehen.">' +
              '<span class="pile-icon"></span><span class="pile-count">' + combat.discardPile.length + '</span><span class="pile-label">Ablage</span>' +
            '</button>' +
            (combat.exhaustPile.length ? '<button class="pile" data-act="view-exhaust" data-tip="Erschoepft::Diese Karten sind fuer den Rest des Kampfes entfernt." style="min-height:32px;padding:1px">' +
              '<span class="pile-count" style="font-size:9px">E: ' + combat.exhaustPile.length + '</span></button>' : '') +
            '<button class="end-turn" data-act="end-turn" ' + (endDisabled ? 'disabled' : '') + '>Zug<br>beenden</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
    layoutHand();
    setTimeout(layoutHand, 30);
  }

  function findHandCard(cid) {
    if (!App.combat) return null;
    for (var i = 0; i < App.combat.hand.length; i++) {
      var c = App.combat.hand[i];
      if (c.cid === cid || c.uid === cid) return c;
    }
    return null;
  }

  function canPlayReason(inst) {
    var chk = E.canPlay(App.run, App.combat, inst);
    return chk.ok ? '' : chk.reason;
  }

  function doPlay(cid, targetUid) {
    if (!App.combat || App.combat.phase !== 'player') return;
    var inst = findHandCard(cid);
    if (!inst) return;
    var chk = E.canPlay(App.run, App.combat, inst);
    if (!chk.ok) { toast(chk.reason); return; }
    var res = E.playCard(App.run, App.combat, cid, targetUid || null);
    if (!res.ok) { toast(res.reason); return; }
    App.selectedCid = null;
    save();
    if (App.combat.phase === 'won') { winCombat(); return; }
    if (App.combat.phase === 'lost') { loseCombat(); return; }
    render();
  }

  function tapCard(cid, pointerType) {
    var inst = findHandCard(cid);
    if (!inst) return;
    var def = D.CARDS[inst.id];
    var touch = pointerType === 'touch' || pointerType === 'pen';
    var wasSelected = App.selectedCid === cid;

    if (wasSelected) {
      var chk = E.canPlay(App.run, App.combat, inst);
      if (!chk.ok) { toast(chk.reason); return; }
      if (def.target === 'enemy') {
        var alive = E.aliveEnemies(App.combat);
        if (alive.length > 1) { toast('Tippe einen Gegner an, um das Ziel zu waehlen.'); return; }
        doPlay(cid, alive[0] ? alive[0].uid : null);
        return;
      }
      doPlay(cid, null);
      return;
    }

    if (touch) {
      App.selectedCid = cid;
      render();
      toast(def.target === 'enemy' ? 'Karte ausgewaehlt. Tippe einen Gegner an.' : 'Karte ausgewaehlt. Tippe erneut zum Ausspielen.');
      return;
    }

    var mouseChk = E.canPlay(App.run, App.combat, inst);
    if (!mouseChk.ok) { toast(mouseChk.reason); return; }
    if (def.target === 'enemy') {
      var enemies = E.aliveEnemies(App.combat);
      if (enemies.length > 1) {
        App.selectedCid = cid;
        render();
        toast('Ziel waehlen: Tippe einen Gegner an.');
        return;
      }
      doPlay(cid, enemies[0] ? enemies[0].uid : null);
      return;
    }
    doPlay(cid, null);
  }

  function endTurn() {
    if (!App.combat || busy) return;
    App.selectedCid = null;
    busy = true;
    var res = E.endTurn(App.run, App.combat);
    busy = false;
    save();
    if (!res.ok) { toast(res.reason); render(); return; }
    if (App.combat.phase === 'won') { winCombat(); return; }
    if (App.combat.phase === 'lost') { loseCombat(); return; }
    render();
  }

  function winCombat() {
    if (!App.combat) return;
    var reward = E.buildReward(App.run, App.combat);
    App.reward = reward;
    App.combat = null;
    App.selectedCid = null;
    App.modal = null;
    App.screen = 'reward';
    save();
    render();
  }

  function loseCombat() {
    App.combat = null;
    App.selectedCid = null;
    App.modal = null;
    App.screen = 'gameover';
    save();
    render();
  }

  /* ---------------- Pending selection ---------------- */

  function pendingModal() {
    if (!App.combat || !App.combat.pending) return;
    App.modal = { type: 'pending' };
    renderModal();
  }

  /* ---------------- Reward ---------------- */

  function renderReward() {
    var reward = App.reward;
    var run = App.run;
    if (!reward) { App.screen = 'map'; render(); return; }
    var title = reward.boss ? 'Boss besiegt' : reward.elite ? 'Elite besiegt' : 'Sieg';
    var sub = reward.boss ? 'Der Weg nach oben ist frei.' : reward.elite ? 'Ein Relikt ist dein.' : 'Der Kampf ist vorbei.';
    var cards = reward.cards.map(function (inst, i) {
      var disabled = reward.cardTaken && reward.pickedIndex !== i;
      var chosen = reward.pickedIndex === i;
      return '<div class="reward-choice" data-reward-card="' + i + '" style="position:relative">' +
        cardHTML(inst, { static: true, playable: !disabled, extra: (chosen ? 'chosen ' : '') + (disabled ? 'disabled' : '') }) +
      '</div>';
    }).join('');

    var extras = '';
    if (reward.relic && D.RELICS[reward.relic]) {
      var r = D.RELICS[reward.relic];
      extras += '<div class="reward-chip taken">' + sprite(r.art, 1) + '<span>' + esc(r.name) + '</span></div>';
    }
    if (reward.potion && D.POTIONS[reward.potion]) {
      var p = D.POTIONS[reward.potion];
      extras += '<button class="reward-chip ' + (reward.potionTaken ? 'taken' : '') + '" data-act="take-potion" data-tip="' + esc(p.name + '::' + p.desc) + '">' +
        sprite(p.art, 1) + '<span>' + esc(p.name) + (reward.potionTaken ? ' (eingesammelt)' : ' (nehmen)') + '</span></button>';
    }

    var bossHTML = '';
    if (reward.boss) {
      bossHTML = '<div class="section-title" style="margin-top:14px">Boss-Relikt waehlen</div><div class="reward-extras">' +
        reward.bossRelics.map(function (rid) {
          var br = D.RELICS[rid];
          if (!br) return '';
          var taken = reward.bossTaken;
          return '<button class="reward-chip ' + (taken ? 'taken' : '') + '" data-boss-relic="' + rid + '" data-tip="' + esc(br.name + '::' + br.desc) + '">' +
            sprite(br.art, 1) + '<span>' + esc(br.name) + '</span></button>';
        }).join('') + '</div>' +
        '<p class="reward-note">Waehle genau ein Boss-Relikt, um fortzufahren.</p>';
    }

    var canContinue = !reward.boss || reward.bossTaken;

    els.screen.innerHTML =
      '<section class="center-screen">' +
        '<div class="center-panel panel">' +
          '<div class="reward-head"><h2>' + title + '</h2><p>' + sub + '</p></div>' +
          '<div class="reward-gold">' + sprite('coin', 2) + '<span>+' + reward.gold + ' Gold</span></div>' +
          '<div class="section-title">Kartenbelohnung</div>' +
          '<p class="reward-note">Waehle eine Karte oder ueberspringe die Belohnung.</p>' +
          '<div class="reward-cards">' + cards + '</div>' +
          (extras ? '<div class="reward-extras">' + extras + '</div>' : '') +
          bossHTML +
          '<div class="reward-actions">' +
            '<button class="px-button gold" data-act="finish-reward" ' + (canContinue ? '' : 'disabled') + '>Weiter</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
  }

  function takeRewardCard(index) {
    var reward = App.reward;
    if (!reward || reward.cardTaken) return;
    if (E.takeRewardCard(App.run, reward, index)) {
      reward.pickedIndex = index;
      save();
      render();
    }
  }

  function finishReward() {
    var reward = App.reward;
    if (!reward) return;
    if (reward.boss && !reward.bossTaken) { toast('Waehle zuerst ein Boss-Relikt.'); return; }
    var won = E.finishReward(App.run, reward);
    App.reward = null;
    if (won) {
      App.screen = 'victory';
      save();
      render();
    } else {
      App.screen = 'map';
      save();
      render();
    }
  }

  /* ---------------- Shop ---------------- */

  function renderShop() {
    var shop = App.shop;
    var run = App.run;
    if (!shop) { App.screen = 'map'; render(); return; }
    if (shop.upgradeCost == null) shop.upgradeCost = 90;
    if (shop.upgradeSold == null) shop.upgradeSold = false;
    var cards = shop.cards.map(function (item, i) {
      return '<div class="shop-item ' + (item.sold ? 'sold' : '') + '" data-shop-card="' + i + '">' +
        cardHTML(item.card, { static: true, attrs: 'role="button" tabindex="0"' }) +
        '<div class="price">' + sprite('coin', 1) + '<span>' + item.price + '</span></div>' +
      '</div>';
    }).join('');
    var relics = shop.relics.map(function (item, i) {
      var r = D.RELICS[item.id];
      return '<button class="shop-token ' + (item.sold ? 'sold' : '') + '" data-shop-relic="' + i + '" data-tip="' + esc(r.name + '::' + r.desc) + '">' +
        sprite(r.art, 2) +
        '<span><span class="st-name">' + esc(r.name) + '</span><br><span class="st-price">' + item.price + ' Gold</span><br><span class="st-desc">' + esc(r.desc) + '</span></span>' +
      '</button>';
    }).join('');
    var potions = shop.potions.map(function (item, i) {
      var p = D.POTIONS[item.id];
      return '<button class="shop-token ' + (item.sold ? 'sold' : '') + '" data-shop-potion="' + i + '" data-tip="' + esc(p.name + '::' + p.desc) + '">' +
        sprite(p.art, 2) +
        '<span><span class="st-name">' + esc(p.name) + '</span><br><span class="st-price">' + item.price + ' Gold</span><br><span class="st-desc">' + esc(p.desc) + '</span></span>' +
      '</button>';
    }).join('');

    var removeDisabled = shop.removeSold || run.gold < shop.removeCost;
    var upgradeDisabled = shop.upgradeSold || run.gold < shop.upgradeCost;
    els.screen.innerHTML =
      '<section class="shop-screen">' +
        '<div class="shop-header panel">' +
          sprite('bag', 4) +
          '<div><h2>Der Haendler</h2><p>Karten, Relikte und Traenke. Alles hat seinen Preis.</p></div>' +
          '<div class="gold-pill">' + sprite('coin', 1) + '<span>' + run.gold + '</span></div>' +
        '</div>' +
        '<div class="shop-section"><h3 class="section-title">Karten</h3><div class="shop-grid">' + cards + '</div></div>' +
        '<div class="shop-section"><h3 class="section-title">Relikte</h3><div class="shop-row">' + relics + '</div></div>' +
        '<div class="shop-section"><h3 class="section-title">Traenke</h3><div class="shop-row">' + potions + '</div></div>' +
        '<div class="shop-section panel" style="padding:10px">' +
          '<div class="shop-actions">' +
            '<button class="px-button" data-act="shop-upgrade" ' + (upgradeDisabled ? 'disabled' : '') + '>Karte aufwerten - ' + shop.upgradeCost + ' Gold</button>' +
            '<button class="px-button danger" data-act="shop-remove" ' + (removeDisabled ? 'disabled' : '') + '>Karte entfernen - ' + shop.removeCost + ' Gold</button>' +
            '<button class="px-button gold" data-act="leave-shop">Shop verlassen</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
  }

  /* ---------------- Rest ---------------- */

  function renderRest() {
    var rest = App.rest || { done: false };
    var run = App.run;
    var html = '<section class="rest-screen">' +
      '<div class="rest-panel panel">' +
        '<div class="rest-fire">' + sprite('campfire', 5) + '</div>' +
        '<h2>Lagerfeuer</h2>' +
        '<div class="rest-hp">HP ' + run.hp + '/' + run.maxHp + ' | Gold ' + run.gold + '</div>' +
        '<p>Die Flammen knistern. Ein Moment der Ruhe zwischen den Kaempfen.</p>';
    if (rest.done) {
      html += '<div class="event-result">' + esc(rest.message || 'Du fuehlst dich bereit.') + '</div>' +
        '<div class="rest-actions"><button class="px-button gold" data-act="finish-node">Weiter zur Karte</button></div>';
    } else {
      html += '<div class="rest-actions">' +
        '<button class="px-button gold" data-act="rest">Rasten<br><span style="font-size:8px;color:#d8c184">+30% max. HP</span></button>' +
        '<button class="px-button" data-act="smith">Schmieden<br><span style="font-size:8px;color:#8b96a8">1 Karte aufwerten</span></button>' +
        '</div>';
    }
    html += '</div></section>';
    els.screen.innerHTML = html;
    mountSprites(els.screen);
  }

  function doRest() {
    var healed = E.restHeal(App.run);
    App.rest = { done: true, message: 'Du rastest am Feuer und heilst ' + healed + ' HP.' };
    save();
    render();
  }

  /* ---------------- Event ---------------- */

  function renderEvent() {
    var state = App.event;
    if (!state) { App.screen = 'map'; render(); return; }
    var ev = null;
    for (var i = 0; i < D.EVENTS.length; i++) if (D.EVENTS[i].id === state.id) { ev = D.EVENTS[i]; break; }
    if (!ev) { App.screen = 'map'; render(); return; }
    var html = '<section class="event-screen">' +
      '<div class="event-panel panel">' +
        '<div class="event-art">' + sprite(ev.art, 5) + '</div>' +
        '<h2>' + esc(ev.title) + '</h2>' +
        '<p>' + esc(ev.body) + '</p>';
    if (state.result) {
      html += '<div class="event-result">' + esc(state.result) + '</div>' +
        '<button class="px-button gold" data-act="finish-node">Weiter zur Karte</button>';
    } else {
      html += '<div class="event-options">';
      ev.options.forEach(function (opt, idx) {
        var disabled = opt.needGold && App.run.gold < opt.needGold;
        html += '<button class="px-button" data-event-choice="' + idx + '" ' + (disabled ? 'disabled' : '') + '>' +
          esc(opt.label) + (opt.needGold ? '<span style="color:#f2b544;margin-left:auto">' + opt.needGold + ' G</span>' : '') +
        '</button>';
      });
      html += '</div>';
    }
    html += '</div></section>';
    els.screen.innerHTML = html;
    mountSprites(els.screen);
  }

  /* ---------------- End screens ---------------- */

  function renderGameover() {
    els.topbar.classList.add('hidden');
    var run = App.run || { hp: 0, maxHp: 80, floor: 0, kills: 0, deck: [], relics: [], gold: 0, elites: 0, combats: 0 };
    els.screen.innerHTML =
      '<section class="end-screen lost">' +
        '<div>' + sprite('skull', 6) + '</div>' +
        '<h1>Gefallen</h1>' +
        '<p class="muted" style="font-size:10px;letter-spacing:1px">Der Turm hat dich verschlungen.</p>' +
        '<div class="end-stats">' +
          '<div class="end-stat"><span>Etage</span><b>' + (run.floor || 0) + '/15</b></div>' +
          '<div class="end-stat"><span>Gegner besiegt</span><b>' + (run.kills || 0) + '</b></div>' +
          '<div class="end-stat"><span>Eliten</span><b>' + (run.elites || 0) + '</b></div>' +
          '<div class="end-stat"><span>Deckgroesse</span><b>' + (run.deck ? run.deck.length : 0) + '</b></div>' +
          '<div class="end-stat"><span>Gold</span><b>' + (run.gold || 0) + '</b></div>' +
          '<div class="end-stat"><span>Relikte</span><b>' + (run.relics ? run.relics.length : 0) + '</b></div>' +
        '</div>' +
        '<div class="title-actions">' +
          '<button class="px-button gold wide" data-act="new-run">Neuer Lauf</button>' +
          '<button class="px-button wide" data-act="title">Zum Titel</button>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
  }

  function renderVictory() {
    els.topbar.classList.add('hidden');
    var run = App.run || { kills: 0, elites: 0, deck: [], relics: [], gold: 0, hp: 0, maxHp: 80 };
    els.screen.innerHTML =
      '<section class="end-screen won">' +
        '<div>' + sprite('crown', 6) + '</div>' +
        '<h1>Der Turm schweigt</h1>' +
        '<p class="muted" style="font-size:10px;letter-spacing:1px">Akt I bezwungen. Der Hexageist ist gefallen.</p>' +
        '<div class="end-stats">' +
          '<div class="end-stat"><span>Gegner besiegt</span><b>' + (run.kills || 0) + '</b></div>' +
          '<div class="end-stat"><span>Eliten</span><b>' + (run.elites || 0) + '</b></div>' +
          '<div class="end-stat"><span>Deckgroesse</span><b>' + (run.deck ? run.deck.length : 0) + '</b></div>' +
          '<div class="end-stat"><span>Relikte</span><b>' + (run.relics ? run.relics.length : 0) + '</b></div>' +
          '<div class="end-stat"><span>Gold</span><b>' + (run.gold || 0) + '</b></div>' +
          '<div class="end-stat"><span>Verbleibende HP</span><b>' + (run.hp || 0) + '/' + (run.maxHp || 0) + '</b></div>' +
        '</div>' +
        '<div class="title-actions">' +
          '<button class="px-button gold wide" data-act="new-run">Neuer Lauf</button>' +
          '<button class="px-button wide" data-act="title">Zum Titel</button>' +
        '</div>' +
      '</section>';
    mountSprites(els.screen);
  }

  /* ---------------- Modal ---------------- */

  function closeModal() {
    if (App.modal && App.modal.type === 'pending') return;
    App.modal = null;
    els.modal.classList.add('hidden');
  }

  function openDeckModal() {
    var list = [];
    var title = 'Dein Deck';
    if (App.screen === 'combat' && App.combat) {
      title = 'Deck im Kampf';
      var c = App.combat;
      [['hand', c.hand], ['zieh', c.drawPile], ['ablage', c.discardPile], ['erschoepft', c.exhaustPile]].forEach(function (pair) {
        pair[1].forEach(function (card) { list.push({ card: card, zone: pair[0] }); });
      });
    } else {
      list = App.run.deck.map(function (card) { return { card: card, zone: '' }; });
    }
    var order = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };
    list.sort(function (a, b) {
      var da = D.CARDS[a.card.id], db = D.CARDS[b.card.id];
      return (order[da.type] - order[db.type]) || da.name.localeCompare(db.name);
    });
    App.modal = { type: 'deck', title: title, list: list };
    renderModal();
  }

  function openPileModal(which) {
    if (!App.combat) return;
    var map = { draw: App.combat.drawPile, discard: App.combat.discardPile, exhaust: App.combat.exhaustPile };
    var labels = { draw: 'Ziehstapel', discard: 'Ablagestapel', exhaust: 'Erschoepft' };
    var list = (map[which] || []).slice();
    if (which === 'draw') list.reverse();
    App.modal = { type: 'pile', title: labels[which] + ' (' + list.length + ')', list: list.map(function (c) { return { card: c, zone: '' }; }) };
    renderModal();
  }

  function openSmithModal() {
    if (!App.run) return;
    App.modal = { type: 'smith', title: 'Karte schmieden', list: App.run.deck.map(function (c) { return { card: c, zone: '' }; }) };
    renderModal();
  }

  function openRemoveModal() {
    if (!App.run || !App.shop) return;
    App.modal = { type: 'remove', title: 'Karte entfernen (' + App.shop.removeCost + ' Gold)', list: App.run.deck.map(function (c) { return { card: c, zone: '' }; }) };
    renderModal();
  }

  function openUpgradeModal() {
    if (!App.run || !App.shop) return;
    if (App.shop.upgradeCost == null) App.shop.upgradeCost = 90;
    App.modal = { type: 'shop-upgrade', title: 'Karte aufwerten (' + App.shop.upgradeCost + ' Gold)', list: App.run.deck.map(function (c) { return { card: c, zone: '' }; }) };
    renderModal();
  }

  function renderModal() {
    var m = App.modal;
    if (!m) { els.modal.classList.add('hidden'); return; }
    els.modal.classList.remove('hidden');
    els.modal.classList.toggle('pending', m.type === 'pending');
    var title = m.title || 'Menue';
    els.modalTitle.textContent = title;
    var body = '';
    if (m.type === 'pending') {
      var p = App.combat.pending;
      var zone = p.kind === 'headbutt' ? App.combat.discardPile : App.combat.hand;
      var note = 'Waehle eine Karte.';
      if (p.kind === 'headbutt') note = 'Waehle eine Karte aus dem Ablagestapel. Sie kommt oben auf den Ziehstapel.';
      if (p.kind === 'true_grit') note = 'Waehle eine Karte aus der Hand, die erschoepft wird.';
      if (p.kind === 'burning_pact') note = 'Waehle eine Karte aus der Hand, die erschoepft wird.';
      if (p.kind === 'warcry') note = 'Waehle eine Karte aus der Hand. Sie kommt oben auf den Ziehstapel.';
      body += '<p class="modal-note">' + esc(note) + '</p><div class="deck-grid">';
      if (!zone.length) body += '<p class="modal-note">Keine Karten vorhanden.</p>';
      zone.forEach(function (card) {
        body += miniCardHTML(card, {
          clickable: true,
          attrs: 'data-pending-cid="' + (card.cid || card.uid) + '"',
          note: p.kind === 'headbutt' ? 'Ablage' : 'Hand'
        });
      });
      body += '</div>';
    } else if (m.type === 'deck' || m.type === 'pile') {
      body += '<p class="modal-note">' + (m.type === 'deck' ? 'Sortiert nach Typ. Aufgewertete Karten sind gold markiert.' : 'Alle Karten dieses Stapels.') + '</p>';
      body += '<div class="deck-grid">';
      m.list.forEach(function (entry) {
        body += miniCardHTML(entry.card, { zone: entry.zone, clickable: false });
      });
      body += '</div>';
      if (!m.list.length) body += '<p class="modal-note">Dieser Stapel ist leer.</p>';
    } else if (m.type === 'smith') {
      body += '<p class="modal-note">Waehle eine Karte zum Aufwerten. Nur eine Karte pro Lagerfeuer.</p><div class="deck-grid">';
      m.list.forEach(function (entry) {
        var def = D.CARDS[entry.card.id];
        var can = !entry.card.upgraded && !!def.up;
        body += miniCardHTML(entry.card, {
          clickable: can,
          disabled: !can,
          attrs: can ? 'data-modal-card="' + entry.card.uid + '"' : '',
          note: entry.card.upgraded ? 'Bereits aufgewertet' : (!def.up ? 'Nicht aufwertbar' : 'Aufwerten')
        });
      });
      body += '</div>';
    } else if (m.type === 'remove') {
      body += '<p class="modal-note">Waehle eine Karte, die aus deinem Deck entfernt wird. Kosten: ' + App.shop.removeCost + ' Gold.</p><div class="deck-grid">';
      m.list.forEach(function (entry) {
        body += miniCardHTML(entry.card, {
          clickable: true,
          attrs: 'data-modal-card="' + entry.card.uid + '"',
          note: 'Entfernen'
        });
      });
      body += '</div>';
    } else if (m.type === 'shop-upgrade') {
      body += '<p class="modal-note">Waehle eine Karte, die fuer ' + App.shop.upgradeCost + ' Gold aufgewertet wird. Einmal pro Shop.</p><div class="deck-grid">';
      m.list.forEach(function (entry) {
        var def = D.CARDS[entry.card.id];
        var can = !entry.card.upgraded && !!def.up;
        body += miniCardHTML(entry.card, {
          clickable: can,
          disabled: !can,
          attrs: can ? 'data-modal-card="' + entry.card.uid + '"' : '',
          note: entry.card.upgraded ? 'Bereits aufgewertet' : (!def.up ? 'Nicht aufwertbar' : 'Aufwerten')
        });
      });
      body += '</div>';
    } else if (m.type === 'menu') {
      body += '<div class="event-options" style="margin:0">' +
        '<button class="px-button" data-menu="resume">Fortsetzen</button>' +
        '<button class="px-button" data-menu="deck">Deck ansehen</button>' +
        '<button class="px-button" data-menu="fullscreen">Vollbild umschalten</button>' +
        (deferredPrompt ? '<button class="px-button" data-menu="install">App installieren</button>' : '') +
        '<button class="px-button" data-menu="title">Speichern und zum Titel</button>' +
        '<button class="px-button danger" data-menu="abandon">Lauf aufgeben</button>' +
      '</div>';
    }
    els.modalBody.innerHTML = body;
    mountSprites(els.modalBody);
    els.modalClose.classList.toggle('hidden', m.type === 'pending');
  }

  function openMenu() {
    App.modal = { type: 'menu', title: 'Menue' };
    renderModal();
  }

  /* ---------------- Node flow ---------------- */

  function startNode(nodeIdValue) {
    if (!App.run || App.screen !== 'map') return;
    var available = E.availableNodes(App.run);
    var allowed = available.some(function (n) { return n.id === nodeIdValue; });
    if (!allowed) { toast('Dieser Knoten ist nicht erreichbar.'); return; }
    var node = E.enterNode(App.run, nodeIdValue);
    if (!node) return;
    App.selectedCid = null;
    if (node.type === 'monster' || node.type === 'elite' || node.type === 'boss') {
      var kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
      var enemies = E.rollEncounter(App.run, kind, node.row + 1);
      App.combat = E.startCombat(App.run, enemies, kind, node.id);
      App.screen = 'combat';
    } else if (node.type === 'shop') {
      App.shop = E.makeShop(App.run, node.id);
      App.screen = 'shop';
    } else if (node.type === 'rest') {
      App.rest = { done: false, message: '' };
      App.screen = 'rest';
    } else if (node.type === 'event') {
      var ev = D.EVENTS[Math.floor(Math.random() * D.EVENTS.length)];
      App.event = { id: ev.id, result: null };
      App.screen = 'event';
    }
    save();
    render();
  }

  function finishNode() {
    if (!App.run) return;
    E.completeNode(App.run, App.run.currentNode);
    App.shop = null;
    App.rest = null;
    App.event = null;
    App.modal = null;
    App.screen = 'map';
    save();
    render();
  }

  /* ---------------- Screen dispatch ---------------- */

  function render() {
    if (!App.modal) els.modal.classList.add('hidden');
    if (!App.run || App.screen === 'title') { renderTitle(); return; }
    if (App.screen === 'combat' && App.combat && App.combat.phase === 'won') { winCombat(); return; }
    if (App.screen === 'combat' && App.combat && App.combat.phase === 'lost') { loseCombat(); return; }
    renderTopbar();
    if (App.screen === 'map') renderMap();
    else if (App.screen === 'combat') renderCombat();
    else if (App.screen === 'reward') renderReward();
    else if (App.screen === 'shop') renderShop();
    else if (App.screen === 'rest') renderRest();
    else if (App.screen === 'event') renderEvent();
    else if (App.screen === 'gameover') renderGameover();
    else if (App.screen === 'victory') renderVictory();
    if (App.screen === 'combat' && App.combat && App.combat.pending && (!App.modal || App.modal.type !== 'pending')) {
      pendingModal();
    }
  }

  function newRun() {
    if (hasSave() && !window.confirm('Ein gespeicherter Lauf existiert. Neuen Lauf starten?')) return;
    App.run = E.newRun();
    App.combat = null;
    App.reward = null;
    App.shop = null;
    App.event = null;
    App.rest = null;
    App.modal = null;
    App.selectedCid = null;
    App.screen = 'map';
    save();
    render();
    toast('Dein Startdeck: 5 Schlag, 4 Verteidigung, 1 Schmetterhieb.');
  }

  function continueRun() {
    var data = loadSave();
    if (!data) { toast('Kein Speicherstand gefunden.'); renderTitle(); return; }
    App.run = data.run;
    App.combat = data.combat || null;
    App.reward = data.reward || null;
    App.shop = data.shop || null;
    App.event = data.event || null;
    App.rest = data.rest || null;
    App.modal = null;
    App.selectedCid = null;
    App.screen = data.screen || 'map';
    if (App.screen === 'combat' && !App.combat) App.screen = 'map';
    if (App.screen === 'reward' && !App.reward) App.screen = 'map';
    if (App.screen === 'shop' && !App.shop) App.screen = 'map';
    if (App.screen === 'event' && !App.event) App.screen = 'map';
    if (App.screen === 'rest' && !App.rest) App.screen = 'map';
    render();
    toast('Lauf fortgesetzt.');
  }

  function goTitle() {
    save();
    App.screen = 'title';
    App.modal = null;
    App.selectedCid = null;
    els.modal.classList.add('hidden');
    render();
  }

  function abandonRun() {
    if (!window.confirm('Diesen Lauf wirklich aufgeben?')) return;
    clearSave();
    App.run = null;
    App.combat = null;
    App.reward = null;
    App.shop = null;
    App.event = null;
    App.rest = null;
    App.modal = null;
    App.selectedCid = null;
    App.screen = 'title';
    els.modal.classList.add('hidden');
    render();
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { toast('Vollbild ist hier nicht verfuegbar.'); }
  }

  /* ---------------- Event bindings ---------------- */

  function bindTooltips() {
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var el = e.target.closest('[data-tip]');
      if (!el) return;
      if (el.classList.contains('card') || el.closest('.card')) return;
      showTip(el, e.clientX, e.clientY);
    });
    document.addEventListener('pointerout', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var el = e.target.closest('[data-tip]');
      if (!el) return;
      hideTip();
    });
  }

  function bindTopbar() {
    els.topbar.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'deck') openDeckModal();
        else if (act.dataset.act === 'menu') openMenu();
        return;
      }
      var potion = e.target.closest('[data-potion]');
      if (potion) {
        var slot = parseInt(potion.dataset.potion, 10);
        if (App.screen === 'combat' && App.combat && App.combat.phase === 'player' && !App.combat.pending) {
          var res = E.usePotion(App.run, App.combat, slot);
          if (!res.ok) { toast(res.reason); return; }
          save();
          if (App.combat.phase === 'won') { winCombat(); return; }
          if (App.combat.phase === 'lost') { loseCombat(); return; }
          render();
          toast(res.message || 'Trank getrunken.');
        } else {
          showTipAtEl(potion);
        }
        return;
      }
      var tipEl = e.target.closest('[data-tip]');
      if (tipEl) showTipAtEl(tipEl);
    });
  }

  function bindScreen() {
    els.screen.addEventListener('click', function (e) {
      var node = e.target.closest('[data-node]');
      if (node) { startNode(node.dataset.node); return; }

      var enemy = e.target.closest('.enemy[data-enemy]');
      if (enemy && App.selectedCid && App.combat) {
        doPlay(App.selectedCid, enemy.dataset.enemy);
        return;
      }
      if (App.selectedCid && App.combat && e.target.closest('.battlefield')) {
        var sel = findHandCard(App.selectedCid);
        if (sel && D.CARDS[sel.id].target !== 'enemy') {
          doPlay(App.selectedCid, null);
          return;
        }
      }

      var rewardCard = e.target.closest('[data-reward-card]');
      if (rewardCard) { takeRewardCard(parseInt(rewardCard.dataset.rewardCard, 10)); return; }

      var bossRelic = e.target.closest('[data-boss-relic]');
      if (bossRelic && App.reward) {
        if (!App.reward.bossTaken && E.takeBossRelic(App.run, App.reward, bossRelic.dataset.bossRelic)) {
          save();
          render();
          toast('Boss-Relikt erhalten.');
        }
        return;
      }

      var shopCard = e.target.closest('[data-shop-card]');
      if (shopCard) {
        var res = E.buyShopCard(App.run, App.shop, parseInt(shopCard.dataset.shopCard, 10));
        if (!res.ok) toast(res.reason); else { toast(res.message); save(); render(); }
        return;
      }

      var shopRelic = e.target.closest('[data-shop-relic]');
      if (shopRelic) {
        var rr = E.buyShopRelic(App.run, App.shop, parseInt(shopRelic.dataset.shopRelic, 10));
        if (!rr.ok) toast(rr.reason); else { toast(rr.message); save(); render(); }
        return;
      }

      var shopPotion = e.target.closest('[data-shop-potion]');
      if (shopPotion) {
        var rp = E.buyShopPotion(App.run, App.shop, parseInt(shopPotion.dataset.shopPotion, 10));
        if (!rp.ok) toast(rp.reason); else { toast(rp.message); save(); render(); }
        return;
      }

      var eventChoice = e.target.closest('[data-event-choice]');
      if (eventChoice && App.event) {
        var idx = parseInt(eventChoice.dataset.eventChoice, 10);
        var ev = null;
        for (var i = 0; i < D.EVENTS.length; i++) if (D.EVENTS[i].id === App.event.id) { ev = D.EVENTS[i]; break; }
        var result = E.resolveEvent(App.run, App.event.id, idx);
        if (!result.ok) { toast(result.reason); return; }
        App.event.result = result.text;
        save();
        render();
        return;
      }

      var act = e.target.closest('[data-act]');
      if (act) {
        var name = act.dataset.act;
        if (name === 'new-run') { newRun(); return; }
        if (name === 'continue') { continueRun(); return; }
        if (name === 'title') { goTitle(); return; }
        if (name === 'install') { promptInstall(); return; }
        if (name === 'deck') { openDeckModal(); return; }
        if (name === 'menu') { openMenu(); return; }
        if (name === 'end-turn') { endTurn(); return; }
        if (name === 'view-draw') { openPileModal('draw'); return; }
        if (name === 'view-discard') { openPileModal('discard'); return; }
        if (name === 'view-exhaust') { openPileModal('exhaust'); return; }
        if (name === 'take-potion' && App.reward) {
          if (E.takeRewardPotion(App.run, App.reward)) { save(); render(); }
          else toast('Keine freien Trank-Slots.');
          return;
        }
        if (name === 'finish-reward') { finishReward(); return; }
        if (name === 'leave-shop') { finishNode(); return; }
        if (name === 'shop-remove') { openRemoveModal(); return; }
        if (name === 'shop-upgrade') { openUpgradeModal(); return; }
        if (name === 'rest') { doRest(); return; }
        if (name === 'smith') { openSmithModal(); return; }
        if (name === 'finish-node') { finishNode(); return; }
      }

      var tipEl = e.target.closest('[data-tip]');
      if (tipEl) showTipAtEl(tipEl);
    });

    els.screen.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var node = e.target.closest('[data-node]');
      if (node && !node.disabled) { e.preventDefault(); startNode(node.dataset.node); }
    });
  }

  function bindModal() {
    els.modalClose.addEventListener('click', closeModal);
    els.modal.addEventListener('click', function (e) {
      if (e.target === els.modal) { closeModal(); return; }
      var pc = e.target.closest('[data-pending-cid]');
      if (pc) {
        var resolved = E.resolvePending(App.run, App.combat, [pc.dataset.pendingCid]);
        if (resolved) {
          App.modal = null;
          save();
          if (App.combat.phase === 'won') { winCombat(); return; }
          if (App.combat.phase === 'lost') { loseCombat(); return; }
          render();
        }
        return;
      }
      var mc = e.target.closest('[data-modal-card]');
      if (mc) {
        var uid = mc.dataset.modalCard;
        if (App.modal && App.modal.type === 'smith') {
          if (E.smithCard(App.run, uid)) {
            App.rest = { done: true, message: 'Du schmiedest die Karte am Feuer. Sie wurde aufgewertet.' };
            App.modal = null;
            save();
            render();
          }
        } else if (App.modal && App.modal.type === 'shop-upgrade' && App.shop) {
          var upRes = E.shopUpgradeCard(App.run, App.shop, uid);
          if (!upRes.ok) toast(upRes.reason);
          else {
            toast(upRes.message);
            App.modal = null;
            save();
            render();
          }
        } else if (App.modal && App.modal.type === 'remove' && App.shop) {
          var res = E.shopRemoveCard(App.run, App.shop, uid);
          if (!res.ok) toast(res.reason);
          else {
            toast(res.message);
            App.modal = null;
            save();
            render();
          }
        }
        return;
      }
      var menu = e.target.closest('[data-menu]');
      if (menu) {
        var kind = menu.dataset.menu;
        if (kind === 'resume') closeModal();
        else if (kind === 'deck') openDeckModal();
        else if (kind === 'fullscreen') toggleFullscreen();
        else if (kind === 'install') promptInstall();
        else if (kind === 'title') goTitle();
        else if (kind === 'abandon') abandonRun();
      }
    });
  }

  function promptInstall() {
    if (!deferredPrompt) { toast('Installation ist hier nicht verfuegbar.'); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
  }

  /* ---------------- Drag and drop ---------------- */

  function bindDrag() {
    els.screen.addEventListener('pointerdown', function (e) {
      if (App.screen !== 'combat' || !App.combat || App.combat.phase !== 'player' || App.combat.pending) return;
      var cardEl = e.target.closest('.hand .card');
      if (!cardEl) return;
      if (e.button && e.button !== 0) return;
      var cid = cardEl.dataset.cid;
      if (!cid) return;
      drag = {
        cid: cid,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        cardEl: cardEl,
        moved: false,
        ghost: null,
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse'
      };
      try { cardEl.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > 9) {
        drag.moved = true;
        createGhost(drag);
        drag.cardEl.style.opacity = '0.15';
        hideTip();
      }
      if (drag.moved && drag.ghost) {
        drag.ghost.style.left = e.clientX + 'px';
        drag.ghost.style.top = e.clientY + 'px';
        updateDropHighlight(e.clientX, e.clientY);
      }
      if (drag.moved) e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (d.ghost) d.ghost.remove();
      if (d.cardEl) d.cardEl.style.opacity = '';
      clearDropHighlight();
      if (d.moved) {
        tryDrop(d, e.clientX, e.clientY);
      } else {
        tapCard(d.cid, d.pointerType);
      }
    });

    document.addEventListener('pointercancel', function () {
      if (!drag) return;
      if (drag.ghost) drag.ghost.remove();
      if (drag.cardEl) drag.cardEl.style.opacity = '';
      clearDropHighlight();
      drag = null;
    });
  }

  function createGhost(d) {
    var clone = d.cardEl.cloneNode(true);
    clone.classList.remove('selected');
    clone.classList.add('card-ghost');
    clone.style.width = d.cardEl.offsetWidth + 'px';
    clone.style.height = d.cardEl.offsetHeight + 'px';
    clone.style.left = d.lastX + 'px';
    clone.style.top = d.lastY + 'px';
    clone.style.margin = '0';
    clone.style.bottom = 'auto';
    clone.style.transform = 'translate(-50%, -52%) scale(1.06) rotate(-2deg)';
    document.body.appendChild(clone);
    d.ghost = clone;
  }

  function findEnemyAt(x, y) {
    var list = $all('.enemy[data-enemy]', els.screen);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return list[i];
    }
    return null;
  }

  function clearDropHighlight() {
    $all('.enemy.drop-target', els.screen).forEach(function (el) { el.classList.remove('drop-target'); });
  }

  function updateDropHighlight(x, y) {
    clearDropHighlight();
    var el = findEnemyAt(x, y);
    if (el) el.classList.add('drop-target');
  }

  function tryDrop(d, x, y) {
    var inst = findHandCard(d.cid);
    if (!inst) return;
    var def = D.CARDS[inst.id];
    var handWrap = $('.hand-wrap');
    var handTop = handWrap ? handWrap.getBoundingClientRect().top : window.innerHeight;
    var droppedInField = y < handTop + 26;
    var targetEl = findEnemyAt(x, y);
    if (def.target === 'enemy') {
      if (targetEl) { doPlay(d.cid, targetEl.dataset.enemy); return; }
      var alive = E.aliveEnemies(App.combat);
      if (alive.length === 1 && droppedInField) { doPlay(d.cid, alive[0].uid); return; }
      if (alive.length > 1) {
        App.selectedCid = d.cid;
        render();
        toast('Ziel waehlen: Tippe einen Gegner an.');
        return;
      }
      toast('Ziehe die Karte auf einen Gegner.');
      return;
    }
    if (droppedInField) doPlay(d.cid, null);
  }

  /* ---------------- Keyboard / resize ---------------- */

  function bindMisc() {
    window.addEventListener('resize', function () {
      layoutHand();
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(layoutHand, 200);
    });
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (App.screen === 'title') render();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (App.modal) closeModal();
        else if (App.selectedCid) { App.selectedCid = null; render(); }
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        if (App.screen === 'combat' && !App.modal) endTurn();
      }
      if (e.key === 'd' || e.key === 'D') {
        if (App.run && !App.modal) openDeckModal();
      }
    });
  }

  function init() {
    els.topbar = $('#topbar');
    els.screen = $('#screen');
    els.toast = $('#toast');
    els.tooltip = $('#tooltip');
    els.modal = $('#modal');
    els.modalTitle = $('#modal-title');
    els.modalBody = $('#modal-body');
    els.modalClose = $('#modal-close');
    bindTooltips();
    bindTopbar();
    bindScreen();
    bindModal();
    bindDrag();
    bindMisc();
    render();
  }

  window.DFUI = { init: init, App: App, render: render };
})();
