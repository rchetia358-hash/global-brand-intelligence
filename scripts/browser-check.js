'use strict';
// End-to-end check against the running site using headless Chrome (DevTools protocol).
// Usage: node scripts/browser-check.js [baseUrl]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/gbi-chrome-profile', 'about:blank'], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch {}
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('Chrome did not start');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails));
    return r.result.result.value;
  };
  const shot = async (name, clip) => {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: !!clip, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
  };
  const waitFor = async (expr, ms, label) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { if (await js(expr)) return true; } catch {} await sleep(400); }
    console.log(`  ! timeout waiting for ${label}`); return false;
  };

  await send('Page.enable'); await send('Runtime.enable');
  const report = {};

  for (const vp of [
    { name: 'desktop', width: 1280, height: 900, mobile: false },
    { name: 'tablet', width: 820, height: 1000, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true }
  ]) {
    console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    await send('Page.navigate', { url: BASE });
    await waitFor(`document.querySelectorAll('#city-hotspots .hotspot').length>0`, 15000, 'hotspots');
    await waitFor(`!document.getElementById('state-loading').hidden===false && !document.getElementById('articles-container').hidden`, 90000, 'RSS section');
    await sleep(1500);

    const info = await js(`(() => {
      const top = id => { const e = document.getElementById(id); return e && !e.hidden ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
      const order = ['section-header','city-visual','press-releases-section','articles-container','filter-bar','articles-list-container','brand-pills-bar'].map(i => [i, top(i)]);
      const img = document.getElementById('city-img').getBoundingClientRect();
      const cfgRes = null;
      return {
        h1: document.querySelector('h1.masthead__title').textContent,
        tagline: document.querySelector('.masthead__tagline').textContent,
        h2: document.getElementById('section-title').textContent,
        order, imgW: Math.round(img.width), imgH: Math.round(img.height),
        imgRatio: +(img.width / img.height).toFixed(4),
        hotspots: document.querySelectorAll('#city-hotspots .hotspot').length,
        cardsWithImage: document.querySelectorAll('#articles-container .article-card__image').length,
        cards: document.querySelectorAll('#articles-container .article-card').length,
        links: document.querySelectorAll('#articles-list-container .article-list__item').length,
        notice: (document.querySelector('#articles-container .data-notice')||{}).textContent?.trim().slice(0,90),
        stateLoadingHidden: document.getElementById('state-loading').hidden,
        overflowX: document.documentElement.scrollWidth > innerWidth + 1
      };
    })()`);
    console.log(JSON.stringify(info));
    const sorted = info.order.filter(o => o[1] !== null).every((o, i, a) => i === 0 || o[1] >= a[i - 1][1]);
    console.log('  section order top→bottom:', info.order.map(o => `${o[0]}@${o[1]}`).join(' | '), '=> ascending:', sorted);

    // Hotspot alignment against config, in rendered pixels
    const align = await js(`(async () => {
      const cfg = await (await fetch('/data/city-hotspots.json')).json();
      const img = document.getElementById('city-img').getBoundingClientRect();
      let max = 0;
      for (const h of cfg.hotspots) {
        const r = document.querySelector('[data-hotspot="'+h.id+'"]').getBoundingClientRect();
        const ex = img.left + h.x / cfg.image.width * img.width, ey = img.top + h.y / cfg.image.height * img.height;
        const ew = h.w / cfg.image.width * img.width, eh = h.h / cfg.image.height * img.height;
        max = Math.max(max, Math.abs(r.left-ex), Math.abs(r.top-ey), Math.abs(r.width-ew), Math.abs(r.height-eh));
      }
      return +max.toFixed(2);
    })()`);
    console.log(`  max hotspot deviation from expected image position: ${align}px`);

    await js(`window.scrollTo(0,0)`);
    await shot(`${vp.name}-top.jpg`, { x: 0, y: 0, width: vp.width, height: Math.min(4200, info.order.at(-1)[1] ? info.order.at(-1)[1] + 160 : 3000) });

    // Real click (desktop/tablet: mouse) or keyboard (mobile) on a logo
    const target = vp.mobile ? 'nike-tower' : (vp.name === 'tablet' ? 'zara-upper' : 'hm-top-left');
    await js(`document.getElementById('city-stage').scrollIntoView({block:'center'})`);
    await sleep(300);
    if (vp.mobile) {
      await js(`document.querySelector('[data-hotspot="${target}"]').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    } else {
      const c = await js(`(() => { const r = document.querySelector('[data-hotspot="${target}"]').getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
      await sleep(200);
      console.log('  tooltip on hover:', await js(`(() => { const t = document.getElementById('city-tooltip'); return t.hidden ? '(hidden)' : t.textContent; })()`));
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    }
    const done = await waitFor(`document.querySelector('#brand-news-body .bn-list, #brand-news-body .bn-state--column, #brand-news-body .bn-footnote')`, 60000, 'brand news');
    await sleep(1200);
    const news = await js(`(() => {
      const items = [...document.querySelectorAll('#brand-news-body .bn-list')[0]?.querySelectorAll('.bn-item') || []];
      const firstListIsRecent = !document.querySelector('#brand-news-body .bn-state--column strong');
      const times = [...document.querySelectorAll('#brand-news-body .bn-item__time')].map(t => t.getAttribute('datetime'));
      return {
        panelHidden: document.getElementById('brand-news').hidden,
        title: document.getElementById('brand-news-title').textContent,
        kicker: document.getElementById('brand-news-kicker').textContent,
        activeHotspots: document.querySelectorAll('.hotspot--active').length,
        cityStillVisible: !document.getElementById('city-stage').hidden && document.getElementById('city-img').complete,
        stateText: (document.querySelector('#brand-news-body .bn-state')||{}).innerText,
        sections: [...document.querySelectorAll('#brand-news-body .bn-subhead')].map(e => e.innerText),
        itemCount: document.querySelectorAll('#brand-news-body .bn-item').length,
        sample: [...document.querySelectorAll('#brand-news-body .bn-item')].slice(0,3).map(i => ({
          time: i.querySelector('time').textContent, pub: i.querySelector('.bn-item__meta span:nth-of-type(2)')?.textContent,
          headline: i.querySelector('a').textContent.slice(0,80), href: i.querySelector('a').href.slice(0,60), target: i.querySelector('a').target })),
        footnote: (document.querySelector('#brand-news-body .bn-footnote')||{}).innerText?.slice(0,220),
        times
      };
    })()`);
    // verify recent-list timestamps are within 3h of now (everything before the "Latest available" subhead)
    const within = await js(`(() => {
      const body = document.getElementById('brand-news-body'); const sub = body.querySelector('.bn-subhead');
      const recent = [...body.querySelectorAll('.bn-item')].filter(i => !sub || (i.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING));
      const now = Date.now();
      return { recentCount: recent.length, allWithin3h: recent.every(i => { const a = now - new Date(i.querySelector('time').getAttribute('datetime')).getTime(); return a <= 3*3600e3 && a >= -600e3; }),
               sortedNewestFirst: recent.every((i, k, arr) => k === 0 || new Date(arr[k-1].querySelector('time').getAttribute('datetime')) >= new Date(i.querySelector('time').getAttribute('datetime'))) };
    })()`);
    console.log('  after clicking', target, JSON.stringify(news, null, 1));
    console.log('  three-hour check:', JSON.stringify(within));
    await shot(`${vp.name}-news.jpg`);

    // Back control returns to the image
    await js(`document.getElementById('brand-news-back').click()`);
    await sleep(600);
    console.log('  back → panel hidden:', await js(`document.getElementById('brand-news').hidden`), '| active hotspots:', await js(`document.querySelectorAll('.hotspot--active').length`));
    report[vp.name] = { order: sorted, align, news: news.title, within };
  }

  console.log('\nSUMMARY', JSON.stringify(report));
  ws.close(); proc.kill();
  process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
