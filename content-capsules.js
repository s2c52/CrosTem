// Star overlay on game capsules (images) across the whole Steam store:
// front page, sales, category pages, "more like this", etc.
(function () {
  'use strict';

  // Wishlist rows get their own inline badge (content-wishlist.js); overlaying
  // their capsule images too would duplicate the information.
  if (location.pathname.startsWith('/wishlist')) return;

  const APP_LINK = /\/app\/(\d+)/;

  function nameHint(a) {
    const img = a.querySelector('img[alt]');
    if (img && img.alt.trim().length > 1) return img.alt.trim();
    const aria = a.getAttribute('aria-label');
    if (aria && aria.trim().length > 1) return aria.trim();
    if (a.title && a.title.trim().length > 1) return a.title.trim();
    const tabName = a.querySelector('.tab_item_name');
    if (tabName) return tabName.textContent.trim();
    return null;
  }

  function processAnchor(a) {
    if (a.dataset.crostemCapsule) return;
    if (a.classList.contains('search_result_row')) return; // has inline badge
    if (a.closest('.crostem-box, .crostem-badge, .crostem-overlay')) return;

    const href = a.getAttribute('href') || '';
    const m = href.match(APP_LINK);
    if (!m) return;
    if (!a.querySelector('img, picture')) return; // only image capsules

    a.dataset.crostemCapsule = '1';
    a.classList.add('crostem-capsule-host');

    const overlay = document.createElement('span');
    overlay.className = 'crostem-overlay';
    a.appendChild(overlay);

    CWAuto.attach(overlay, {
      appid: m[1],
      name: nameHint(a),
      mode: 'overlay',
    });
  }

  function scan() {
    document.querySelectorAll('a[href*="/app/"]').forEach(processAnchor);
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 300);
  }

  scan();
  new MutationObserver(scheduleScan)
    .observe(document.body, { childList: true, subtree: true });
})();
