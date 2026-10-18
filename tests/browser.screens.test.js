'use strict';

const fs = require('fs');
const path = require('path');

const CDP = 'http://127.0.0.1:9222';
const URL = 'http://127.0.0.1:4173/';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const targets = await (await fetch(CDP + '/json')).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('Kein Tab');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const errors = [];
  let seq = 0;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon/.test(msg.params.entry.text || '')) {
      errors.push(msg.params.entry.text);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text);
    return res.result.value;
  };
  const waitFor = async (expr, ms) => {
    const start = Date.now();
    while (Date.now() - start < (ms || 7000)) {
      if (await evaluate(expr)) return;
      await sleep(100);
    }
    throw new Error('Timeout: ' + expr);
  };
  const click = async (sel) => {
    const ok = await evaluate(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`);
    if (!ok) throw new Error('fehlt: ' + sel);
    await sleep(230);
  };
  const layout = async (name) => {
    const info = await evaluate(`(function(){
      var sw=document.documentElement.scrollWidth, iw=window.innerWidth;
      var tb=document.querySelector('#topbar');
      var cards=[...document.querySelectorAll('.hand .card')];
      var badCards=cards.filter(function(c){var r=c.getBoundingClientRect();return r.left< -2||r.right>iw+2||r.top< -2;}).length;
      var badTop=tb&&!tb.classList.contains('hidden')?(tb.getBoundingClientRect().left<-1||tb.getBoundingClientRect().right>iw+1):false;
      return {sw:sw,iw:iw,badCards:badCards,badTop:badTop,cards:cards.length};
    })()`);
    if (info.sw > info.iw + 1) throw new Error(name + ': horizontaler Overflow ' + info.sw + ' > ' + info.iw);
    if (info.badTop) throw new Error(name + ': Topbar ragt heraus');
    if (info.badCards) throw new Error(name + ': ' + info.badCards + ' Karten ausserhalb des Viewports');
    console.log('ok   Layout ' + name + ': ' + info.iw + 'px, ' + info.cards + ' Handkarten, kein Overflow');
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL });
  await sleep(900);
  await evaluate(`(async function(){
    if ('serviceWorker' in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      for (var i=0;i<regs.length;i++) await regs[i].unregister();
    }
    if (window.caches) {
      var keys = await caches.keys();
      for (var k=0;k<keys.length;k++) await caches.delete(keys[k]);
    }
    localStorage.clear();
    return true;
  })()`);
  await send('Page.reload');
  await sleep(900);
  await waitFor(`document.querySelector('.title-screen')!==null`);
  await layout('Titel mobil');
  await click('[data-act="new-run"]');
  await waitFor(`document.querySelector('.map-screen')!==null`);
  await layout('Map mobil');

  // Kampf mit zwei Zielen direkt starten
  await evaluate(`(function(){
    var A=window.DFUI.App, E=window.DFEngine;
    var node=A.run.map.rows[0][0];
    E.enterNode(A.run,node.id);
    A.combat=E.startCombat(A.run,['louse','louse'],'normal',node.id);
    A.screen='combat'; A.selectedCid=null; window.DFUI.render();
  })()`);
  await sleep(260);
  await layout('Kampf mobil');

  const attackIndex = await evaluate(`[...document.querySelectorAll('.hand .card')].findIndex(c=>c.classList.contains('type-attack'))`);
  if (attackIndex < 0) throw new Error('Keine Angriffskarte in der Start-Hand');
  await evaluate(`(function(){
    var el=document.querySelectorAll('.hand .card')[${attackIndex}];
    var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:5}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:5}));
  })()`);
  await sleep(260);
  const targetMode = await evaluate(`({selected:window.DFUI.App.selectedCid, targetable:document.querySelectorAll('.enemy.targetable').length, hand:document.querySelectorAll('.hand .card').length})`);
  if (!targetMode.selected || targetMode.targetable !== 2) throw new Error('Zielauswahl fehlt: ' + JSON.stringify(targetMode));
  console.log('ok   Zielauswahl bei zwei Gegnern markiert beide Gegner');
  await click('.enemy.targetable');
  const afterTarget = await evaluate(`({selected:window.DFUI.App.selectedCid, hand:document.querySelectorAll('.hand .card').length, modal:!document.querySelector('#modal').classList.contains('hidden')})`);
  if (afterTarget.selected) throw new Error('Zielauswahl nicht aufgeloest');
  if (afterTarget.hand !== targetMode.hand - 1) throw new Error('Karte wurde nicht gespielt');
  console.log('ok   Gegner angetippt, Karte gespielt');
  if (afterTarget.modal) {
    await click('[data-pending-cid]');
    console.log('ok   Pending-Auswahl aufgeloest');
  }

  // Touch: erster Tap waehlt und zoomt, zweiter Tap spielt
  await evaluate(`(function(){var A=window.DFUI.App,E=window.DFEngine; var node=A.run.map.rows[0][0]; A.combat=E.startCombat(A.run,['louse','louse'],'normal',node.id); A.screen='combat'; A.selectedCid=null; window.DFUI.render();})()`);
  await sleep(240);
  const touchIndex = await evaluate(`(function(){var A=window.DFUI.App,D=window.DFData,E=window.DFEngine; return A.combat.hand.findIndex(function(c){return D.CARDS[c.id].target!=='enemy' && E.canPlay(A.run,A.combat,c).ok;});})()`);
  if (touchIndex < 0) throw new Error('Keine beruehrbare Nicht-Zielkarte');
  const touchFirst = await evaluate(`(function(){
    var el=document.querySelectorAll('.hand .card')[${touchIndex}];
    var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:11,pointerType:'touch'}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:11,pointerType:'touch'}));
    return {hand:document.querySelectorAll('.hand .card').length, selected:window.DFUI.App.selectedCid, hint:document.querySelector('.combat-hint')?document.querySelector('.combat-hint').innerText:''};
  })()`);
  await sleep(240);
  const touchAfterFirst = await evaluate(`({hand:document.querySelectorAll('.hand .card').length, selected:window.DFUI.App.selectedCid, raised:!!document.querySelector('.hand .card.selected'), hint:document.querySelector('.combat-hint')?document.querySelector('.combat-hint').innerText:''})`);
  if (!touchAfterFirst.selected || !touchAfterFirst.raised || touchAfterFirst.hand !== 5) throw new Error('Touch-Auswahl fehlt: ' + JSON.stringify(touchAfterFirst));
  if (!touchAfterFirst.hint) throw new Error('Kein Hinweis zur Kartenauswahl');
  console.log('ok   Touch-Tap hebt Karte an: ' + touchAfterFirst.hint);
  await evaluate(`(function(){
    var el=document.querySelector('.hand .card.selected');
    var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:12,pointerType:'touch'}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,clientY:y,button:0,pointerId:12,pointerType:'touch'}));
  })()`);
  await sleep(240);
  const touchAfterSecond = await evaluate(`({hand:document.querySelectorAll('.hand .card').length, selected:window.DFUI.App.selectedCid})`);
  if (touchAfterSecond.hand !== 4 || touchAfterSecond.selected) throw new Error('Zweiter Touch-Tap hat nicht gespielt: ' + JSON.stringify(touchAfterSecond));
  console.log('ok   Zweiter Touch-Tap spielt die ausgewaehlte Karte');

  await click('[data-act="deck"]');
  const deckCount = await evaluate(`document.querySelectorAll('#modal-body .mini-card').length`);
  if (deckCount < 10) throw new Error('Deck-Modal unvollstaendig: ' + deckCount);
  await layout('Deck-Modal mobil');
  await click('#modal-close');
  console.log('ok   Deck-Modal mobil: ' + deckCount + ' Karten');

  // Shop
  await evaluate(`(function(){var A=window.DFUI.App,E=window.DFEngine; A.run.gold=500; A.shop=E.makeShop(A.run,'shop-test'); A.screen='shop'; A.combat=null; window.DFUI.render();})()`);
  await sleep(260);
  await layout('Shop mobil');
  const shopInfo = await evaluate(`({cards:document.querySelectorAll('[data-shop-card]').length, relics:document.querySelectorAll('[data-shop-relic]').length, potions:document.querySelectorAll('[data-shop-potion]').length})`);
  if (shopInfo.cards !== 5) throw new Error('Shop-Karten != 5');
  console.log('ok   Shop mobil: ' + shopInfo.cards + ' Karten, ' + shopInfo.relics + ' Relikte, ' + shopInfo.potions + ' Traenke');
  const buyInfo = await evaluate(`(function(){
    var deck=window.DFUI.App.run.deck.length, gold=window.DFUI.App.run.gold;
    var items=[...document.querySelectorAll('[data-shop-card]')];
    for(var i=0;i<items.length;i++){ var idx=+items[i].dataset.shopCard; var shop=window.DFUI.App.shop; if(!shop.cards[idx].sold && shop.cards[idx].price<=gold){items[i].click(); return {deck:deck,gold:gold};}}
    return null;
  })()`);
  if (!buyInfo) throw new Error('Kein bezahlbares Shop-Item');
  await sleep(260);
  const afterBuy = await evaluate(`({deck:window.DFUI.App.run.deck.length, gold:window.DFUI.App.run.gold})`);
  if (afterBuy.deck !== buyInfo.deck + 1) throw new Error('Shop-Kauf hat Deck nicht erweitert');
  console.log('ok   Shop-Kauf: Deck ' + buyInfo.deck + ' -> ' + afterBuy.deck + ', Gold ' + buyInfo.gold + ' -> ' + afterBuy.gold);
  await click('[data-act="shop-upgrade"]');
  const upgradeAvailable = await evaluate(`document.querySelectorAll('[data-modal-card]').length`);
  if (!upgradeAvailable) throw new Error('Keine aufwertbare Karte im Shop-Modal');
  await click('[data-modal-card]');
  const upgraded = await evaluate(`({sold:window.DFUI.App.shop.upgradeSold, modal:!document.querySelector('#modal').classList.contains('hidden'), upgraded:window.DFUI.App.run.deck.filter(c=>c.upgraded).length})`);
  if (!upgraded.sold || upgraded.modal || !upgraded.upgraded) throw new Error('Shop-Aufwertung fehlgeschlagen: ' + JSON.stringify(upgraded));
  console.log('ok   Shop-Aufwertung: ' + upgraded.upgraded + ' aufgewertete Karte(n)');

  // Lagerfeuer
  await evaluate(`(function(){var A=window.DFUI.App; A.run.hp=40; A.rest={done:false,message:''}; A.screen='rest'; A.shop=null; window.DFUI.render();})()`);
  await sleep(220);
  await layout('Lagerfeuer mobil');
  await click('[data-act="rest"]');
  const restInfo = await evaluate(`({hp:window.DFUI.App.run.hp, done:window.DFUI.App.rest.done, msg:document.querySelector('.event-result')?document.querySelector('.event-result').innerText:''})`);
  if (!restInfo.done || restInfo.hp <= 40) throw new Error('Rasten funktioniert nicht: ' + JSON.stringify(restInfo));
  console.log('ok   Lagerfeuer heilt: ' + restInfo.msg);

  // Event
  await evaluate(`(function(){var A=window.DFUI.App; A.event={id:'blood_fountain',result:null}; A.screen='event'; A.rest=null; A.run.hp=40; window.DFUI.render();})()`);
  await sleep(220);
  await layout('Event mobil');
  await click('[data-event-choice="0"]');
  const eventInfo = await evaluate(`({result:document.querySelector('.event-result')?document.querySelector('.event-result').innerText:'', hp:window.DFUI.App.run.hp})`);
  if (!eventInfo.result || eventInfo.hp <= 40) throw new Error('Event-Ergebnis fehlt: ' + JSON.stringify(eventInfo));
  console.log('ok   Event-Ergebnis: HP ' + eventInfo.hp + ', Text vorhanden');

  // Normale Belohnung
  await evaluate(`(function(){
    var A=window.DFUI.App, E=window.DFEngine;
    var node=A.run.map.rows[0][0];
    var c=E.startCombat(A.run,['cultist'],'normal',node.id); c.enemies[0].dead=true; c.enemies[0].hp=0; c.phase='won';
    A.reward=E.buildReward(A.run,c); A.combat=null; A.screen='reward'; A.event=null; window.DFUI.render();
  })()`);
  await sleep(260);
  await layout('Reward mobil');
  const rewardInfo = await evaluate(`({cards:document.querySelectorAll('[data-reward-card]').length, disabled:document.querySelector('[data-act="finish-reward"]').disabled, deck:window.DFUI.App.run.deck.length, gold:window.DFUI.App.run.gold})`);
  if (rewardInfo.cards !== 3) throw new Error('Reward-Karten != 3');
  if (rewardInfo.disabled) throw new Error('Weiter-Button unerwartet deaktiviert');
  await click('[data-reward-card="0"]');
  const afterRewardCard = await evaluate(`({deck:window.DFUI.App.run.deck.length, taken:window.DFUI.App.reward.cardTaken})`);
  if (!afterRewardCard.taken || afterRewardCard.deck !== rewardInfo.deck + 1) throw new Error('Reward-Karte wurde nicht genommen');
  await click('[data-act="finish-reward"]');
  const afterReward = await evaluate(`({screen:window.DFUI.App.screen, gold:window.DFUI.App.run.gold, reward:window.DFUI.App.reward})`);
  if (afterReward.screen !== 'map' || afterReward.reward) throw new Error('Reward-Abschluss falsch: ' + JSON.stringify(afterReward));
  if (afterReward.gold <= rewardInfo.gold) throw new Error('Gold wurde nicht gutgeschrieben');
  console.log('ok   Belohnung: Karte genommen, Gold ' + rewardInfo.gold + ' -> ' + afterReward.gold + ', zurueck zur Map');

  // Boss-Belohnung und Sieg
  await evaluate(`(function(){
    var A=window.DFUI.App, E=window.DFEngine;
    var c=E.startCombat(A.run,['hexaghost'],'boss','boss'); c.enemies[0].dead=true; c.enemies[0].hp=0; c.phase='won';
    A.reward=E.buildReward(A.run,c); A.combat=null; A.screen='reward'; window.DFUI.render();
  })()`);
  await sleep(260);
  await layout('Boss-Reward mobil');
  const bossInfo = await evaluate(`({relics:document.querySelectorAll('[data-boss-relic]').length, disabled:document.querySelector('[data-act="finish-reward"]').disabled})`);
  if (bossInfo.relics !== 3) throw new Error('Boss-Relikte != 3');
  if (!bossInfo.disabled) throw new Error('Weiter muss vor Boss-Relikt deaktiviert sein');
  await click('[data-boss-relic]');
  const bossAfter = await evaluate(`({taken:window.DFUI.App.reward.bossTaken, disabled:document.querySelector('[data-act="finish-reward"]').disabled})`);
  if (!bossAfter.taken || bossAfter.disabled) throw new Error('Boss-Relikt-Auswahl fehlerhaft');
  await click('[data-act="finish-reward"]');
  const victory = await evaluate(`({screen:window.DFUI.App.screen, won:window.DFUI.App.run.won, title:document.querySelector('.end-screen h1')?document.querySelector('.end-screen h1').innerText:''})`);
  if (victory.screen !== 'victory' || !victory.won) throw new Error('Sieges-Screen fehlt: ' + JSON.stringify(victory));
  console.log('ok   Boss-Relikt + Sieges-Screen: ' + victory.title);

  // Kleines Viewport
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
  await evaluate(`(function(){var A=window.DFUI.App,E=window.DFEngine; A.screen='combat'; A.run.won=false; var node=A.run.map.rows[0][0]; A.combat=E.startCombat(A.run,['louse','louse'],'normal',node.id); A.reward=null; window.DFUI.render();})()`);
  await sleep(300);
  await layout('Kampf 360px');
  const noHScroll = await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`);
  if (!noHScroll) throw new Error('360px: horizontaler Scroll');
  console.log('ok   360px-Viewport ohne horizontalen Scroll');

  if (errors.length) {
    console.log('\nBrowserfehler:');
    errors.forEach(e => console.log(' - ' + e));
    throw new Error(errors.length + ' Browserfehler');
  }
  console.log('\nMobile Screen-Tests erfolgreich.');
  ws.close();
}

main().catch(err => { console.error('FAIL ' + err.message); process.exit(1); });
