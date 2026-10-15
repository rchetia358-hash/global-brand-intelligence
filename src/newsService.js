/**
 * Global Brand Intelligence — News Aggregation Service
 * Fetches and processes articles from RSS feeds, scores relevance to tracked brands,
 * deduplicates, and categorises for the homepage sections.
 */

'use strict';

const Parser = require('rss-parser');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'GlobalBrandIntelligence/1.0 (RSS Reader; +https://globalbrandintelligence.com)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: {
    item: ['media:content', 'media:thumbnail', 'enclosure', 'dc:creator', 'author']
  }
});

// Cache: articles for 15 minutes, brand index indefinitely until restart
const articleCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });
const BRANDS_PATH    = path.join(__dirname, 'data/brands.json');
const FEEDS_PATH     = path.join(__dirname, 'data/feeds.json');
const BASELINE_PATH  = path.join(__dirname, 'data/baseline-articles.json');

let _brandsData = null;
let _feedsData  = null;

function getBrandsData() {
  if (!_brandsData) {
    _brandsData = JSON.parse(fs.readFileSync(BRANDS_PATH, 'utf8'));
  }
  return _brandsData;
}

function getFeedsData() {
  if (!_feedsData) {
    _feedsData = JSON.parse(fs.readFileSync(FEEDS_PATH, 'utf8'));
  }
  return _feedsData;
}

// Reload brand/feed data (called on manual refresh)
function reloadConfig() {
  _brandsData = null;
  _feedsData  = null;
  articleCache.flushAll();
  console.log('[NewsService] Config reloaded — cache cleared.');
}

// ─── Relevance scoring ─────────────────────────────────────────────────────────

/**
 * Build a flat map of searchTerm -> { brandId, brandName, industry }
 * for O(1) keyword lookups.
 */
function buildBrandIndex() {
  const brandsData = getBrandsData();
  const index = new Map();  // term (lowercase) → brand info array
  for (const industry of brandsData.industries) {
    for (const brand of industry.brands) {
      for (const term of brand.searchTerms) {
        const key = term.toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({
          brandId:   brand.id,
          brandName: brand.name,
          parent:    brand.parent,
          industry:  industry.id,
          industryLabel: industry.label,
          country:   brand.country
        });
      }
    }
  }
  return index;
}

function scoreBrandRelevance(text, brandIndex) {
  const lower = text.toLowerCase();
  const matched = new Map();
  for (const [term, brands] of brandIndex) {
    // Unicode-aware word boundary matching handles typographic quotes, colons, question marks
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:[^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(lower)) {
      for (const b of brands) {
        const key = b.brandId;
        if (!matched.has(key)) matched.set(key, b);
      }
    }
  }
  return [...matched.values()];
}

// ─── Categorisation ────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  headlines:   [],  // catch-all — all articles appear here
  corporate:   ['acqui', 'merger', 'takeover', 'acquisition', 'appoint', 'ceo', 'chairman', 'board', 'restructur', 'spinoff', 'spin-off', 'joint venture', 'partnership', 'deal', 'agreement'],
  investment:  ['invest', 'fund', 'venture capital', 'vc', 'ipo', 'listing', 'valuation', 'private equity', 'pe firm', 'debt', 'bond', 'share', 'stake', 'raise', 'funding', 'ai', 'artificial intelligence', 'technology', 'digital', 'ecommerce', 'e-commerce'],
  marketing:   ['campaign', 'brand', 'advertis', 'collaborat', 'collabor', 'launch', 'collection', 'fashion', 'beauty', 'luxury', 'design', 'creative', 'ambassador', 'influencer', 'sponsor', 'marketing'],
  expansion:   ['expand', 'expansion', 'open', 'store', 'market', 'international', 'global', 'china', 'asia', 'europe', 'middle east', 'africa', 'latin america', 'retail', 'outlet'],
  financial:   ['revenue', 'profit', 'loss', 'earnings', 'quarter', 'annual', 'result', 'sales', 'margin', 'ebit', 'ebitda', 'guidance', 'forecast', 'dividend', 'buyback'],
  executive:   ['strategy', 'strategic', 'ceo', 'chief', 'executive', 'leader', 'vision', 'interview', 'comment', 'statement', 'speech', 'outlook', 'plan']
};

function categoriseArticle(title, summary) {
  const text  = `${title} ${summary}`.toLowerCase();
  const cats  = new Set(['headlines']);
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === 'headlines') continue;
    for (const kw of keywords) {
      if (text.includes(kw)) { cats.add(cat); break; }
    }
  }
  return [...cats];
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    // Normalise: lowercase, remove punctuation, collapse whitespace
    const norm = a.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

// ─── Feed fetching ─────────────────────────────────────────────────────────────

function firstOf(v) { return Array.isArray(v) ? v[0] : v; }

