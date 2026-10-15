'use strict';
// Offline test of the brand-news time-window logic using controlled feed data.
// Run: node scripts/test-brand-news.js
const assert = require('assert');
const Parser = require('rss-parser');
const newsService = require('../src/newsService');

const now = Date.now();
const at = mins => new Date(now - mins * 60000).toUTCString();
const gItem = (title, pub, pubDate, host) => ({
  title: `${title} - ${pub}`, link: `https://news.google.com/rss/articles/${encodeURIComponent(title)}`,
  pubDate, source: { _: pub, $: { url: host } }
});

Parser.prototype.parseURL = async function (url) {
  if (url.includes('when%3A3h')) {
    return { items: [
      gItem('H&M opens new flagship store', 'Retail Gazette', at(30), 'https://www.retailgazette.co.uk'),
      gItem('H&M Group appoints new regional head', 'H&M Group Newsroom', at(179), 'https://hmgroup.com'),
      gItem('H&M undated item', 'Mystery Wire', undefined, 'https://example.com'),
      gItem('H&M announced from the future', 'Clock Drift News', new Date(now + 3600e3).toUTCString(), 'https://example.com'),
      gItem('Weather turns cold in Stockholm', 'Weather Daily', at(10), 'https://example.com')   // off-topic
    ] };
  }
  return { items: [
    gItem('H&M opens new flagship store', 'Retail Gazette', at(30), 'https://www.retailgazette.co.uk'), // duplicate
    gItem('H&M quarterly sales slip', 'Reuters', at(181), 'https://www.reuters.com'),                   // just outside 3h
    gItem('H&M sustainability report released', 'Vogue Business', at(60 * 30), 'https://voguebusiness.com')
  ] };
};
newsService.peekCachedNews = () => ({ usingBaseline: true, articles: [] });

const { getBrandNews } = require('../src/brandNews');

(async () => {
  const r = await getBrandNews('hm', { hours: 3, refresh: true });
  const titles = a => a.map(x => x.title);

  assert.deepStrictEqual(titles(r.recent), ['H&M opens new flagship store', 'H&M Group appoints new regional head'], 'recent = within 3h, newest first');
  assert.deepStrictEqual(titles(r.older), ['H&M quarterly sales slip', 'H&M sustainability report released'], 'older kept separate, newest first');
  assert.strictEqual(r.recent.find(a => a.title.includes('appoints')).official, true, 'official domain flagged');
  assert.strictEqual(r.recent.find(a => a.title.includes('flagship')).official, false);
  assert.strictEqual(r.excluded.withoutPublicationDate, 1, 'undated item excluded and counted');
  assert.strictEqual(r.excluded.notAboutBrand, 1, 'off-topic item excluded');
  assert.ok(!titles(r.recent).concat(titles(r.older)).some(t => t.includes('future')), 'future-dated item never shown');
  assert.strictEqual(r.recent.length + r.older.length, 4, 'duplicate title removed');
  assert.strictEqual(r.allSourcesFailed, false);

  // Unknown brand
  await assert.rejects(() => getBrandNews('nope'), /Unknown brand/);

  // Strict matching: "Mango" must not match unrelated text, COS is case-sensitive
  const m = await getBrandNews('cos', { hours: 3, refresh: true });
  assert.strictEqual(m.recent.length + m.older.length, 0, 'COS: no false positives from H&M-only items');

  console.log('brand-news tests passed:', {
    recent: titles(r.recent), older: titles(r.older), excluded: r.excluded
  });
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
