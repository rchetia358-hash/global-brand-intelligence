/**
 * Global Brand Intelligence — interactive city visual
 *
 * Builds accessible, responsive hotspots over the brand logos in the front-page image
 * (positions come from /data/city-hotspots.json, in IMAGE pixel coordinates, drawn in an SVG
 * whose viewBox equals the image size - so they scale with the image at any width) and shows
 * that brand's news from the last three hours when a logo is selected.
 *
 * Relies on globals from app.js: $, escHtml, formatDate, formatFullDate.
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const WINDOW_HOURS = 3;
  const REQUEST_TIMEOUT_MS = 30000;
  const AUTO_REFRESH_MS = 5 * 60 * 1000;

  let cfg = null;
  let active = null;          // { brandId, label }
  let lastTrigger = null;     // hotspot element that opened the panel (focus returns here)
  let token = 0;              // guards against out-of-order responses
  let autoTimer = null;

  const el = {};

  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');
  const clock = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  /* ── Hotspots ─────────────────────────────────────────────────────────── */
  async function buildHotspots() {
    try {
      const res = await fetch('/data/city-hotspots.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cfg = await res.json();
    } catch (e) {
      console.warn('[City] hotspot config unavailable:', e.message);
      return;
    }
    el.svg.setAttribute('viewBox', `0 0 ${cfg.image.width} ${cfg.image.height}`);
    el.svg.textContent = '';

    cfg.hotspots.forEach(h => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', 'hotspot');
      r.setAttribute('x', h.x); r.setAttribute('y', h.y);
      r.setAttribute('width', h.w); r.setAttribute('height', h.h);
      r.setAttribute('rx', 3);
      r.setAttribute('tabindex', '0');
      r.setAttribute('role', 'button');
      r.setAttribute('aria-label', `${h.label}: show news from the last ${WINDOW_HOURS} hours`);
      r.dataset.hotspot = h.id;
      r.dataset.brand = h.brandId;

      r.addEventListener('click', () => select(h, r));
      r.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(h, r); }
      });
      r.addEventListener('mouseenter', () => showTip(h));
      r.addEventListener('focus', () => showTip(h));
      r.addEventListener('mouseleave', hideTip);
      r.addEventListener('blur', hideTip);
      el.svg.appendChild(r);
    });
  }

  function showTip(h) {
    // Percent positions keep the tooltip attached to the logo at any rendered size
    el.tip.textContent = `${h.label} · news from the last ${WINDOW_HOURS} hours`;
    el.tip.style.left = `${((h.x + h.w / 2) / cfg.image.width) * 100}%`;
    el.tip.style.top = `${(h.y / cfg.image.height) * 100}%`;
    el.tip.hidden = false;
  }
  function hideTip() { el.tip.hidden = true; }

  function markActive() {
    el.svg.querySelectorAll('.hotspot').forEach(n =>
      n.classList.toggle('hotspot--active', !!active && n.dataset.brand === active.brandId));
  }

  /* ── Selection / panel ────────────────────────────────────────────────── */
  function select(h, trigger) {
    active = { brandId: h.brandId, label: h.label };
    lastTrigger = trigger;
    markActive();
    el.panel.hidden = false;
    el.title.textContent = h.label;
    el.kicker.textContent = `Brand news · last ${WINDOW_HOURS} hours`;
    load(false);
    el.panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.panel.focus({ preventScroll: true });
    clearInterval(autoTimer);
    autoTimer = setInterval(() => { if (active) load(false, true); }, AUTO_REFRESH_MS);
  }

  function back() {
    active = null;
    token++;                              // drop any in-flight response
    clearInterval(autoTimer);
    markActive();
    el.panel.hidden = true;
    el.body.textContent = '';
    el.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  }

  /* ── Loading & rendering (all states live inside the news panel) ──────── */
  async function load(refresh, silent) {
    const my = ++token;
    const brandId = active.brandId;
    if (!silent) {
      el.body.innerHTML = `
        <div class="bn-state" role="status">
          <div class="spinner" aria-hidden="true"></div>
          <span>Checking the latest ${escHtml(active.label)} news…</span>
        </div>`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `/api/brand-news/${encodeURIComponent(brandId)}?hours=${WINDOW_HOURS}${refresh ? '&refresh=true' : ''}`;
      const res = await fetch(url, { signal: ctrl.signal });
      let data = null;
      try { data = await res.json(); } catch { /* handled below */ }
      if (my !== token) return;           // user picked another brand meanwhile
      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.error) || `Server returned HTTP ${res.status}`);
      }
      render(data);
    } catch (err) {
      if (my !== token) return;
      const msg = err.name === 'AbortError'
        ? 'The news request timed out.'
        : (err.message === 'Failed to fetch' ? 'Could not reach the news server. Is it running?' : err.message);
      renderError(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  function renderError(message) {
    el.body.innerHTML = `
      <div class="bn-state bn-state--column bn-state--error" role="alert">
        <strong>Couldn't load ${escHtml(active.label)} news.</strong>
        <span>${escHtml(message)}</span>
        <button type="button" class="btn btn--primary btn--sm" id="bn-retry">Try again</button>
      </div>`;
    $('bn-retry').addEventListener('click', () => load(true));
  }

  function itemHtml(a, showFullDate) {
    const when = showFullDate
      ? formatFullDate(a.pubDate)
      : `${clock(a.pubDate)} · ${formatDate(a.pubDate)}`;
    const img = a.image
      ? `<img class="bn-item__img" src="${escHtml(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
              onerror="this.closest('.bn-item').classList.add('bn-item--noimg');this.remove()">`
      : '';
    return `
      <li class="bn-item ${a.image ? '' : 'bn-item--noimg'}">
        ${img}
        <div>
          <p class="bn-item__meta">
            <time class="bn-item__time" datetime="${escHtml(a.pubDate)}" title="${escHtml(formatFullDate(a.pubDate))}">${escHtml(when)}</time>
            <span>${escHtml(a.publisher)}</span>
            ${a.official ? '<span class="bn-item__badge">Official source</span>' : ''}
          </p>
          <h4 class="bn-item__headline">
            <a href="${escHtml(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${escHtml(a.title)}</a>
          </h4>
          ${a.summary ? `<p class="bn-item__summary">${escHtml(a.summary)}</p>` : ''}
        </div>
      </li>`;
  }

  function render(d) {
    el.title.textContent = d.brand.name;
    el.kicker.textContent = `Brand news · published since ${clock(d.windowStart)} (last ${d.windowHours} hours)`;

    if (d.allSourcesFailed) {
      const why = d.sources.map(s => `${s.name}: ${s.error || 'unreachable'}`).join(' · ');
      renderError(`None of the news sources could be reached from the server. ${why}`);
      return;
    }

    const failed = d.sources.filter(s => !s.ok);
    let html = '';

    if (d.recent.length) {
      html += `<ul class="bn-list">${d.recent.map(a => itemHtml(a, false)).join('')}</ul>`;
    } else {
      html += `
        <div class="bn-state bn-state--column" role="status">
          <strong>No new ${escHtml(d.brand.name)} articles in the last ${d.windowHours} hours.</strong>
          <span>Nothing about ${escHtml(d.brand.name)} was published between ${clock(d.windowStart)} and ${clock(d.generatedAt)} in the sources we check.${failed.length ? ' Some sources could not be reached, so this may be incomplete.' : ''}</span>
        </div>`;
    }

    if (d.older.length) {
      html += `
        <h4 class="bn-subhead">Latest available news <small>older than ${d.windowHours} hours — shown with actual publication dates</small></h4>
        <ul class="bn-list">${d.older.map(a => itemHtml(a, true)).join('')}</ul>`;
    }

    const srcLine = d.sources.map(s => s.ok ? `${escHtml(s.name)} (${s.count})` : `${escHtml(s.name)} (unavailable)`).join(' · ');
    const excl = d.excluded && d.excluded.withoutPublicationDate
      ? ` ${d.excluded.withoutPublicationDate} item(s) without a verifiable publication time were left out.` : '';
    html += `
      <p class="bn-footnote">
        Checked ${escHtml(clock(d.generatedAt))} · Sources: ${srcLine}.${excl}
        Times are the publication times reported by each source; headlines link to the original article. Summaries and images appear only where the source provides them.
      </p>`;

    el.body.innerHTML = html;
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  function init() {
    el.stage = $('city-stage'); el.svg = $('city-hotspots'); el.tip = $('city-tooltip');
    el.panel = $('brand-news'); el.body = $('brand-news-body');
    el.title = $('brand-news-title'); el.kicker = $('brand-news-kicker');
    if (!el.stage || !el.svg || !el.panel) return;

    $('brand-news-back').addEventListener('click', back);
    $('brand-news-refresh').addEventListener('click', () => { if (active) load(true); });
    el.panel.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });
    buildHotspots();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
