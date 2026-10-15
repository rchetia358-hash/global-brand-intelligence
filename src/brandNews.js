/**
 * Global Brand Intelligence — Brand News Service
 *
 * Returns news for ONE brand, split by genuine publication time:
 *   recent : published within the last N hours (default 3)
 *   older  : most recent articles outside the window (clearly separate)
 *
 * Sources (all real, none fabricated):
 *   1. Official feeds listed in brands.json -> officialFeeds [{ name, url }]
 *   2. Google News RSS search (publisher + real pubDate per item). Items whose
 *      publisher domain is listed in the brand's officialDomains are flagged "official".
 *   3. The site's own live RSS feeds (only when they were genuinely fetched live,
 *      never the saved baseline copy).
 *
 * Rules: an item without a parseable publication date is NEVER shown (it can't be
 * verified against the window) - the count is reported. retrievedAt is never used
 * as a publication time.
 */

'use strict';

const Parser = require('rss-parser');
const NodeCache = require('node-cache');
const newsService = require('./newsService');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; GlobalBrandIntelligence/1.0; RSS Reader)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: { item: ['source', 'media:content', 'media:thumbnail', 'enclosure'] }
});

const rawCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });   // 5 min of raw source data
const FUTURE_SKEW_MS = 10 * 60 * 1000;                              // tolerate small clock drift
const MAX_OLDER = 6;
const OLDER_LOOKBACK = '7d';

