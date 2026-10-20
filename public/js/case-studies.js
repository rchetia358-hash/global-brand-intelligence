/**
 * Global Brand Intelligence — Case Studies Index & Detail Page Controller
 * Handles dynamic card rendering from CASE_STUDIES config, mobile menu toggle,
 * active nav highlighting, and sticky Table of Contents scroll-spy.
 */

'use strict';

(function () {
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 1. Masthead publication date
  const pubDateEl = document.getElementById('pub-date');
  if (pubDateEl) {
    pubDateEl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  // 2. Highlight "Case Studies" nav item on /case-studies and any page under it
  const path = window.location.pathname;
  if (path === '/case-studies' || path.startsWith('/case-studies/')) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const isCaseStudies = link.dataset.nav === 'case-studies' || link.getAttribute('href') === '/case-studies';
      link.classList.toggle('nav-link--active', isCaseStudies);
      if (isCaseStudies) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  // 3. Mobile menu toggle
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const navList = document.getElementById('main-nav-list');
  if (mobileToggle && navList) {
    mobileToggle.addEventListener('click', () => {
      const expanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', String(!expanded));
      navList.classList.toggle('nav-bar__sections--open', !expanded);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mobileToggle.getAttribute('aria-expanded') === 'true') {
        mobileToggle.setAttribute('aria-expanded', 'false');
        navList.classList.remove('nav-bar__sections--open');
        mobileToggle.focus();
      }
    });
  }

  // 4. Render Case Studies Grid from window.CASE_STUDIES config array
  const gridEl = document.getElementById('case-studies-grid');
  if (gridEl && Array.isArray(window.CASE_STUDIES) && window.CASE_STUDIES.length > 0) {
    gridEl.innerHTML = window.CASE_STUDIES.map(cs => {
      const tagsHtml = (cs.tags || [])
        .map(tag => `<li class="cs-tag">${escHtml(tag)}</li>`)
        .join('');
      return `
        <article class="cs-card">
          <div class="cs-card__media">
            <img
              src="${escHtml(cs.coverImage)}"
              alt="${escHtml(cs.coverAlt || cs.title)}"
              class="cs-card__img"
              width="800"
              height="480"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="cs-card__body">
            <div class="cs-card__badge-row">
              <span class="cs-badge cs-badge--green">${escHtml(cs.badge)}</span>
            </div>
            <h2 class="cs-card__title">
              <a href="${escHtml(cs.slug)}" class="cs-card__link">${escHtml(cs.title)}</a>
            </h2>
            <p class="cs-card__subtitle">${escHtml(cs.subtitle)}</p>
            <p class="cs-card__desc">${escHtml(cs.description)}</p>
            <ul class="cs-card__tags" aria-label="Key topics">
              ${tagsHtml}
            </ul>
            <div class="cs-card__footer">
              <span class="cs-card__cta" aria-hidden="true">
                ${escHtml(cs.ctaText || 'Read case study')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </span>
            </div>
          </div>
        </article>
      `.trim();
    }).join('');
  }

  // 5. Sticky Table of Contents scroll-spy on detail page
  const tocEl = document.getElementById('cs-toc');
  if (tocEl) {
    const tocLinks = Array.from(tocEl.querySelectorAll('.cs-toc__link'));
    const sections = tocLinks
      .map(link => {
        const id = (link.getAttribute('href') || '').replace(/^#/, '');
        return document.getElementById(id);
      })
      .filter(Boolean);

    function setActiveToc(activeId) {
      tocLinks.forEach(link => {
        const isMatch = link.getAttribute('href') === `#${activeId}`;
        link.classList.toggle('cs-toc__link--active', isMatch);
        if (isMatch) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    if (sections.length > 0) {
      const updateOnScroll = () => {
        const threshold = 160;
        let current = sections[0].id;
        for (const sec of sections) {
          const rect = sec.getBoundingClientRect();
          if (rect.top <= threshold) {
            current = sec.id;
          }
        }
        // If scrolled to the very bottom of the page, highlight the last item
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 40) {
          current = sections[sections.length - 1].id;
        }
        setActiveToc(current);
      };

      window.addEventListener('scroll', updateOnScroll, { passive: true });
      updateOnScroll();
    }
  }
})();
