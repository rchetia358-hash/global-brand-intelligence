'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();

const newsService = require('./src/newsService');
const brandNews   = require('./src/brandNews');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  const urlFile = path.join(__dirname, 'logs', 'current-tunnel-url.txt');
  let publicUrl = null;
  if (fs.existsSync(urlFile)) {
    publicUrl = fs.readFileSync(urlFile, 'utf8').trim();
  }
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0', publicUrl });
});

// Brand news — articles for one brand published within the last N hours (default 3)
app.get('/api/brand-news/:brandId', async (req, res) => {
  try {
    const hours = Math.min(24, Math.max(1, parseInt(req.query.hours, 10) || 3));
    const result = await brandNews.getBrandNews(req.params.brandId, { hours, refresh: req.query.refresh === 'true' });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    console.error('[API /brand-news]', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Official Corporate Press Releases
app.get('/api/press-releases', (req, res) => {
  try {
    const prPath = path.join(__dirname, 'src', 'data', 'press-releases.json');
    if (fs.existsSync(prPath)) {
      const data = JSON.parse(fs.readFileSync(prPath, 'utf8'));
      const { brandId, industry } = req.query;
      let releases = data.pressReleases || [];
      if (brandId && brandId !== 'all') {
        releases = releases.filter(r => r.brandId.toLowerCase() === brandId.toLowerCase());
      }
      if (industry && industry !== 'all') {
        releases = releases.filter(r => r.industry.toLowerCase() === industry.toLowerCase());
      }
      res.json({ success: true, count: releases.length, pressReleases: releases, _meta: data._meta });
    } else {
      res.json({ success: true, count: 0, pressReleases: [] });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Brand directory
app.get('/api/brands', (req, res) => {
  try {
    const data = newsService.getBrandsData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feed configuration
app.get('/api/feeds', (req, res) => {
  try {
    const data = newsService.getFeedsData();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// All news (with optional forceRefresh)
app.get('/api/news', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const result = await newsService.fetchAllNews({ forceRefresh });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[API /news]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// News by category
app.get('/api/news/category/:cat', async (req, res) => {
  try {
    const { cat } = req.params;
    const result  = await newsService.fetchAllNews();
    const articles = newsService.getArticlesByCategory(result.articles, cat);
    res.json({ success: true, category: cat, articles, fetchedAt: result.fetchedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// News by brand
app.get('/api/news/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const result   = await newsService.fetchAllNews();
    const articles = newsService.getArticlesByBrand(result.articles, brandId);
    res.json({ success: true, brandId, articles, fetchedAt: result.fetchedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Query must be at least 2 characters.' });
    }
    const result   = await newsService.fetchAllNews();
    const articles = newsService.searchArticles(result.articles, q.trim());
    res.json({ success: true, query: q.trim(), count: articles.length, articles, fetchedAt: result.fetchedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual refresh — clears cache and re-fetches
app.post('/api/refresh', async (req, res) => {
  try {
    newsService.reloadConfig();
    const result = await newsService.fetchAllNews({ forceRefresh: true });
    res.json({
      success:    true,
      message:    'Refresh complete.',
      totalCount: result.totalCount,
      fetchedAt:  result.fetchedAt,
      feedStatuses: result.feedStatuses
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache status
app.get('/api/status', (req, res) => {
  const lastFetch = newsService.getCacheAge();
  res.json({
    lastFetch,
    isStale: !lastFetch,
    time:    new Date().toISOString()
  });
});

// Case studies config API
app.get('/api/case-studies', (req, res) => {
  try {
    const file = path.join(__dirname, 'src', 'data', 'case-studies.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ success: true, caseStudies: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Serve frontend ────────────────────────────────────────────────────────────

app.get(['/case-studies', '/case-studies/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'case-studies.html'));
});

app.get(['/case-studies/hm-sustainability', '/case-studies/hm-sustainability/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'case-study-hm.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }

  console.log(`\n🗞  Global Brand Intelligence`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIp}:${PORT} (use this on your phone)`);
  console.log(`   Press Ctrl+C to stop.\n`);

  // Initial live feed warm-up and continuous 5-minute background refresh
  newsService.fetchAllNews({ forceRefresh: true }).catch(err => {
    console.warn('[Server] Initial feed warm-up error:', err.message);
  });
  setInterval(() => {
    newsService.fetchAllNews({ forceRefresh: true }).catch(err => {
      console.warn('[Server] Background feed refresh error:', err.message);
    });
  }, 5 * 60 * 1000);
});

module.exports = app;
