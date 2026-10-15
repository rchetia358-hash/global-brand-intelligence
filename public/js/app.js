/**
 * Global Brand Intelligence — Frontend Application
 * Single-page news reader: fetches from /api, renders sections, handles navigation.
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════════ */
const State = {
  view:            'home',    // 'home' | 'brands' | 'brand-profile' | 'search'
  section:         'headlines',
  articles:        [],
  pressReleases:   [],
  feedStatuses:    [],
  fetchedAt:       null,
  brandsData:      null,
  activeBrandId:       null,
  selectedBrandFilter: '',
  filterIndustry:      '',
  filterCountry:       '',
  filterDate:          '',
  searchQuery:         '',
  isLoading:           false,
  lastError:           null,
};

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION CONFIG
═══════════════════════════════════════════════════════════════════════════ */
const SECTIONS = {
  headlines:  { title: "Today's Global Brand Headlines",           sub: 'The top brand stories from around the world.' },
  corporate:  { title: 'Major Corporate Announcements',            sub: 'Deals, appointments, mergers, restructurings and partnerships.' },
  investment: { title: 'Investment & Technology Highlights',       sub: 'Capital flows, funding rounds, AI and digital transformation.' },
  marketing:  { title: 'Marketing & Campaign News',               sub: 'Brand campaigns, product launches, collaborations and creative strategies.' },
  expansion:  { title: 'International Expansion',                  sub: 'New markets, store openings, global retail and cross-border growth.' },
  financial:  { title: 'Brand Financial Results',                  sub: 'Earnings, revenue, margins and quarterly guidance.' },
  executive:  { title: 'Executive Strategic Insights',             sub: 'CEO commentary, strategic vision and leadership perspectives.' },
};

/* ═══════════════════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const dom = {
  pubDate:         $('pub-date'),
  statusDot:       $('status-dot'),
  statusText:      $('status-text'),
  refreshBtn:      $('refresh-btn'),
  filterBar:       $('filter-bar'),
  filterIndustry:  $('filter-industry'),
  filterCountry:   $('filter-country'),
  filterDate:      $('filter-date'),
  filterClear:     $('filter-clear'),
  filterCount:     $('filter-count'),
  brandPillsBar:   $('brand-pills-bar'),
  sectionTitle:    $('section-title'),
  sectionSub:      $('section-sub'),
  stateLoading:    $('state-loading'),
  stateError:      $('state-error'),
  stateEmpty:      $('state-empty'),
  errorMsg:        $('error-msg'),
  errorRetryBtn:   $('error-retry-btn'),
  staleBanner:     $('stale-banner'),
  staleRefreshBtn: $('stale-refresh-btn'),
  articlesContainer: $('articles-container'),
  viewHome:        $('view-home'),
  viewBrands:      $('view-brands'),
  viewBrandProfile:$('view-brand-profile'),
  viewSearch:      $('view-search'),
  brandDirectory:  $('brand-directory'),
  brandProfileContent: $('brand-profile-content'),
  searchResultsContainer: $('search-results-container'),
  searchResultsSub: $('search-results-sub'),
  footerFetchTime: $('footer-fetch-time'),
  searchForm:      $('search-form'),
  searchInput:     $('search-input'),
  pressReleasesSection: $('press-releases-section'),
  pressReleasesGrid:    $('press-releases-grid'),
  cityVisual:           $('city-visual'),
  articlesList:         $('articles-list-container'),
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function formatDate(iso) {
  if (!iso) return 'Date unknown';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return 'Date unknown';
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24)   return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7)   return `${diffDays}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function formatFullDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return iso; }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

function showEl(el)  { if (el) el.hidden = false; }
function hideEl(el)  { if (el) el.hidden = true; }

function setStatus(state) {
  dom.statusDot.className = 'status-dot';
  if (state === 'loading') {
    dom.statusDot.classList.add('status-dot--loading');
    dom.statusText.textContent = 'Updating…';
  } else if (state === 'ok') {
    dom.statusDot.classList.add('status-dot--ok');
    dom.statusText.textContent = `Updated ${formatDate(State.fetchedAt)}`;
  } else {
    dom.statusDot.classList.add('status-dot--error');
    dom.statusText.textContent = 'Update failed';
  }
}

function filterArticlesByDate(articles, dateFilter) {
  if (!dateFilter) return articles;
  const now = Date.now();
  const limits = { '24h': 86400000, '48h': 172800000, '7d': 604800000, '30d': 2592000000 };
  const ms = limits[dateFilter];
  if (!ms) return articles;
  return articles.filter(a => {
    if (!a.pubDate) return false;
    return (now - new Date(a.pubDate).getTime()) <= ms;
  });
}

function filterArticlesByIndustry(articles, industry) {
  if (!industry) return articles;
  return articles.filter(a =>
    a.matchedBrands && a.matchedBrands.some(b => b.industry === industry)
  );
}

function filterArticlesByCountry(articles, country) {
  if (!country) return articles;
  return articles.filter(a => {
    if (!a.matchedBrands) return false;
    return a.matchedBrands.some(b => {
      // Find brand country in brandsData
      if (!State.brandsData) return false;
      for (const ind of State.brandsData.industries) {
        const found = ind.brands.find(item => item.id === b.brandId);
        if (found && found.country === country) return true;
      }
      return false;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════════════════════ */
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARTICLE RENDERING
═══════════════════════════════════════════════════════════════════════════ */
function renderBrandTags(matchedBrands) {
  if (!matchedBrands || !matchedBrands.length) return '';
  // Show first 2 brand tags max
  return matchedBrands.slice(0, 2).map(b =>
    `<button class="article-card__brand-tag" data-brand-id="${escHtml(b.brandId)}" title="View ${escHtml(b.brandName)} profile">${escHtml(b.brandName)}</button>`
  ).join('');
}

