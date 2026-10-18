'use strict';

const CDP = 'http://127.0.0.1:9222';
const URL = 'http://127.0.0.1:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const response = await fetch(CDP + '/json');
  const targets = await response.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('Kein Page-Target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'Eval');
    return res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: URL });
  await sleep(1000);
  const swReady = await evaluate(`navigator.serviceWorker.ready.then(r => !!r.active)`);
  if (!swReady) throw new Error('Service Worker nicht aktiv');
  console.log('ok   Service Worker aktiv');

  await send('Page.reload');
  await sleep(1000);

  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await send('Page.reload');
  await sleep(1400);
  const state = await evaluate(`({
    title: document.title,
    titleScreen: !!document.querySelector('.title-screen'),
    loaded: [...document.scripts].every(s => s.src.indexOf('js/') === -1 || !!s.src)
  })`);
  console.log('offline:', JSON.stringify(state));

  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  if (!state.titleScreen) throw new Error('Offline wurde die App nicht geladen');
  console.log('ok   Offline-Start aus dem Service-Worker-Cache');
  ws.close();
}

main().catch((err) => {
  console.error('FAIL ' + err.message);
  process.exit(1);
});