function findBrand(brandId) {
  for (const ind of newsService.getBrandsData().industries) {
    const b = ind.brands.find(x => x.id === brandId);
    if (b) return { brand: b, industry: ind };
  }
  return null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildMatcher(brand) {
  const terms = (brand.newsTerms && brand.newsTerms.length) ? brand.newsTerms : [brand.name, ...(brand.searchTerms || [])];
  const flags = brand.caseSensitive ? 'u' : 'iu';
  const wrap = (t, f) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(t)}(?:[^\\p{L}\\p{N}]|$)`, f);
  const res = terms.map(t => wrap(t, flags));
  const excl = (brand.newsExclude || []).map(t => wrap(t, 'iu'));
  return text => res.some(r => r.test(text)) && !excl.some(r => r.test(text));
}

function firstOf(v) { return Array.isArray(v) ? v[0] : v; }

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function domainMatches(host, domains) {
  return !!host && (domains || []).some(d => host === d || host.endsWith('.' + d));
}

function imageOf(item) {
  const enc = firstOf(item.enclosure);
  if (enc && enc.url && (!enc.type || /^image\//i.test(enc.type))) return enc.url;
  for (const key of ['media:content', 'media:thumbnail']) {
    const m = firstOf(item[key]);
    if (m && m.$ && m.$.url && !/video/i.test(m.$.type || '')) return m.$.url;
  }
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(item['content:encoded'] || item.content || '');
  return img && /^https?:/i.test(img[1]) ? img[1] : null;
}

// ── Source adapters ──────────────────────────────────────────────────────────

async function fromGoogleNews(brand, when) {
  const q = `${brand.newsQuery || `"${brand.name}"`} when:${when}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-GB&gl=GB&ceid=GB:en`;
  const feed = await parser.parseURL(url);
  return (feed.items || []).map(item => {
    const src = firstOf(item.source);
    const publisher = (src && (src._ || (typeof src === 'string' ? src : ''))) || '';
    const publisherUrl = src && src.$ && src.$.url ? src.$.url : '';
    let title = (item.title || '').trim();
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
    return {
      title,
      summary: '',                       // the search feed provides no article summary - never invent one
      url: item.link,
      image: null,
      publisher: publisher || 'Unknown publisher',
      publisherHost: hostOf(publisherUrl),
      pubDate: toIso(item.pubDate || item.isoDate),
      origin: 'google-news'
    };
  });
}

async function fromOfficialFeed(feedCfg) {
  const feed = await parser.parseURL(feedCfg.url);
  return (feed.items || []).map(item => ({
    title: (item.title || '').trim(),
    summary: (item.contentSnippet || item.summary || '').replace(/<[^>]*>/g, '').trim().slice(0, 320),
    url: item.link || item.guid,
    image: imageOf(item),
    publisher: feedCfg.name,
    publisherHost: hostOf(feedCfg.url),
    pubDate: toIso(item.pubDate || item.isoDate),
    origin: 'official-feed',
    forcedOfficial: true
  }));
}

async function collectRaw(brand) {
  const tasks = [
    { name: 'Google News (last 3h query)', type: 'news-search', run: () => fromGoogleNews(brand, '3h') },
    { name: `Google News (last ${OLDER_LOOKBACK})`, type: 'news-search', run: () => fromGoogleNews(brand, OLDER_LOOKBACK) },
    ...(brand.officialFeeds || []).map(f => ({ name: f.name, type: 'official-feed', run: () => fromOfficialFeed(f) }))
  ];
  const settled = await Promise.allSettled(tasks.map(t => t.run()));
  const items = [];
  const sources = [];
  settled.forEach((r, i) => {
    const t = tasks[i];
    if (r.status === 'fulfilled') {
      items.push(...r.value);
      sources.push({ name: t.name, type: t.type, ok: true, count: r.value.length });
    } else {
      sources.push({ name: t.name, type: t.type, ok: false, count: 0, error: r.reason && r.reason.message ? r.reason.message : 'Request failed' });
    }
  });
  return { items, sources };
}

// ── Public API ───────────────────────────────────────────────────────────────

async function getBrandNews(brandId, { hours = 3, refresh = false } = {}) {
  const found = findBrand(brandId);
  if (!found) { const e = new Error(`Unknown brand "${brandId}"`); e.status = 404; throw e; }
  const { brand } = found;
  const matches = buildMatcher(brand);

  const key = `raw:${brandId}`;
  let raw = refresh ? null : rawCache.get(key);
  if (!raw) { raw = await collectRaw(brand); rawCache.set(key, raw); }

  const sources = raw.sources.map(s => ({ ...s }));
  let items = raw.items.slice();

  // The site's own live RSS articles for this brand (cache only - never blocks, never the saved baseline copy).
  const live = newsService.peekCachedNews();
  if (live && !live.usingBaseline) {
    const own = live.articles
      .filter(a => matches(`${a.title} ${a.summary || ''}`))
      .map(a => ({
        title: a.title, summary: a.summary || '', url: a.url, image: a.image || null,
        publisher: a.source, publisherHost: hostOf(a.url), pubDate: a.pubDate, origin: 'site-rss'
      }));
    items.push(...own);
    sources.push({ name: 'Site RSS feeds', type: 'rss', ok: true, count: own.length });
  } else {
    sources.push({ name: 'Site RSS feeds', type: 'rss', ok: false, count: 0,
      error: live ? 'Live RSS feeds unreachable' : 'Not loaded yet' });
  }

  const now = Date.now();
  const windowMs = hours * 3600 * 1000;
  let withoutDate = 0, offTopic = 0;
  const seen = new Set();
  const recent = [], older = [];

  for (const it of items) {
    if (!it.title || !it.url) continue;
    if (!it.pubDate) { withoutDate++; continue; }          // unverifiable -> excluded, reported
    if (!matches(`${it.title} ${it.summary || ''}`)) { offTopic++; continue; }
    const norm = it.title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (seen.has(norm)) continue;
    seen.add(norm);

    const t = new Date(it.pubDate).getTime();
    const age = now - t;
    const official = it.forcedOfficial || domainMatches(it.publisherHost, brand.officialDomains);
    const out = {
      title: it.title, summary: it.summary || '', url: it.url, image: it.image || null,
      publisher: it.publisher, pubDate: it.pubDate, official, origin: it.origin
    };
    if (age <= windowMs && age >= -FUTURE_SKEW_MS) recent.push(out);
    else if (age > windowMs) older.push(out);
  }

  const byNewest = (a, b) => new Date(b.pubDate) - new Date(a.pubDate);
  recent.sort(byNewest);
  older.sort(byNewest);

  return {
    success: true,
    brand: { id: brand.id, name: brand.name, parent: brand.parent },
    windowHours: hours,
    generatedAt: new Date(now).toISOString(),
    windowStart: new Date(now - windowMs).toISOString(),
    recent,
    older: older.slice(0, MAX_OLDER),
    sources,
    excluded: { withoutPublicationDate: withoutDate, notAboutBrand: offTopic },
    allSourcesFailed: sources.every(s => !s.ok)
  };
}

module.exports = { getBrandNews };