function renderArticleCard(article, isLead = false) {
  const brandTags = renderBrandTags(article.matchedBrands);
  const kicker = article.source || '';
  const dateStr = formatDate(article.pubDate);
  const summary = truncate(article.summary, isLead ? 280 : 180);
  const fullDate = article.pubDate ? `title="${escHtml(formatFullDate(article.pubDate))}"` : '';

  const imageHtml = article.image
    ? `<a class="article-card__image-link" href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">
        <img class="article-card__image" src="${escHtml(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.closest('.article-card__image-link').remove()">
      </a>`
    : '';

  return `
    <article class="article-card ${isLead ? 'article-card--lead' : ''}" data-article-id="${escHtml(article.id)}">
      ${imageHtml}
      <div class="article-card__kicker">
        <span class="article-card__source">${escHtml(kicker)}</span>
        ${brandTags}
      </div>
      <h3 class="article-card__headline">
        <a href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer">
          ${escHtml(article.title)}
        </a>
      </h3>
      ${summary ? `<p class="article-card__summary">${escHtml(summary)}</p>` : ''}
      <div class="article-card__meta">
        <time ${fullDate}>${escHtml(dateStr)}</time>
        <span class="article-card__meta-sep">·</span>
        <span>${escHtml(article.source)}</span>
        <a class="article-card__read-more" href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer">
          Read original
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </a>
      </div>
    </article>
  `.trim();
}

function renderArticleListItem(article) {
  const dateStr = formatDate(article.pubDate);
  return `
    <li class="article-list__item">
      <p class="article-list__headline">
        <a href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escHtml(article.title)}</a>
      </p>
      <div class="article-list__meta">
        <span>${escHtml(article.source)}</span>
        <span>·</span>
        <time>${escHtml(dateStr)}</time>
        ${article.matchedBrands && article.matchedBrands[0]
          ? `<span>·</span><button class="article-card__brand-tag" data-brand-id="${escHtml(article.matchedBrands[0].brandId)}">${escHtml(article.matchedBrands[0].brandName)}</button>`
          : ''}
      </div>
    </li>
  `.trim();
}

function renderArticleCards(articles) {
  const lead = articles.slice(0, 2);
  const grid = articles.slice(2, 8);
  let html = '';

  // Lead pair
  if (lead.length) {
    html += `<div class="articles-lead">`;
    lead.forEach((a, i) => { html += renderArticleCard(a, i === 0); });
    html += `</div>`;
  }

  // 3-column grid
  if (grid.length) {
    html += `<div class="articles-grid">`;
    grid.forEach(a => { html += renderArticleCard(a); });
    html += `</div>`;
  }
  return html;
}

