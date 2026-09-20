const routes = new Set(['matches', 'events', 'featured', 'rankings', 'players', 'model', 'picks']);
export function pageForHash(hash = '') {
  const page = hash.replace(/^#/, '');
  return page === 'myDeskLayer' ? 'picks' : routes.has(page) ? page : 'matches';
}

export function installProductNavigation({ onShow } = {}) {
  let current = '';
  const scrollPositions = new Map();
  function show(hash, { scroll = false, focus = false } = {}) {
    const page = pageForHash(hash);
    const changed = current !== page;
    if (changed && current) scrollPositions.set(current, window.scrollY);
    current = page;
    const group = ['rankings', 'players'].includes(page) ? 'teams' : page === 'featured' ? 'events' : page;
    document.body.dataset.productPage = page;
    document.querySelectorAll('[data-product-page]').forEach((section) => {
      section.hidden = section.dataset.productPage !== page && !(section.dataset.productPage === 'teams' && group === 'teams');
    });
    document.querySelectorAll('[data-page-link]').forEach((link) => {
      if (link.dataset.pageLink === group) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-browse-link]').forEach((link) => {
      if (link.dataset.browseLink === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (changed) onShow?.(page);
    if (scroll) window.scrollTo({ top: scrollPositions.get(page) || 0, behavior: 'instant' });
    if (focus) {
      const heading = document.querySelector(`[data-product-page="${page}"] h1, [data-product-page="${page}"] h2`);
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
    return page;
  }
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const hash = link.getAttribute('href');
    if (!routes.has(hash.slice(1)) && !['#top', '#dashboard'].includes(hash)) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.hash = pageForHash(hash);
    // Main navigation must not reopen a shared entity when the page is reloaded.
    if (link.closest('.top-nav, .mobile-dock, .brand, .browse-tabs, .site-footer')) {
      for (const key of ['match', 'event', 'view', 'team', 'player', 'compare', 'pickem', 'desk']) url.searchParams.delete(key);
    }
    history.pushState(null, '', url);
    show(url.hash, { scroll: true, focus: true });
  });
  window.addEventListener('hashchange', () => show(location.hash, { scroll: true, focus: true }));
  window.addEventListener('popstate', () => show(location.hash, { scroll: true, focus: true }));
  show(location.hash);
  return { show };
}