// Returns the item's own image URL exactly as published in the feed, or null.
function extractImage(item) {
  const candidates = [];
  const enc = firstOf(item.enclosure);
  if (enc && enc.url && (!enc.type || /^image\//i.test(enc.type))) candidates.push(enc.url);
  for (const key of ['media:content', 'media:thumbnail']) {
    const m = firstOf(item[key]);
    if (m && m.$ && m.$.url && !/video/i.test(m.$.type || '') && (!m.$.medium || m.$.medium === 'image')) candidates.push(m.$.url);
  }
  const html = item['content:encoded'] || item.content || '';
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (img) candidates.push(img[1]);
  return candidates.find(u => /^https?:\/\//i.test(u)) || null;
}

function safeIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchFeed(feed, brandIndex) {
  try {
    const feedData = await parser.parseURL(feed.url);
    const articles = [];
    for (const item of (feedData.items || [])) {
      const title   = item.title   || '';
      const summary = item.contentSnippet || item.summary || item.content || '';
      const link    = item.link    || item.guid || '';
      const pubDate = item.pubDate || item.isoDate || null;
      const author  = item.author  || item['dc:creator'] || feedData.title || feed.name;

      if (!title || !link) continue;

      const text          = `${title} ${summary}`;
      const matchedBrands = scoreBrandRelevance(text, brandIndex);

      articles.push({
        id:              Buffer.from(link).toString('base64').slice(0, 24),
        title:           title.trim(),
        summary:         summary.replace(/<[^>]*>/g, '').trim().slice(0, 400),
        url:             link,
        image:           extractImage(item),
        source:          feed.name,
        sourceId:        feed.id,
        pubDate:         safeIso(pubDate),
        retrievedAt:     new Date().toISOString(),
        categories:      categoriseArticle(title, summary),
        matchedBrands,
        isReal:          true   // Clearly marks these as real fetched articles
      });
    }
    return { success: true, feedId: feed.id, count: articles.length, articles };
  } catch (err) {
    console.warn(`[NewsService] Feed error [${feed.id}]: ${err.message}`);
    return { success: false, feedId: feed.id, count: 0, articles: [], error: err.message };
  }
}

// ─── Main public API ───────────────────────────────────────────────────────────

async function fetchAllNews({ forceRefresh = false } = {}) {
  const CACHE_KEY = 'all_articles';

  if (!forceRefresh) {
    const cached = articleCache.get(CACHE_KEY);
    if (cached) {
      console.log('[NewsService] Serving from cache.');
      return cached;
    }
  }

  console.log('[NewsService] Fetching live feeds…');
  const feedsData  = getFeedsData();
  const brandIndex = buildBrandIndex();
  const enabledFeeds = feedsData.feeds.filter(f => f.enabled);

  // Fetch all feeds in parallel; cap concurrency to avoid overwhelming servers
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < enabledFeeds.length; i += BATCH) {
    const batch = enabledFeeds.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(f => fetchFeed(f, brandIndex)));
    results.push(...batchResults);
  }

  // Flatten, deduplicate, sort: brand-matched stories first, then chronologically
  let allArticles = results.flatMap(r => r.articles);
  allArticles = deduplicate(allArticles);
  allArticles.sort((a, b) => {
    const aBrand = (a.matchedBrands && a.matchedBrands.length > 0) ? 1 : 0;
    const bBrand = (b.matchedBrands && b.matchedBrands.length > 0) ? 1 : 0;
    if (aBrand !== bBrand) return bBrand - aBrand;
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const feedStatuses = results.map(r => ({
    feedId:  r.feedId,
    success: r.success,
    count:   r.count,
    error:   r.error || null
  }));

  // ── Baseline fallback ─────────────────────────────────────────────────────
  // When no live feeds succeed (e.g. network unavailable in dev sandbox),
  // merge in the curated baseline articles so the homepage is never empty.
  // Live articles always take priority; baseline articles only fill the gap.
  let finalArticles = allArticles;
  if (finalArticles.length === 0 && fs.existsSync(BASELINE_PATH)) {
    try {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
      finalArticles = Array.isArray(baseline) ? baseline : [];
      console.log(`[NewsService] Live feeds returned 0 articles — serving ${finalArticles.length} baseline articles.`);
    } catch (e) {
      console.warn('[NewsService] Baseline load error:', e.message);
    }
  }

  const payload = {
    articles:    finalArticles,
    feedStatuses,
    fetchedAt:   new Date().toISOString(),
    totalCount:  finalArticles.length,
    isStale:     allArticles.length === 0,
    usingBaseline: allArticles.length === 0
  };

  articleCache.set(CACHE_KEY, payload);
  console.log(`[NewsService] Fetched ${allArticles.length} live articles + ${finalArticles.length - allArticles.length} baseline from ${enabledFeeds.length} feeds.`);
  return payload;
}

function getArticlesByCategory(articles, category) {
  if (category === 'headlines') return articles;
  return articles.filter(a => a.categories.includes(category));
}

function getArticlesByBrand(articles, brandId) {
  return articles.filter(a => a.matchedBrands.some(b => b.brandId === brandId));
}

function searchArticles(articles, query) {
  const q = query.toLowerCase();
  return articles.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.matchedBrands.some(b => b.brandName.toLowerCase().includes(q) || b.industryLabel.toLowerCase().includes(q))
  );
}

function getCacheAge() {
  const keys = articleCache.keys();
  if (!keys.includes('all_articles')) return null;
  const ttl = articleCache.getTtl('all_articles');
  if (!ttl) return null;
  return new Date(ttl - 900_000).toISOString();
}

// Non-blocking: returns the cached payload if present, otherwise null (never triggers a fetch)
function peekCachedNews() {
  return articleCache.get('all_articles') || null;
}

module.exports = {
  fetchAllNews,
  peekCachedNews,
  getArticlesByCategory,
  getArticlesByBrand,
  searchArticles,
  reloadConfig,
  getCacheAge,
  getBrandsData,
  getFeedsData
};