function renderArticleLinksList(articles, withDivider = true) {
  const listRem = articles.slice(8, 22);
  if (!listRem.length) return '';
  let html = withDivider ? `<div class="section-divider"></div>` : '';
  html += `<ul class="article-list">`;
  listRem.forEach(a => { html += renderArticleListItem(a); });
  html += `</ul>`;
  return html;
}

function renderArticlesSection(articles) {
  if (!articles.length) return '';
  return renderArticleCards(articles) + renderArticleLinksList(articles);
}

function renderFeedStatuses(statuses) {
  if (!statuses || !statuses.length) return '';
  const feedsData = State.feedsData;
  const feedMap = {};
  if (feedsData) {
    feedsData.feeds.forEach(f => { feedMap[f.id] = f.name; });
  }
  let html = `<div class="feed-status-grid">`;
  statuses.forEach(s => {
    const name  = feedMap[s.feedId] || s.feedId;
    const dotCl = s.success ? 'feed-status-card__dot--ok' : 'feed-status-card__dot--error';
    const cnt   = s.success ? `${s.count} articles` : 'Failed';
    html += `
      <div class="feed-status-card">
        <span class="feed-status-card__dot ${dotCl}"></span>
        <span class="feed-status-card__name">${escHtml(name)}</span>
        <span class="feed-status-card__count">${escHtml(cnt)}</span>
      </div>`;
  });
  html += `</div>`;
  return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VIEW RENDERING
═══════════════════════════════════════════════════════════════════════════ */
function showView(name) {
  ['home','brands','brand-profile','search'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.hidden = (v !== name);
  });
  State.view = name;
}

function renderHomeSection() {
  const section = State.section;
  const cfg = SECTIONS[section] || SECTIONS.headlines;
  dom.sectionTitle.textContent = cfg.title;
  dom.sectionSub.textContent   = cfg.sub;

  // Toggle brand pills bar (prominent on headlines)
  if (dom.brandPillsBar) {
    if (section === 'headlines') {
      showEl(dom.brandPillsBar);
    } else {
      hideEl(dom.brandPillsBar);
    }
  }

  // The interactive city visual belongs to the headlines front page only
  if (dom.cityVisual) dom.cityVisual.hidden = (section !== 'headlines');

  // Press releases section only shows on the headlines tab
  if (dom.pressReleasesSection) {
    if (section === 'headlines') {
      // Render filtered press releases
      let prs = State.pressReleases || [];
      if (State.selectedBrandFilter) {
        const qb = State.selectedBrandFilter.toLowerCase();
        prs = prs.filter(pr =>
          pr.brandName.toLowerCase().includes(qb) ||
          (pr.industry || '').toLowerCase().includes(qb)
        );
      }
      renderPressReleasesSection(prs);
    } else {
      dom.pressReleasesSection.hidden = true;
    }
  }

  // Filter articles
  let articles = State.articles.filter(a => a.categories && a.categories.includes(section));

  // On headlines, ensure brand-matched stories appear at the top
  if (section === 'headlines') {
    articles = [...articles].sort((a, b) => {
      const aBrand = (a.matchedBrands && a.matchedBrands.length > 0) ? 1 : 0;
      const bBrand = (b.matchedBrands && b.matchedBrands.length > 0) ? 1 : 0;
      if (aBrand !== bBrand) return bBrand - aBrand;
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });
  }

  // Filter by selected quick brand pill if active
  if (State.selectedBrandFilter) {
    const qb = State.selectedBrandFilter.toLowerCase();
    articles = articles.filter(a => {
      if (a.matchedBrands && a.matchedBrands.some(b => b.brandName.toLowerCase().includes(qb))) return true;
      return (a.title + ' ' + (a.summary || '')).toLowerCase().includes(qb);
    });
  }

  articles = filterArticlesByIndustry(articles, State.filterIndustry);
  articles = filterArticlesByCountry(articles, State.filterCountry);
  articles = filterArticlesByDate(articles, State.filterDate);

  // Show / hide filter bar
  showEl(dom.filterBar);

  // Update count
  dom.filterCount.textContent = articles.length
    ? `${articles.length} article${articles.length !== 1 ? 's' : ''}`
    : '';

  hideEl(dom.stateLoading);
  hideEl(dom.stateError);
  hideEl(dom.stateEmpty);

  if (!articles.length) {
    hideEl(dom.articlesContainer);
    hideEl(dom.articlesList);
    // If there are no articles but press releases are showing, don't show empty state
    if (section === 'headlines' && State.pressReleases && State.pressReleases.length && !State.selectedBrandFilter) {
      return;
    }
    showEl(dom.stateEmpty);
    return;
  }

  const dataNotice = State.liveRss
    ? `
    <p class="data-notice data-notice--real">
      <span class="data-notice__dot"></span>
      Live articles from RSS feeds — all links go to original sources.
      Last updated: ${State.fetchedAt ? formatFullDate(State.fetchedAt) : 'Unknown'}.
    </p>`
    : `
    <p class="data-notice">
      <span class="data-notice__dot"></span>
      Saved copy of earlier RSS retrievals (each with its original publication date) — live feeds are not reachable right now. All links go to original sources.
    </p>`;

  dom.articlesContainer.innerHTML = dataNotice + renderArticleCards(articles);

  // Written news links (below the Industry Filter), then feed status on headlines
  const listHtml = renderArticleLinksList(articles, false);
  dom.articlesList.innerHTML = listHtml;
  if (section === 'headlines' && State.feedStatuses.length) {
    dom.articlesList.insertAdjacentHTML('beforeend', renderFeedStatuses(State.feedStatuses));
  }

  showEl(dom.articlesContainer);
  if (dom.articlesList.innerHTML.trim()) showEl(dom.articlesList); else hideEl(dom.articlesList);
}


