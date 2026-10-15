# Global Brand Intelligence

> Inside the investments, technology and strategies shaping the world's leading brands.

A premium, AI-ready editorial newspaper covering 39 of the world's major brands across Fashion & Luxury, Beauty, Technology, Retail and Automotive sectors.

---

## Quick Start (no install required)

**Open `global-brand-intelligence.html` directly in your browser.**

The standalone file fetches live RSS feeds from 10 sources (Guardian Business, CNBC, MarketWatch, TechCrunch, Retail Dive, Ad Age, WWD, Business Insider and more) via a free CORS-friendly RSS proxy. No server, no Node.js, no API key required.

---

## Features

| Feature | Status |
|---|---|
| Live RSS news from 10 feeds | ✅ Working |
| 7 editorial sections (Headlines → Executive Insights) | ✅ Working |
| Brand directory — 39 brands, 5 industries | ✅ Working |
| Individual brand profile pages | ✅ Working |
| Brand relevance scoring (keyword matching) | ✅ Working |
| Search by brand, company, topic | ✅ Working |
| Filter by industry and date | ✅ Working |
| Deduplication | ✅ Working |
| Auto-refresh every 15 minutes | ✅ Working |
| Feed status panel (shows which feeds succeeded) | ✅ Working |
| Original source links (no fabricated content) | ✅ Working |
| Premium FT/Bloomberg editorial design | ✅ Working |
| Responsive mobile layout | ✅ Working |

---

## Adding Brands

Edit [`src/data/brands.json`](src/data/brands.json) (Node version) or the `BRANDS_DATA` object in `global-brand-intelligence.html` (standalone).

Each brand entry:
```json
{
  "id":      "unique-id",
  "name":    "Brand Name",
  "parent":  "Parent Company",
  "country": "Country",
  "ticker":  "TICKER",
  "website": "https://www.brand.com",
  "terms":   ["Brand Name", "Alias", "Sub-brand"]
}
```
No application code changes required.

---

## Node.js Server (optional — for future API features)

If you install Node.js (https://nodejs.org ≥ 18), you can run the full server:

```bash
npm install
npm start
# Opens at http://localhost:3000
```

The server provides REST endpoints for news, brands, search and refresh at `/api/*`.

---

## Data integrity

- **All articles link to original sources** — no headlines, dates, financial figures or links are fabricated.
- Articles are clearly labelled as live RSS data with a retrieval timestamp.
- The feed status panel on the Headlines section shows exactly which sources succeeded or failed.

---

## Architecture

```
global-brand-intelligence.html  ← Standalone app (open directly)
server.js                       ← Express backend (requires Node.js)
src/
  newsService.js                ← RSS fetching, brand scoring, dedup
  data/
    brands.json                 ← Editable brand directory
    feeds.json                  ← Editable RSS feed list
public/
  index.html                    ← Same as standalone (served by Node)
  css/style.css                 ← Editorial design system
  js/app.js                     ← Frontend application
```

---

## Stage 2 (planned)

- Historical investment database
- Advanced campaign analytics
- NewsAPI.org integration (requires API key — add to `.env`)
- Brand sentiment tracking
- Executive movement tracker