function renderBrandDirectory() {
  if (!State.brandsData) return;
  let html = '';
  State.brandsData.industries.forEach(ind => {
    html += `<section class="brand-industry-section">
      <h3 class="brand-industry-section__title">${escHtml(ind.icon)} ${escHtml(ind.label)}</h3>
      <div class="brand-grid">`;
    ind.brands.forEach(b => {
      const ticker = b.ticker ? `<span class="brand-card__ticker">${escHtml(b.ticker)}</span>` : '';
      html += `
        <button class="brand-card" data-brand-id="${escHtml(b.id)}" aria-label="View ${escHtml(b.name)} profile">
          <div class="brand-card__name">${escHtml(b.name)}</div>
          <div class="brand-card__parent">${escHtml(b.parent)}</div>
          <div class="brand-card__meta">
            <span class="brand-card__country">${escHtml(b.country)}</span>
            ${ticker}
          </div>
        </button>`;
    });
    html += `</div></section>`;
  });
  dom.brandDirectory.innerHTML = html;
}

function renderBrandProfile(brandId) {
  if (!State.brandsData) return;
  let brand = null, industry = null;
  for (const ind of State.brandsData.industries) {
    const found = ind.brands.find(b => b.id === brandId);
    if (found) { brand = found; industry = ind; break; }
  }
  if (!brand) { showView('brands'); return; }

  // Articles for this brand
  const articles = State.articles.filter(a =>
    a.matchedBrands && a.matchedBrands.some(b => b.brandId === brandId)
  );

  const tickerHtml = brand.ticker
    ? `<span class="brand-profile__chip">Ticker: ${escHtml(brand.ticker)}</span>` : '';
  const websiteHtml = brand.website
    ? `<a class="btn btn--ghost btn--sm" href="${escHtml(brand.website)}" target="_blank" rel="noopener noreferrer">Official website ↗</a>` : '';

  let html = `
    <div class="brand-profile__header">
      <div>
        <h2 class="brand-profile__name">${escHtml(brand.name)}</h2>
        <p class="brand-profile__parent">${escHtml(brand.parent)}</p>
        <div class="brand-profile__chips">
          <span class="brand-profile__chip">${escHtml(industry.label)}</span>
          <span class="brand-profile__chip">${escHtml(brand.country)}</span>
          ${tickerHtml}
        </div>
      </div>
      <div class="brand-profile__actions">
        ${websiteHtml}
        <button class="btn btn--ghost btn--sm" id="back-to-directory">← Back to directory</button>
      </div>
    </div>`;

  if (!articles.length) {
    html += `<div class="state-panel state-panel--empty">
      <p class="state-panel__msg">No recent articles found for ${escHtml(brand.name)}. Try refreshing the news.</p>
    </div>`;
  } else {
    html += `<div class="section-header">
      <h3 class="section-header__title">Latest News — ${escHtml(brand.name)}</h3>
      <p class="section-header__sub">${articles.length} article${articles.length !== 1 ? 's' : ''} from live feeds.</p>
    </div>`;
    html += renderArticlesSection(articles);
  }

  dom.brandProfileContent.innerHTML = html;

  document.getElementById('back-to-directory')?.addEventListener('click', () => {
    showView('brands');
    State.activeBrandId = null;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════════════════════════ */
async function loadBrandsData() {
  if (State.brandsData) return;
  try {
    const res = await apiGet('/api/brands');
    if (res.success) {
      State.brandsData = res.data;
      populateIndustryFilter();
      populateCountryFilter();
      renderBrandDirectory();
    }
  } catch (e) {
    console.warn('[App] Failed to load brand data:', e);
  }
}

// Load feeds config for status rendering
async function loadFeedsData() {
  try {
    const res = await apiGet('/api/feeds');
    if (res.success) State.feedsData = res.data;
  } catch (e) { /* non-critical */ }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESS RELEASES — RENDER & LOAD
═══════════════════════════════════════════════════════════════════════════ */

const BRAND_INITIALS = {
  apple: 'A', nvidia: 'N', google: 'G', tesla: 'T', lvmh: 'L', mercedes: 'M',
  zara: 'Z', nike: 'NK', starbucks: 'S', ferrari: 'F', chanel: 'C', microsoft: 'MS'
};

function renderPressReleaseCard(pr, isFeatured = false) {
  const initials = BRAND_INITIALS[pr.brandId] || pr.brandName.charAt(0);
  const dateStr = formatDate(pr.pubDate);
  const summary = truncate(pr.summary, isFeatured ? 220 : 150);
  const safeImg = escHtml(pr.imageUrl || '');
  const safeUrl = escHtml(pr.url);
  const safeTitle = escHtml(pr.title);
  const safeCompany = escHtml(pr.brandName);
  const safeNewsroom = escHtml(pr.newsroom || pr.brandName + ' Newsroom');
  const safeTag = escHtml(pr.tag || '');
  const safeDate = escHtml(dateStr);
  const safeSummary = escHtml(summary);

  return `
    <article class="pr-card ${isFeatured ? 'pr-card--featured' : ''}">
      <div class="pr-card__image-wrap">
        ${safeImg ? `<img
          class="pr-card__image"
          src="${safeImg}"
          alt="${safeTitle}"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        ><div class="pr-card__image-fallback" style="display:none">${escHtml(initials)}</div>` :
        `<div class="pr-card__image-fallback">${escHtml(initials)}</div>`}
        <div class="pr-card__tag-bar">
          <span class="pr-card__newsroom-tag">${safeNewsroom}</span>
          ${safeTag ? `<span class="pr-card__topic-tag">${safeTag}</span>` : ''}
        </div>
      </div>
      <div class="pr-card__body">
        <div class="pr-card__company">${safeCompany}</div>
        <h3 class="pr-card__headline">${safeTitle}</h3>
        ${safeSummary ? `<p class="pr-card__summary">${safeSummary}</p>` : ''}
        <div class="pr-card__meta">
          <time>${safeDate}</time>
          <a class="pr-card__read-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
            Read release
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </a>
        </div>
      </div>
    </article>
  `.trim();
}

function renderPressReleasesSection(releases) {
  if (!dom.pressReleasesGrid || !dom.pressReleasesSection) return;
  if (!releases || !releases.length) {
    dom.pressReleasesSection.hidden = true;
    return;
  }

  let html = '';
  releases.forEach((pr, i) => {
    html += renderPressReleaseCard(pr, pr.featured === true && i < 2);
  });
  dom.pressReleasesGrid.innerHTML = html;
  dom.pressReleasesSection.hidden = false;
}

async function loadPressReleases() {
  // Use baseline data immediately for instant display
  if (window.BASELINE_PRESS_RELEASES && window.BASELINE_PRESS_RELEASES.length) {
    State.pressReleases = window.BASELINE_PRESS_RELEASES;
    if (State.view === 'home' && State.section === 'headlines') {
      renderPressReleasesSection(State.pressReleases);
    }
  }

  // Then try to fetch fresh data from server
  try {
    const res = await apiGet('/api/press-releases');
    if (res.success && res.pressReleases && res.pressReleases.length) {
      State.pressReleases = res.pressReleases;
      if (State.view === 'home' && State.section === 'headlines') {
        renderPressReleasesSection(State.pressReleases);
      }
    }
  } catch (e) {
    console.warn('[App] Press releases fetch failed, using baseline:', e.message);
    // Baseline already shown above — no action needed
  }
}

async function loadNews(forceRefresh = false) {
  State.isLoading = true;
  State.lastError  = null;
  setStatus('loading');
  dom.refreshBtn.disabled = true;

  if (State.view === 'home') {
    showEl(dom.stateLoading);
    hideEl(dom.stateError);
    hideEl(dom.stateEmpty);
    hideEl(dom.articlesContainer);
    hideEl(dom.articlesList);
  }

  try {
    const url  = forceRefresh ? '/api/news?refresh=true' : '/api/news';
    const res  = await apiGet(url);

    if (!res.success) throw new Error(res.error || 'API returned failure');

    State.articles    = res.articles     || [];
    State.feedStatuses = res.feedStatuses || [];
    State.fetchedAt   = res.fetchedAt;
    State.liveRss     = !res.usingBaseline;

    hideEl(dom.stateLoading);
    hideEl(dom.staleBanner);
    if (res.usingBaseline) showEl(dom.staleBanner);
    setStatus('ok');

    if (dom.footerFetchTime) {
      dom.footerFetchTime.textContent = `Data last fetched: ${formatFullDate(State.fetchedAt)}.`;
    }

    // Re-render current view
    if (State.view === 'home')         renderHomeSection();
    if (State.view === 'brand-profile') renderBrandProfile(State.activeBrandId);
    if (State.view === 'search')       doSearch(State.searchQuery, false);

  } catch (err) {
    console.error('[App] News load error:', err);
    State.lastError = err.message;
    setStatus('error');
    hideEl(dom.stateLoading);
    // If we already have baseline articles, keep them showing — don't blank out the page
    if (State.articles && State.articles.length > 0) {
      if (State.view === 'home') renderHomeSection();
    } else {
      hideEl(dom.articlesContainer);
      dom.errorMsg.textContent = `Unable to load live news: server offline. Showing cached intelligence.`;
      if (State.view === 'home') showEl(dom.stateError);
    }
  } finally {
    State.isLoading      = false;
    dom.refreshBtn.disabled = false;
  }
}

async function doSearch(query, updateState = true) {
  if (updateState) State.searchQuery = query;
  if (!query || query.length < 2) return;
  try {
    const res = await apiGet(`/api/search?q=${encodeURIComponent(query)}`);
    showView('search');
    hideEl(dom.filterBar);
    dom.searchResultsSub.textContent = res.success
      ? `${res.count} result${res.count !== 1 ? 's' : ''} for "${query}"`
      : `Search failed: ${res.error}`;
    if (res.success && res.articles) {
      dom.searchResultsContainer.innerHTML = renderArticlesSection(res.articles);
    }
  } catch (e) {
    dom.searchResultsSub.textContent = `Search error: ${e.message}`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function populateIndustryFilter() {
  if (!State.brandsData) return;
  const select = dom.filterIndustry;
  // Clear all but first option
  while (select.options.length > 1) select.remove(1);
  State.brandsData.industries.forEach(ind => {
    const opt = document.createElement('option');
    opt.value = ind.id;
    opt.textContent = ind.label;
    select.appendChild(opt);
  });
}

function populateCountryFilter() {
  if (!State.brandsData || !dom.filterCountry) return;
  const select = dom.filterCountry;
  while (select.options.length > 1) select.remove(1);
  const countries = new Set();
  State.brandsData.industries.forEach(ind => {
    ind.brands.forEach(b => {
      if (b.country) countries.add(b.country);
    });
  });
  Array.from(countries).sort().forEach(country => {
    const opt = document.createElement('option');
    opt.value = country;
    opt.textContent = country;
    select.appendChild(opt);
  });
}

function setActiveNavLink(view, section) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.remove('nav-link--active');
    el.removeAttribute('aria-current');
    const elView    = el.dataset.view;
    const elSection = el.dataset.section;
    if (view === 'brands' && elView === 'brands') {
      el.classList.add('nav-link--active');
      el.setAttribute('aria-current', 'page');
    } else if (view === 'home' && elSection === section) {
      el.classList.add('nav-link--active');
      el.setAttribute('aria-current', 'page');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════════════════════ */
function initEvents() {
  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const view    = link.dataset.view;
      const section = link.dataset.section;

      if (view === 'brands') {
        showView('brands');
        hideEl(dom.filterBar);
        renderBrandDirectory();
        setActiveNavLink('brands', null);
      } else if (view === 'home' && section) {
        State.section = section;
        showView('home');
        setActiveNavLink('home', section);
        if (State.articles.length) {
          renderHomeSection();
        } else {
          loadNews();
        }
      }
    });
  });

  // Refresh button
  dom.refreshBtn.addEventListener('click', () => { loadNews(true); });
  dom.staleRefreshBtn?.addEventListener('click', () => { loadNews(true); });
  dom.errorRetryBtn?.addEventListener('click', () => { loadNews(false); });

  // Filters
  dom.filterIndustry.addEventListener('change', () => {
    State.filterIndustry = dom.filterIndustry.value;
    renderHomeSection();
  });
  dom.filterCountry?.addEventListener('change', () => {
    State.filterCountry = dom.filterCountry.value;
    renderHomeSection();
  });
  dom.filterDate.addEventListener('change', () => {
    State.filterDate = dom.filterDate.value;
    renderHomeSection();
  });
  dom.filterClear.addEventListener('click', () => {
    State.filterIndustry = '';
    State.filterCountry  = '';
    State.filterDate     = '';
    dom.filterIndustry.value = '';
    if (dom.filterCountry) dom.filterCountry.value = '';
    dom.filterDate.value     = '';
    renderHomeSection();
  });

  // Search
  dom.searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = dom.searchInput.value.trim();
    if (q.length >= 2) doSearch(q);
  });

  // Brand tag clicks (delegated from articles container)
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-brand-id]');
    if (btn) {
      const brandId = btn.dataset.brandId;
      State.activeBrandId = brandId;
      showView('brand-profile');
      hideEl(dom.filterBar);
      setActiveNavLink(null, null);
      renderBrandProfile(brandId);
    }
    // Back button (handled inline in renderBrandProfile)
  });

  // Brand directory cards
  dom.brandDirectory.addEventListener('click', e => {
    const card = e.target.closest('[data-brand-id]');
    if (card) {
      const brandId = card.dataset.brandId;
      State.activeBrandId = brandId;
      showView('brand-profile');
      hideEl(dom.filterBar);
      setActiveNavLink(null, null);
      renderBrandProfile(brandId);
    }
  });
  // Quick Brand Filter Pills
  document.querySelectorAll('[data-brand-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-brand-filter]').forEach(b => b.classList.remove('brand-pill--active'));
      btn.classList.add('brand-pill--active');
      State.selectedBrandFilter = btn.dataset.brandFilter;
      renderHomeSection();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════════ */
async function init() {
  // Set publication date in masthead
  dom.pubDate.textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  initEvents();
  showView('home');
  setActiveNavLink('home', 'headlines');

  // Immediately render verified brand articles if available for instant 0ms load
  if (window.BASELINE_ARTICLES && Array.isArray(window.BASELINE_ARTICLES) && window.BASELINE_ARTICLES.length > 0) {
    State.articles = window.BASELINE_ARTICLES;
    State.fetchedAt = new Date().toISOString();
    // Also load press releases from baseline immediately
    if (window.BASELINE_PRESS_RELEASES && window.BASELINE_PRESS_RELEASES.length) {
      State.pressReleases = window.BASELINE_PRESS_RELEASES;
    }
    renderHomeSection();
    setStatus('ok');
  }

  // Load in parallel
  await Promise.all([loadBrandsData(), loadFeedsData(), loadPressReleases()]);
  await loadNews();

  // Auto-refresh every 15 minutes
  setInterval(() => {
    console.log('[App] Auto-refresh triggered.');
    loadNews(true);
    loadPressReleases();
  }, 15 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
